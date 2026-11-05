<?php

declare(strict_types=1);

namespace App\Router;

use App\Support\ApiException;
use App\Support\Response;

final class Router
{
    /** @var array<int,array{method:string,pattern:string,regex:string,params:string[],handler:callable,middleware:callable[]}> */
    private array $routes = [];

    /** @param callable[] $middleware */
    public function get(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('GET', $pattern, $handler, $middleware);
    }

    /** @param callable[] $middleware */
    public function post(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('POST', $pattern, $handler, $middleware);
    }

    /** @param callable[] $middleware */
    public function put(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('PUT', $pattern, $handler, $middleware);
    }

    /** @param callable[] $middleware */
    public function patch(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('PATCH', $pattern, $handler, $middleware);
    }

    /** @param callable[] $middleware */
    public function delete(string $pattern, callable $handler, array $middleware = []): void
    {
        $this->add('DELETE', $pattern, $handler, $middleware);
    }

    /** @param callable[] $middleware */
    private function add(string $method, string $pattern, callable $handler, array $middleware): void
    {
        $params = [];
        $regex = preg_replace_callback('/\{(\w+)\}/', function ($m) use (&$params) {
            $params[] = $m[1];
            return '([^/]+)';
        }, $pattern);
        $this->routes[] = [
            'method' => $method,
            'pattern' => $pattern,
            'regex' => '#^' . $regex . '$#',
            'params' => $params,
            'handler' => $handler,
            'middleware' => $middleware,
        ];
    }

    public function dispatch(Request $request): void
    {
        $allowedMethods = [];
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $matches)) {
                continue;
            }
            if ($route['method'] !== $request->method) {
                $allowedMethods[] = $route['method'];
                continue;
            }
            $values = array_slice($matches, 1);
            $request->routeParams = array_combine($route['params'], $values) ?: [];

            foreach ($route['middleware'] as $middleware) {
                $middleware($request);
            }

            $result = ($route['handler'])($request);
            if ($result !== null) {
                Response::success($result);
            }
            return;
        }

        if ($allowedMethods !== []) {
            throw new ApiException('Method not allowed.', 405, 'method_not_allowed');
        }
        throw ApiException::notFound('No such endpoint.');
    }
}
