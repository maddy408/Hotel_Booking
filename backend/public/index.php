<?php

declare(strict_types=1);

use App\Config\Env;
use App\Database\Connection;
use App\Router\Request;
use App\Router\Router;
use App\Support\Cors;
use App\Support\ErrorHandler;

require __DIR__ . '/../vendor/autoload.php';

$basePath = dirname(__DIR__);
Env::load($basePath);
date_default_timezone_set((string) Env::get('APP_TIMEZONE', 'UTC'));
error_reporting(E_ALL);
ini_set('display_errors', Env::bool('APP_DEBUG', false) ? '1' : '0');

ErrorHandler::register();
Cors::handle();

$db = Connection::get();
$router = new Router();
(require $basePath . '/src/routes.php')($router, $db);

$router->dispatch(Request::fromGlobals());
