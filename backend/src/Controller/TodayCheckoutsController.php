<?php

declare(strict_types=1);

namespace App\Controller;

use App\Router\Request;
use App\Service\TodayCheckoutsService;

final class TodayCheckoutsController
{
    public function __construct(
        private readonly TodayCheckoutsService $todayCheckouts,
    ) {
    }

    public function index(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        return $this->todayCheckouts->getTodayCheckouts($hotelId);
    }
}

