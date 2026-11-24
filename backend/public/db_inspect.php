<?php

declare(strict_types=1);

use App\Config\Env;
use App\Database\Connection;
use App\Support\Jwt;

require __DIR__ . '/../vendor/autoload.php';

$basePath = dirname(__DIR__);
Env::load($basePath);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Authorization, Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Require Admin JWT Auth
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (!preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Authorization header required']);
    exit;
}

try {
    $secret = (string) Env::get('JWT_SECRET', '');
    $payload = Jwt::decode($m[1], $secret);
    if (($payload['role'] ?? '') !== 'admin') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Admin role required']);
        exit;
    }
} catch (\Throwable $e) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Invalid or expired token']);
    exit;
}

try {
    $db = Connection::get();

    // 1. Safe non-sensitive database identity
    $dbHost = (string) Env::get('DB_HOST', '127.0.0.1');
    $dbPort = (string) Env::get('DB_PORT', '3306');
    $dbName = (string) Env::get('DB_DATABASE', 'tamarind_court');
    $serverHost = (string) $db->query('SELECT @@hostname')->fetchColumn();
    $currentDb = (string) $db->query('SELECT DATABASE()')->fetchColumn();
    $dbVersion = (string) $db->query('SELECT VERSION()')->fetchColumn();

    // 2. Table counts
    $tables = [
        'reservations', 'stays', 'invoices', 'payments', 'stay_charges',
        'guests', 'occupants', 'occupant_documents', 'housekeeping_logs', 'audit_logs',
        'rooms', 'room_types', 'users', 'hotels', 'settings', 'roles', 'refresh_tokens', 'login_attempts'
    ];

    $counts = [];
    foreach ($tables as $tbl) {
        try {
            $counts[$tbl] = (int) $db->query("SELECT COUNT(*) FROM `$tbl`")->fetchColumn();
        } catch (\Throwable $e) {
            $counts[$tbl] = -1;
        }
    }

    // 3. Dry-run transaction (NEVER commits - always rolls back)
    $db->beginTransaction();
    $dryRunResults = [];
    try {
        $dryRunResults['occupant_documents'] = $db->exec("DELETE FROM occupant_documents");
        $dryRunResults['occupants'] = $db->exec("DELETE FROM occupants");
        $dryRunResults['stay_charges'] = $db->exec("DELETE FROM stay_charges");
        $dryRunResults['invoices'] = $db->exec("DELETE FROM invoices");
        $dryRunResults['payments'] = $db->exec("DELETE FROM payments");
        $dryRunResults['stays'] = $db->exec("DELETE FROM stays");
        $dryRunResults['reservations'] = $db->exec("DELETE FROM reservations");
        $dryRunResults['guests'] = $db->exec("DELETE FROM guests");
        $dryRunResults['housekeeping_logs'] = $db->exec("DELETE FROM housekeeping_logs");
        $dryRunResults['audit_logs (transactions)'] = $db->exec("DELETE FROM audit_logs WHERE entity_type IN ('stay', 'reservation', 'guest')");
        $dryRunResults['rooms_reset_from_cleaning'] = $db->exec("UPDATE rooms SET housekeeping_status = 'ok', note = NULL WHERE housekeeping_status = 'cleaning'");
        $db->rollBack();
        $dryRunStatus = 'success_dry_run_rolled_back';
    } catch (\Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $dryRunStatus = 'failed: ' . $e->getMessage();
    }

    // 4. Room status breakdown
    $roomStatuses = $db->query("SELECT housekeeping_status, COUNT(*) as cnt FROM rooms GROUP BY housekeeping_status")->fetchAll(PDO::FETCH_KEY_PAIR);

    // 5. Repair rooms inspection (to preserve legitimate repairs)
    $repairRooms = $db->query("SELECT room_no, housekeeping_status, note FROM rooms WHERE housekeeping_status = 'repair'")->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'database_identity' => [
            'env_db_host' => $dbHost,
            'env_db_port' => $dbPort,
            'env_db_name' => $dbName,
            'server_hostname' => $serverHost,
            'active_database' => $currentDb,
            'mysql_version' => $dbVersion,
        ],
        'current_table_counts' => $counts,
        'current_room_housekeeping_counts' => $roomStatuses,
        'legitimate_repair_rooms' => $repairRooms,
        'dry_run_deletion_simulation' => [
            'status' => $dryRunStatus,
            'records_to_be_deleted' => $dryRunResults,
            'master_tables_to_preserve' => [
                'hotels' => $counts['hotels'],
                'settings' => $counts['settings'],
                'roles' => $counts['roles'],
                'users' => $counts['users'],
                'room_types' => $counts['room_types'],
                'rooms' => $counts['rooms'],
                'refresh_tokens' => $counts['refresh_tokens'],
                'login_attempts' => $counts['login_attempts'],
            ]
        ]
    ], JSON_PRETTY_PRINT);

} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
