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

    $mode = $_GET['mode'] ?? 'dry_run';

    // MODE: EXPORT BACKUP
    if ($mode === 'export_backup') {
        $tablesToDump = [
            'hotels', 'settings', 'roles', 'users', 'room_types', 'rooms',
            'guests', 'reservations', 'stays', 'occupants', 'occupant_documents',
            'stay_charges', 'payments', 'invoices', 'housekeeping_logs'
        ];
        $dump = [];
        foreach ($tablesToDump as $t) {
            $dump[$t] = $db->query("SELECT * FROM `$t`")->fetchAll(PDO::FETCH_ASSOC);
        }
        echo json_encode([
            'success' => true,
            'backup_timestamp' => date('c'),
            'database' => $currentDb,
            'host' => $dbHost,
            'dump' => $dump
        ]);
        exit;
    }

    // MODE: RESTORE ROOM STATUSES (48 OK, ROOMS 201 & 207 REPAIR)
    if ($mode === 'restore_repair_rooms') {
        $r1 = $db->exec("UPDATE rooms SET housekeeping_status = 'ok', note = NULL WHERE room_no NOT IN (201, 207)");
        $r2 = $db->exec("UPDATE rooms SET housekeeping_status = 'repair', note = 'Problem not written' WHERE room_no IN (201, 207)");
        echo json_encode([
            'success' => true,
            'rooms_reset_to_ok' => $r1,
            'rooms_restored_to_repair' => $r2,
            'current_repairs' => $db->query("SELECT room_no, housekeeping_status, note FROM rooms WHERE housekeeping_status = 'repair'")->fetchAll(PDO::FETCH_ASSOC)
        ]);
        exit;
    }

    // Table counts
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

    // MODE: EXECUTE PRODUCTION CLEANUP (REQUIRES CONFIRMATION TOKEN)
    if ($mode === 'execute_production_cleanup') {
        $confirm = $_POST['confirm'] ?? $_GET['confirm'] ?? '';
        if ($confirm !== 'CONFIRM_CLEAN_TAMARIND_COURT_PRODUCTION_2026') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Missing or invalid confirmation token for execution'
            ]);
            exit;
        }

        $db->beginTransaction();
        $executionResults = [];
        try {
            // 1. occupant_documents
            $executionResults['occupant_documents'] = $db->exec("DELETE FROM occupant_documents");

            // 2. occupants
            $executionResults['occupants'] = $db->exec("DELETE FROM occupants");

            // 3. stay_charges
            $executionResults['stay_charges'] = $db->exec("DELETE FROM stay_charges");

            // 4. invoices (must precede stays due to ON DELETE RESTRICT)
            $executionResults['invoices'] = $db->exec("DELETE FROM invoices");

            // 5. payments
            $executionResults['payments'] = $db->exec("DELETE FROM payments");

            // 6. stays
            $executionResults['stays'] = $db->exec("DELETE FROM stays");

            // 7. reservations
            $executionResults['reservations'] = $db->exec("DELETE FROM reservations");

            // 8. guests
            $executionResults['guests'] = $db->exec("DELETE FROM guests");

            // 9. housekeeping_logs
            $executionResults['housekeeping_logs'] = $db->exec("DELETE FROM housekeeping_logs");

            // 10. audit_logs (transactional events)
            $executionResults['audit_logs'] = $db->exec("DELETE FROM audit_logs WHERE entity_type IN ('stay', 'reservation', 'guest')");

            // 11. Reset rooms:
            // Reset all rooms except 201 and 207 to 'ok' with note = NULL
            $executionResults['rooms_reset_to_ok'] = $db->exec("UPDATE rooms SET housekeeping_status = 'ok', note = NULL WHERE room_no NOT IN (201, 207)");

            // Preserve / restore legitimate repairs for Rooms 201 and 207
            $executionResults['rooms_restored_to_repair'] = $db->exec("UPDATE rooms SET housekeeping_status = 'repair', note = 'Problem not written' WHERE room_no IN (201, 207)");

            // COMMIT TRANSACTION
            $db->commit();
            $executionStatus = 'success_committed';

            // Clean physical occupant files from storage on disk (preserve .gitkeep)
            $uploadsDir = dirname(__DIR__) . '/storage/uploads/occupants';
            $cleanedFiles = 0;
            if (is_dir($uploadsDir)) {
                $dirFiles = scandir($uploadsDir);
                foreach ($dirFiles as $f) {
                    if ($f === '.' || $f === '..' || $f === '.gitkeep') {
                        continue;
                    }
                    $fPath = $uploadsDir . '/' . $f;
                    if (is_file($fPath)) {
                        unlink($fPath);
                        $cleanedFiles++;
                    }
                }
            }
            $executionResults['physical_document_files_deleted'] = $cleanedFiles;

        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Transaction failed and was rolled back: ' . $e->getMessage()
            ]);
            exit;
        }

        // Fetch post-cleanup counts
        $postCounts = [];
        foreach ($tables as $tbl) {
            $postCounts[$tbl] = (int) $db->query("SELECT COUNT(*) FROM `$tbl`")->fetchColumn();
        }

        $postRoomStatuses = $db->query("SELECT housekeeping_status, COUNT(*) as cnt FROM rooms GROUP BY housekeeping_status")->fetchAll(PDO::FETCH_KEY_PAIR);
        $preservedRepairRooms = $db->query("SELECT room_no, housekeeping_status, note FROM rooms WHERE housekeeping_status = 'repair'")->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'operation' => 'PRODUCTION_DATABASE_CLEANUP_EXECUTED',
            'database_identity' => [
                'env_db_host' => $dbHost,
                'env_db_name' => $dbName,
                'server_hostname' => $serverHost,
            ],
            'executed_deletion_summary' => $executionResults,
            'post_cleanup_table_counts' => $postCounts,
            'post_cleanup_room_housekeeping_counts' => $postRoomStatuses,
            'preserved_repair_rooms' => $preservedRepairRooms,
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // DEFAULT MODE: DRY RUN SIMULATION (ALWAYS ROLLS BACK)
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
        $dryRunResults['rooms_reset_to_ok'] = $db->exec("UPDATE rooms SET housekeeping_status = 'ok', note = NULL WHERE room_no NOT IN (201, 207)");
        $dryRunResults['rooms_restored_to_repair'] = $db->exec("UPDATE rooms SET housekeeping_status = 'repair', note = 'Problem not written' WHERE room_no IN (201, 207)");
        $db->rollBack();
        $dryRunStatus = 'success_dry_run_rolled_back';
    } catch (\Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $dryRunStatus = 'failed: ' . $e->getMessage();
    }

    $roomStatuses = $db->query("SELECT housekeeping_status, COUNT(*) as cnt FROM rooms GROUP BY housekeeping_status")->fetchAll(PDO::FETCH_KEY_PAIR);
    $repairRooms = $db->query("SELECT room_no, housekeeping_status, note FROM rooms WHERE housekeeping_status = 'repair'")->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'mode' => 'dry_run',
        'database_identity' => [
            'env_db_host' => $dbHost,
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
