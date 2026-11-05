<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use App\Config\Env;

Env::load(dirname(__DIR__));
date_default_timezone_set((string) Env::get('APP_TIMEZONE', 'UTC'));
