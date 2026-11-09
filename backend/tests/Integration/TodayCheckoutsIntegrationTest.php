<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Controller\SettingsController;
use App\Repository\HotelRepository;
use App\Repository\SettingsRepository;
use App\Router\Request;
use App\Service\TodayCheckoutsService;
use PDO;
use PHPUnit\Framework\TestCase;

final class TodayCheckoutsIntegrationTest extends TestCase
{
    private PDO $db;
    private TodayCheckoutsService $service;
    private SettingsRepository $settingsRepo;
    private HotelRepository $hotelRepo;

    protected function setUp(): void
    {
        $this->db = \App\Database\Connection::get();
        $this->db->beginTransaction();

        $this->hotelRepo = new HotelRepository($this->db);
        $this->settingsRepo = new SettingsRepository($this->db);
        $this->service = new TodayCheckoutsService($this->db, $this->hotelRepo, $this->settingsRepo);
    }

    protected function tearDown(): void
    {
        $this->db->rollBack();
    }

    public function testGetTodayCheckoutsReturnsCorrectStructureAndData(): void
    {
        // Ensure at least one checkout scheduled for today exists in the transaction
        $hasToday = (int) $this->db->query("SELECT COUNT(*) FROM stays WHERE hotel_id = 1 AND ((status = 'in_house' AND checkout_planned = CURDATE()) OR (status = 'checked_out' AND checkout_actual = CURDATE()))")->fetchColumn();
        if ($hasToday === 0) {
            $guestId = (int) $this->db->query('SELECT id FROM guests LIMIT 1')->fetchColumn();
            $roomId = (int) $this->db->query("SELECT id FROM rooms WHERE hotel_id = 1 AND id NOT IN (SELECT room_id FROM stays WHERE status = 'in_house') LIMIT 1")->fetchColumn();
            $this->db->prepare("INSERT INTO stays (hotel_id, room_id, guest_id, persons, rate, check_in_date, checkout_planned, status) VALUES (1, :r, :g, 1, 2200, DATE_SUB(CURDATE(), INTERVAL 1 DAY), CURDATE(), 'in_house')")
                ->execute(['r' => $roomId, 'g' => $guestId]);
        }

        $result = $this->service->getTodayCheckouts(1);

        $this->assertArrayHasKey('hotel', $result);
        $this->assertArrayHasKey('timezone', $result);
        $this->assertArrayHasKey('today', $result);
        $this->assertArrayHasKey('checkout_hour', $result);
        $this->assertArrayHasKey('checkout_time_standard', $result);
        $this->assertArrayHasKey('whatsapp_template', $result);
        $this->assertArrayHasKey('stats', $result);
        $this->assertArrayHasKey('checkouts', $result);

        $this->assertSame('Asia/Kolkata', $result['timezone']);
        $this->assertGreaterThanOrEqual(1, $result['stats']['total']);

        foreach ($result['checkouts'] as $checkout) {
            $this->assertArrayHasKey('room_no', $checkout);
            $this->assertArrayHasKey('guest_name', $checkout);
            $this->assertArrayHasKey('guest_phone', $checkout);
            $this->assertArrayHasKey('checkout_time', $checkout);
            $this->assertArrayHasKey('checkout_status', $checkout);
            $this->assertArrayHasKey('invoice_id', $checkout);
            $this->assertArrayHasKey('invoice_number', $checkout);
            $this->assertArrayHasKey('invoice_total', $checkout);
            $this->assertArrayHasKey('is_eligible_whatsapp', $checkout);
            $this->assertArrayHasKey('whatsapp_phone', $checkout);

            $this->assertNotEmpty($checkout['room_no']);
            $this->assertNotEmpty($checkout['guest_name']);
            $this->assertNotEmpty($checkout['checkout_time']);
            $this->assertContains($checkout['checkout_status'], ['pending', 'checked_out']);

            if ($checkout['is_eligible_whatsapp']) {
                $this->assertNotEmpty($checkout['whatsapp_phone']);
                $this->assertMatchesRegularExpression('/^\d{7,15}$/', $checkout['whatsapp_phone']);
            }
        }
    }

    public function testWhatsAppTemplateUpdateAndUsage(): void
    {
        $controller = new SettingsController($this->hotelRepo, $this->settingsRepo);

        $customTemplate = 'Hello {guest_name}! Your stay at {hotel_name} Room {room_no} ends today at {checkout_time}. Safe travels!';
        $request = new Request('PUT', '/settings/whatsapp', [], [
            'template' => $customTemplate,
            'timezone' => 'Asia/Kolkata',
        ], [], '127.0.0.1');
        $request->setAttribute('hotelId', 1);

        $controller->updateWhatsapp($request);

        $checkoutsData = $this->service->getTodayCheckouts(1);
        $this->assertSame($customTemplate, $checkoutsData['whatsapp_template']);
    }

    public function testDailyOpsCheckinsStructureAndCounts(): void
    {
        $result = $this->service->getTodayCheckouts(1);

        $this->assertArrayHasKey('checkins_stats', $result);
        $this->assertArrayHasKey('checkins', $result);
        $this->assertArrayHasKey('whatsapp_checkin_template', $result);
        $this->assertArrayHasKey('whatsapp_checkin_enabled', $result);

        $checkinsStats = $result['checkins_stats'];
        $this->assertArrayHasKey('total', $checkinsStats);
        $this->assertArrayHasKey('pending', $checkinsStats);
        $this->assertArrayHasKey('completed', $checkinsStats);
        $this->assertSame($checkinsStats['total'], $checkinsStats['pending'] + $checkinsStats['completed']);

        foreach ($result['checkins'] as $checkin) {
            $this->assertArrayHasKey('room_no', $checkin);
            $this->assertArrayHasKey('guest_name', $checkin);
            $this->assertArrayHasKey('guest_phone', $checkin);
            $this->assertArrayHasKey('check_in_date', $checkin);
            $this->assertArrayHasKey('check_in_time', $checkin);
            $this->assertArrayHasKey('checkin_status', $checkin);
            $this->assertArrayHasKey('checkin_status_label', $checkin);
            $this->assertContains($checkin['checkin_status'], ['pending', 'checked_in', 'checked_out']);
        }
    }

    public function testCheckinWhatsAppTemplateUpdateAndToggle(): void
    {
        $controller = new SettingsController($this->hotelRepo, $this->settingsRepo);

        $customCheckinTemplate = 'Welcome {{guest_name}} to {{hotel_name}} Room {{room_number}}!';
        $request = new Request('PUT', '/settings/whatsapp', [], [
            'template' => 'Checkout template',
            'checkin_template' => $customCheckinTemplate,
            'checkin_enabled' => false,
            'timezone' => 'Asia/Kolkata',
        ], [], '127.0.0.1');
        $request->setAttribute('hotelId', 1);

        $controller->updateWhatsapp($request);

        $data = $this->service->getTodayCheckouts(1);
        $this->assertSame($customCheckinTemplate, $data['whatsapp_checkin_template']);
        $this->assertFalse($data['whatsapp_checkin_enabled']);

        // Eligible whatsapp should be false when toggle is disabled
        foreach ($data['checkins'] as $checkin) {
            $this->assertFalse($checkin['is_eligible_whatsapp']);
        }
    }
}

