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
header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Maintenance-Key');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Security: Require Admin JWT Auth OR Maintenance Secret Key
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$maintenanceKeyHeader = $_SERVER['HTTP_X_MAINTENANCE_KEY'] ?? ($_GET['key'] ?? '');
$authorized = false;
$authReason = '';

// Check 1: Valid Maintenance Secret Key (matches JWT_SECRET)
$expectedKey = (string) Env::get('JWT_SECRET', '');
if ($maintenanceKeyHeader !== '' && hash_equals($expectedKey, $maintenanceKeyHeader)) {
    $authorized = true;
    $authReason = 'maintenance_key';
}

// Check 2: Admin JWT
if (!$authorized && preg_match('/^Bearer\s+(.+)$/i', $authHeader, $m)) {
    try {
        $payload = Jwt::decode($m[1], $expectedKey);
        if (($payload['role'] ?? '') === 'admin') {
            $authorized = true;
            $authReason = 'admin_jwt';
        }
    } catch (\Throwable $e) {
        // Fall through to unauthorized
    }
}

if (!$authorized) {
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'Unauthorized: Valid Admin JWT or X-Maintenance-Key required'
    ]);
    exit;
}

try {
    $db = Connection::get();

    // 1. Database identity
    $envHost = (string) Env::get('DB_HOST', '127.0.0.1');
    $envPort = (string) Env::get('DB_PORT', '3306');
    $envDb   = (string) Env::get('DB_DATABASE', 'tamarind_court');
    $serverHostname = (string) $db->query('SELECT @@hostname')->fetchColumn();
    $currentDb      = (string) $db->query('SELECT DATABASE()')->fetchColumn();
    $mysqlVersion   = (string) $db->query('SELECT VERSION()')->fetchColumn();

    $mode = $_GET['mode'] ?? 'info';

    // Fetch all current tables dynamically
    $allDbTables = $db->query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")->fetchAll(PDO::FETCH_COLUMN);

    // MODE: EXPORT BACKUP
    if ($mode === 'export_backup') {
        $backupData = [
            'meta' => [
                'timestamp' => date('c'),
                'env_host' => $envHost,
                'env_port' => $envPort,
                'env_database' => $envDb,
                'server_hostname' => $serverHostname,
                'active_database' => $currentDb,
                'mysql_version' => $mysqlVersion,
            ],
            'schemas' => [],
            'tables' => [],
            'row_counts' => [],
        ];

        foreach ($allDbTables as $t) {
            $createStmt = $db->query("SHOW CREATE TABLE `$t`")->fetch(PDO::FETCH_NUM);
            $backupData['schemas'][$t] = $createStmt[1] ?? '';
            $rows = $db->query("SELECT * FROM `$t`")->fetchAll(PDO::FETCH_ASSOC);
            $backupData['tables'][$t] = $rows;
            $backupData['row_counts'][$t] = count($rows);
        }

        echo json_encode([
            'success' => true,
            'mode' => 'export_backup',
            'backup' => $backupData
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Function to get table counts
    $getTableCounts = function() use ($db, $allDbTables): array {
        $counts = [];
        foreach ($allDbTables as $tbl) {
            try {
                $counts[$tbl] = (int) $db->query("SELECT COUNT(*) FROM `$tbl`")->fetchColumn();
            } catch (\Throwable $e) {
                $counts[$tbl] = -1;
            }
        }
        return $counts;
    };

    // MODE: INFO
    if ($mode === 'info') {
        $counts = $getTableCounts();
        echo json_encode([
            'success' => true,
            'mode' => 'info',
            'database_identity' => [
                'env_host' => $envHost,
                'env_port' => $envPort,
                'env_database' => $envDb,
                'server_hostname' => $serverHostname,
                'active_database' => $currentDb,
                'mysql_version' => $mysqlVersion,
            ],
            'table_counts' => $counts,
            'preserved_configuration' => [
                'hotels' => $db->query("SELECT id, name, gstin, phone, email FROM hotels")->fetchAll(PDO::FETCH_ASSOC),
                'settings' => $db->query("SELECT id, hotel_id, gst_slab1_max_rate, gst_slab1_gst_rate, gst_slab2_max_rate, gst_slab2_gst_rate, gst_slab3_gst_rate, checkout_hour FROM settings")->fetchAll(PDO::FETCH_ASSOC),
                'roles' => $db->query("SELECT id, code, name FROM roles")->fetchAll(PDO::FETCH_ASSOC),
                'users' => $db->query("SELECT id, hotel_id, role_id, username, email, is_active FROM users")->fetchAll(PDO::FETCH_ASSOC),
            ]
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // Execution sequence function
    $executeSequence = function() use ($db, $basePath): array {
        $results = [];

        // 1. occupant_documents
        $results['occupant_documents'] = $db->exec("DELETE FROM occupant_documents");

        // 2. occupants
        $results['occupants'] = $db->exec("DELETE FROM occupants");

        // 3. stay_charges
        $results['stay_charges'] = $db->exec("DELETE FROM stay_charges");

        // 4. invoices (FK on stays with ON DELETE RESTRICT)
        $results['invoices'] = $db->exec("DELETE FROM invoices");

        // 5. payments (break self-referencing parent_payment_id FK first)
        $db->exec("UPDATE payments SET parent_payment_id = NULL WHERE parent_payment_id IS NOT NULL");
        $results['payments'] = $db->exec("DELETE FROM payments");

        // 6. stays (FK on rooms, guests, reservations)
        $results['stays'] = $db->exec("DELETE FROM stays");

        // 7. reservations (FK on rooms, guests)
        $results['reservations'] = $db->exec("DELETE FROM reservations");

        // 8. guests
        $results['guests'] = $db->exec("DELETE FROM guests");

        // 9. housekeeping_logs (FK on rooms)
        $results['housekeeping_logs'] = $db->exec("DELETE FROM housekeeping_logs");

        // 10. rooms (FK on room_types)
        $results['rooms'] = $db->exec("DELETE FROM rooms");

        // 11. room_types
        $results['room_types'] = $db->exec("DELETE FROM room_types");

        // 12. audit_logs for deleted transaction & room entities
        $results['audit_logs (deleted entities)'] = $db->exec(
            "DELETE FROM audit_logs WHERE entity_type IN ('stay', 'reservation', 'guest', 'room')"
        );

        // 13. Clean uploaded physical files
        $cleanedFiles = 0;
        $cleanDir = function(string $dir) use (&$cleanedFiles): void {
            if (is_dir($dir)) {
                $files = scandir($dir);
                foreach ($files as $f) {
                    if ($f === '.' || $f === '..' || $f === '.gitkeep') {
                        continue;
                    }
                    $path = $dir . '/' . $f;
                    if (is_file($path)) {
                        unlink($path);
                        $cleanedFiles++;
                    }
                }
            }
        };

        $cleanDir($basePath . '/storage/uploads/occupants');
        $cleanDir($basePath . '/storage/uploads/guests');
        $results['physical_upload_files_deleted'] = $cleanedFiles;

        return $results;
    };

    // MODE: DRY RUN
    if ($mode === 'dry_run') {
        $db->beginTransaction();
        $dryRunResults = [];
        try {
            $dryRunResults = $executeSequence();
            $db->rollBack();
            $dryRunStatus = 'success_dry_run_rolled_back';
        } catch (\Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $dryRunStatus = 'failed: ' . $e->getMessage();
        }

        echo json_encode([
            'success' => true,
            'mode' => 'dry_run',
            'dry_run_status' => $dryRunStatus,
            'database_identity' => [
                'server_hostname' => $serverHostname,
                'active_database' => $currentDb,
            ],
            'records_to_be_deleted' => $dryRunResults,
            'current_table_counts' => $getTableCounts()
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // MODE: EXECUTE RESET
    if ($mode === 'execute_reset') {
        $confirm = $_POST['confirm'] ?? $_GET['confirm'] ?? '';
        if ($confirm !== 'CONFIRM_RESET_HOTEL_DATABASE_2026') {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Missing or invalid confirmation token. Expected: CONFIRM_RESET_HOTEL_DATABASE_2026'
            ]);
            exit;
        }

        $db->beginTransaction();
        $executionResults = [];
        try {
            $executionResults = $executeSequence();
            $db->commit();
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
        $postCounts = $getTableCounts();

        echo json_encode([
            'success' => true,
            'mode' => 'execute_reset',
            'operation' => 'DATABASE_RESET_EXECUTED_AND_COMMITTED',
            'database_identity' => [
                'server_hostname' => $serverHostname,
                'active_database' => $currentDb,
                'env_host' => $envHost,
            ],
            'executed_deletion_summary' => $executionResults,
            'post_cleanup_table_counts' => $postCounts,
            'preserved_configuration_verification' => [
                'hotels' => (int) $db->query("SELECT COUNT(*) FROM hotels")->fetchColumn(),
                'settings' => (int) $db->query("SELECT COUNT(*) FROM settings")->fetchColumn(),
                'roles' => (int) $db->query("SELECT COUNT(*) FROM roles")->fetchColumn(),
                'users' => (int) $db->query("SELECT COUNT(*) FROM users")->fetchColumn(),
            ]
        ], JSON_PRETTY_PRINT);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => "Unknown mode: {$mode}"]);

} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
