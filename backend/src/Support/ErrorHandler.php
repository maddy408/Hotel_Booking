<?php

declare(strict_types=1);

namespace App\Support;

use App\Config\Env;

final class ErrorHandler
{
    public static function register(): void
    {
        set_exception_handler(static function (\Throwable $e): void {
            if (ob_get_level() > 0) {
                ob_clean();
            }
            if ($e instanceof ApiException) {
                Response::error($e->getMessage(), $e->getStatus(), $e->getErrorCode(), $e->getFields());
                return;
            }
            error_log('[tamarind-court] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            $debug = Env::bool('APP_DEBUG', false);
            Response::error(
                $debug ? $e->getMessage() : 'Something went wrong. Please try again.',
                500,
                'server_error',
            );
        });

        set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
            throw new \ErrorException($message, 0, $severity, $file, $line);
        });
    }
}
