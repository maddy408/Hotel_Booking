<?php

declare(strict_types=1);

namespace App\Database;

use App\Config\Env;
use PDO;

final class Connection
{
    private static ?PDO $pdo = null;

    public static function get(): PDO
    {
        if (self::$pdo === null) {
            $host = Env::get('DB_HOST', '127.0.0.1');
            $port = Env::get('DB_PORT', '3306');
            $db   = Env::get('DB_DATABASE', 'tamarind_court');
            $dsn  = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";

            self::$pdo = new PDO($dsn, Env::get('DB_USERNAME', 'root'), Env::get('DB_PASSWORD', ''), [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        }
        return self::$pdo;
    }

    /** For tests: force a fresh connection (e.g. to a different DSN). */
    public static function reset(): void
    {
        self::$pdo = null;
    }
}
