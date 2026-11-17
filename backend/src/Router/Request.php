<?php

declare(strict_types=1);

namespace App\Router;

final class Request
{
    /** @var array<string,string> */
    public array $routeParams = [];

    /** @var array<string,mixed> middleware-populated context (e.g. authenticated user) */
    private array $attributes = [];

    /**
     * @param array<string,mixed> $query
     * @param array<string,mixed> $body
     * @param array<string,string> $headers
     * @param array<string,mixed> $files
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $body,
        public readonly array $headers,
        public readonly string $ip,
        public readonly array $files = [],
    ) {
    }

    public static function fromGlobals(): self
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // Strip the backend's own base path (e.g. /tamarind-court/backend/public) so routes
        // are defined relative to the front controller. Only trust SCRIPT_NAME when it still
        // points at the front controller itself — PHP's built-in dev server rewrites SCRIPT_NAME
        // to the *requested* path (not index.php) for URIs that look like static files (e.g.
        // anything with a dot, like /reports/invoices.csv), which would otherwise corrupt this.
        $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
        $scriptDir = str_ends_with($scriptName, '.php') ? str_replace('\\', '/', dirname($scriptName)) : '';
        if ($scriptDir !== '/' && $scriptDir !== '' && str_starts_with($path, $scriptDir)) {
            $path = substr($path, strlen($scriptDir));
        }
        $path = '/' . trim($path, '/');

        $rawBody = file_get_contents('php://input') ?: '';
        $body = [];
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if ($rawBody !== '' && str_contains($contentType, 'application/json')) {
            $decoded = json_decode($rawBody, true);
            $body = is_array($decoded) ? $decoded : [];
        } elseif ($_POST !== []) {
            $body = $_POST;
        }

        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with($key, 'HTTP_')) {
                $name = str_replace('_', '-', substr($key, 5));
                $headers[$name] = (string) $value;
            }
        }
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $headers['AUTHORIZATION'] = (string) $_SERVER['HTTP_AUTHORIZATION'];
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $headers['AUTHORIZATION'] = (string) $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
        } elseif (function_exists('apache_request_headers')) {
            $apacheHeaders = apache_request_headers();
            if (isset($apacheHeaders['Authorization'])) {
                $headers['AUTHORIZATION'] = (string) $apacheHeaders['Authorization'];
            } elseif (isset($apacheHeaders['authorization'])) {
                $headers['AUTHORIZATION'] = (string) $apacheHeaders['authorization'];
            }
        }

        return new self(
            method: strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            path: $path,
            query: $_GET,
            body: $body,
            headers: $headers,
            ip: $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0',
            files: $_FILES,
        );
    }

    public function file(string $key): mixed
    {
        if (array_key_exists($key, $this->files)) {
            return $this->files[$key];
        }
        $stripped = rtrim($key, '[]');
        if (array_key_exists($stripped, $this->files)) {
            return $this->files[$stripped];
        }
        if (array_key_exists($stripped . '[]', $this->files)) {
            return $this->files[$stripped . '[]'];
        }
        return null;
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtoupper($name)] ?? null;
    }

    public function bearerToken(): ?string
    {
        $auth = $this->header('AUTHORIZATION') ?? '';
        return str_starts_with($auth, 'Bearer ') ? substr($auth, 7) : null;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        if (array_key_exists($key, $this->body)) {
            return $this->body[$key];
        }
        if (array_key_exists($key, $this->query)) {
            return $this->query[$key];
        }
        $stripped = rtrim($key, '[]');
        if (array_key_exists($stripped, $this->body)) {
            return $this->body[$stripped];
        }
        if (array_key_exists($stripped, $this->query)) {
            return $this->query[$stripped];
        }
        if (array_key_exists($stripped . '[]', $this->body)) {
            return $this->body[$stripped . '[]'];
        }
        if (array_key_exists($stripped . '[]', $this->query)) {
            return $this->query[$stripped . '[]'];
        }
        return $default;
    }

    public function all(): array
    {
        return array_merge($this->query, $this->body);
    }

    public function setAttribute(string $key, mixed $value): void
    {
        $this->attributes[$key] = $value;
    }

    public function attribute(string $key, mixed $default = null): mixed
    {
        return $this->attributes[$key] ?? $default;
    }
}
