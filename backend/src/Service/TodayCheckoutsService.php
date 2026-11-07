<?php

declare(strict_types=1);

namespace App\Service;

use App\Config\Env;
use App\Repository\HotelRepository;
use App\Repository\SettingsRepository;
use DateTimeImmutable;
use DateTimeZone;
use PDO;

final class TodayCheckoutsService
{
    public const DEFAULT_WHATSAPP_TEMPLATE = 'Dear {guest_name}, thank you for choosing {hotel_name}. Your checkout for Room {room_no} is scheduled for today by {checkout_time}. Please visit the front desk for bill settlement. Have a pleasant journey! Call {hotel_phone} for assistance.';

    public const DEFAULT_WHATSAPP_CHECKIN_TEMPLATE = "Dear {{guest_name}},\n\nWelcome to {{hotel_name}}!\n\nYour check-in has been successfully completed.\n\nRoom Number: {{room_number}}\nCheck-in Date: {{checkin_date}}\nCheck-in Time: {{checkin_time}}\nExpected Check-out: {{checkout_date}} at {{checkout_time}}\n\nWe hope you have a comfortable and pleasant stay with us.\n\nThank you,\n{{hotel_name}}";

    public function __construct(
        private readonly PDO $db,
        private readonly HotelRepository $hotels,
        private readonly SettingsRepository $settings,
    ) {
    }

    public function getTodayCheckouts(int $hotelId): array
    {
        $hotel = $this->hotels->find($hotelId);
        $settings = $this->settings->find($hotelId);

        $tzString = !empty($settings['timezone']) ? (string) $settings['timezone'] : (string) Env::get('APP_TIMEZONE', 'Asia/Kolkata');
        try {
            $tz = new DateTimeZone($tzString);
        } catch (\Throwable) {
            $tz = new DateTimeZone('Asia/Kolkata');
        }

        $now = new DateTimeImmutable('now', $tz);
        $today = $now->format('Y-m-d');

        $checkoutHour = (int) ($settings['checkout_hour'] ?? 12);
        $checkoutTimeFormatted = date('g:i A', mktime($checkoutHour, 0, 0));

        $whatsappTemplate = !empty($settings['whatsapp_checkout_template'])
            ? (string) $settings['whatsapp_checkout_template']
            : self::DEFAULT_WHATSAPP_TEMPLATE;

        $whatsappCheckinTemplate = !empty($settings['whatsapp_checkin_template'])
            ? (string) $settings['whatsapp_checkin_template']
            : self::DEFAULT_WHATSAPP_CHECKIN_TEMPLATE;

        $whatsappCheckinEnabled = !isset($settings['whatsapp_checkin_enabled']) || (int) $settings['whatsapp_checkin_enabled'] === 1;

        // Query stays: in_house with checkout_planned = today, or checked_out today
        $stmt = $this->db->prepare(
            "SELECT s.id AS stay_id, s.hotel_id, s.reservation_id, s.room_id, s.guest_id,
                    s.persons, s.rate, s.check_in_date, s.checkout_planned, s.checkout_time, s.checkout_actual,
                    s.status AS stay_status, s.payment_method, s.created_at, s.updated_at,
                    r.room_no, r.floor, rt.name AS room_type_name, rt.code AS room_type_code,
                    g.name AS guest_name, g.phone AS guest_phone, g.city AS guest_city,
                    res.booking_code, res.advance_amount,
                    i.id AS invoice_id, i.invoice_number, i.total_amount AS invoice_total
             FROM stays s
             JOIN rooms r ON r.id = s.room_id
             JOIN room_types rt ON rt.id = r.room_type_id
             JOIN guests g ON g.id = s.guest_id
             LEFT JOIN reservations res ON res.id = s.reservation_id
             LEFT JOIN invoices i ON i.stay_id = s.id
             WHERE s.hotel_id = :hotel_id
               AND (s.checkout_planned = :today1 OR (s.status = 'checked_out' AND s.checkout_actual = :today2))
             ORDER BY
               CASE WHEN s.status = 'in_house' THEN 0 ELSE 1 END,
               r.room_no ASC"
        );
        $stmt->execute(['hotel_id' => $hotelId, 'today1' => $today, 'today2' => $today]);
        $stayRows = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Also check pending reservations scheduled to check out today
        $stmtRes = $this->db->prepare(
            "SELECT res.id AS reservation_id, res.hotel_id, res.booking_code, res.room_id, res.guest_id,
                    res.check_in_date, res.check_out_date AS checkout_planned, res.check_out_time,
                    res.persons, res.rate, res.advance_amount, res.status AS reservation_status,
                    r.room_no, r.floor, rt.name AS room_type_name, rt.code AS room_type_code,
                    g.name AS guest_name, g.phone AS guest_phone, g.city AS guest_city
             FROM reservations res
             JOIN rooms r ON r.id = res.room_id
             JOIN room_types rt ON rt.id = r.room_type_id
             JOIN guests g ON g.id = res.guest_id
             WHERE res.hotel_id = :hotel_id
               AND res.status = 'pending'
               AND res.check_out_date = :today
             ORDER BY r.room_no ASC"
        );
        $stmtRes->execute(['hotel_id' => $hotelId, 'today' => $today]);
        $resRows = $stmtRes->fetchAll(PDO::FETCH_ASSOC);

        $items = [];
        $pendingCount = 0;
        $checkedOutCount = 0;

        foreach ($stayRows as $row) {
            $isCheckedOut = $row['stay_status'] === 'checked_out';
            if ($isCheckedOut) {
                $checkedOutCount++;
                $status = 'checked_out';
                $statusLabel = 'Checked Out';
                $checkoutTime = $this->formatCheckoutTime($row['updated_at'], $tz, $checkoutTimeFormatted);
            } else {
                $pendingCount++;
                $status = 'pending';
                $statusLabel = 'Pending';
                if (!empty($row['checkout_time'])) {
                    $ts = strtotime($row['checkout_time']);
                    $checkoutTime = $ts !== false ? date('g:i A', $ts) : $checkoutTimeFormatted;
                } else {
                    $checkoutTime = $checkoutTimeFormatted;
                }
            }

            $rawPhone = (string) ($row['guest_phone'] ?? '');
            $cleanPhone = $this->cleanPhoneNumber($rawPhone);
            $isEligibleWhatsApp = $cleanPhone !== '';

            $items[] = [
                'id' => 'stay-' . $row['stay_id'],
                'kind' => 'stay',
                'stay_id' => (int) $row['stay_id'],
                'reservation_id' => $row['reservation_id'] !== null ? (int) $row['reservation_id'] : null,
                'booking_code' => $row['booking_code'] ?? null,
                'room_id' => (int) $row['room_id'],
                'room_no' => (int) $row['room_no'],
                'floor' => (int) $row['floor'],
                'room_type_name' => (string) $row['room_type_name'],
                'room_type_code' => (string) $row['room_type_code'],
                'guest_id' => (int) $row['guest_id'],
                'guest_name' => (string) $row['guest_name'],
                'guest_phone' => $rawPhone,
                'guest_city' => $row['guest_city'],
                'check_in_date' => (string) $row['check_in_date'],
                'checkout_planned' => (string) $row['checkout_planned'],
                'checkout_actual' => $row['checkout_actual'],
                'checkout_time' => $checkoutTime,
                'checkout_status' => $status,
                'checkout_status_label' => $statusLabel,
                'rate' => (float) $row['rate'],
                'persons' => (int) $row['persons'],
                'advance_amount' => (float) ($row['advance_amount'] ?? 0),
                'invoice_id' => $row['invoice_id'] !== null ? (int) $row['invoice_id'] : null,
                'invoice_number' => $row['invoice_number'],
                'invoice_total' => $row['invoice_total'] !== null ? (float) $row['invoice_total'] : null,
                'is_eligible_whatsapp' => $isEligibleWhatsApp,
                'whatsapp_phone' => $cleanPhone,
            ];
        }

        foreach ($resRows as $row) {
            $pendingCount++;
            $rawPhone = (string) ($row['guest_phone'] ?? '');
            $cleanPhone = $this->cleanPhoneNumber($rawPhone);

            if (!empty($row['check_out_time'])) {
                $ts = strtotime($row['check_out_time']);
                $resCheckoutTime = $ts !== false ? date('g:i A', $ts) : $checkoutTimeFormatted;
            } else {
                $resCheckoutTime = $checkoutTimeFormatted;
            }

            $items[] = [
                'id' => 'res-' . $row['reservation_id'],
                'kind' => 'reservation',
                'stay_id' => null,
                'reservation_id' => (int) $row['reservation_id'],
                'booking_code' => (string) $row['booking_code'],
                'room_id' => (int) $row['room_id'],
                'room_no' => (int) $row['room_no'],
                'floor' => (int) $row['floor'],
                'room_type_name' => (string) $row['room_type_name'],
                'room_type_code' => (string) $row['room_type_code'],
                'guest_id' => (int) $row['guest_id'],
                'guest_name' => (string) $row['guest_name'],
                'guest_phone' => $rawPhone,
                'guest_city' => $row['guest_city'],
                'check_in_date' => (string) $row['check_in_date'],
                'checkout_planned' => (string) $row['checkout_planned'],
                'checkout_actual' => null,
                'checkout_time' => $resCheckoutTime,
                'checkout_status' => 'pending',
                'checkout_status_label' => 'Pending Check-in',
                'rate' => (float) $row['rate'],
                'persons' => (int) $row['persons'],
                'advance_amount' => (float) ($row['advance_amount'] ?? 0),
                'invoice_id' => null,
                'invoice_number' => null,
                'invoice_total' => null,
                'is_eligible_whatsapp' => $cleanPhone !== '',
                'whatsapp_phone' => $cleanPhone,
            ];
        }

        // ==========================================
        // Check-ins for Today
        // ==========================================

        // Query stays checked in today (completed check-ins)
        $stmtCheckinStays = $this->db->prepare(
            "SELECT s.id AS stay_id, s.hotel_id, s.reservation_id, s.room_id, s.guest_id,
                    s.persons, s.rate, s.check_in_date, s.checkout_planned, s.checkout_time, s.checkout_actual,
                    s.status AS stay_status, s.payment_method, s.created_at, s.updated_at,
                    r.room_no, r.floor, rt.name AS room_type_name, rt.code AS room_type_code,
                    g.name AS guest_name, g.phone AS guest_phone, g.city AS guest_city,
                    res.booking_code, res.advance_amount,
                    i.id AS invoice_id, i.invoice_number, i.total_amount AS invoice_total
             FROM stays s
             JOIN rooms r ON r.id = s.room_id
             JOIN room_types rt ON rt.id = r.room_type_id
             JOIN guests g ON g.id = s.guest_id
             LEFT JOIN reservations res ON res.id = s.reservation_id
             LEFT JOIN invoices i ON i.stay_id = s.id
             WHERE s.hotel_id = :hotel_id
               AND s.check_in_date = :today
               AND s.status != 'cancelled'
             ORDER BY r.room_no ASC"
        );
        $stmtCheckinStays->execute(['hotel_id' => $hotelId, 'today' => $today]);
        $checkinStayRows = $stmtCheckinStays->fetchAll(PDO::FETCH_ASSOC);

        // Query pending reservations scheduled to check in today (pending arrivals)
        $stmtCheckinRes = $this->db->prepare(
            "SELECT res.id AS reservation_id, res.hotel_id, res.booking_code, res.room_id, res.guest_id,
                    res.check_in_date, res.check_out_date AS checkout_planned, res.check_out_time,
                    res.persons, res.rate, res.advance_amount, res.status AS reservation_status,
                    r.room_no, r.floor, rt.name AS room_type_name, rt.code AS room_type_code,
                    g.name AS guest_name, g.phone AS guest_phone, g.city AS guest_city
             FROM reservations res
             JOIN rooms r ON r.id = res.room_id
             JOIN room_types rt ON rt.id = r.room_type_id
             JOIN guests g ON g.id = res.guest_id
             WHERE res.hotel_id = :hotel_id
               AND res.status = 'pending'
               AND res.check_in_date = :today
             ORDER BY r.room_no ASC"
        );
        $stmtCheckinRes->execute(['hotel_id' => $hotelId, 'today' => $today]);
        $checkinResRows = $stmtCheckinRes->fetchAll(PDO::FETCH_ASSOC);

        $checkinItems = [];
        $pendingCheckinCount = 0;
        $activeCheckinCount = 0;
        $checkedOutCheckinCount = 0;
        $seenResIds = [];
        $seenStayIds = [];

        foreach ($checkinResRows as $row) {
            $resId = (int) $row['reservation_id'];
            if (isset($seenResIds[$resId])) {
                continue;
            }
            $seenResIds[$resId] = true;

            $pendingCheckinCount++;
            $rawPhone = (string) ($row['guest_phone'] ?? '');
            $cleanPhone = $this->cleanPhoneNumber($rawPhone);
            $isEligibleWhatsApp = $cleanPhone !== '' && $whatsappCheckinEnabled;

            if (!empty($row['check_out_time'])) {
                $ts = strtotime($row['check_out_time']);
                $resCheckoutTime = $ts !== false ? date('g:i A', $ts) : $checkoutTimeFormatted;
            } else {
                $resCheckoutTime = $checkoutTimeFormatted;
            }

            $advancePaid = $this->getNetAdvanceForReservation((int) $row['reservation_id'], (float) ($row['advance_amount'] ?? 0));

            $checkinItems[] = [
                'id' => 'res-' . $row['reservation_id'],
                'kind' => 'reservation',
                'stay_id' => null,
                'reservation_id' => (int) $row['reservation_id'],
                'booking_code' => (string) $row['booking_code'],
                'room_id' => (int) $row['room_id'],
                'room_no' => (int) $row['room_no'],
                'floor' => (int) $row['floor'],
                'room_type_name' => (string) $row['room_type_name'],
                'room_type_code' => (string) $row['room_type_code'],
                'guest_id' => (int) $row['guest_id'],
                'guest_name' => (string) $row['guest_name'],
                'guest_phone' => $rawPhone,
                'guest_city' => $row['guest_city'],
                'check_in_date' => (string) $row['check_in_date'],
                'check_in_time' => '12:00 PM',
                'checkout_planned' => (string) $row['checkout_planned'],
                'checkout_time' => $resCheckoutTime,
                'checkin_status' => 'pending',
                'checkin_status_label' => 'Pending',
                'rate' => (float) $row['rate'],
                'persons' => (int) $row['persons'],
                'advance_amount' => (float) ($row['advance_amount'] ?? 0),
                'advance_paid' => $advancePaid,
                'is_eligible_whatsapp' => $isEligibleWhatsApp,
                'whatsapp_phone' => $cleanPhone,
            ];
        }

        foreach ($checkinStayRows as $row) {
            $stayId = (int) $row['stay_id'];
            if (isset($seenStayIds[$stayId])) {
                continue;
            }
            $seenStayIds[$stayId] = true;

            $isStayInHouse = $row['stay_status'] === 'in_house';
            $isStayCheckedOut = $row['stay_status'] === 'checked_out';

            if ($isStayInHouse) {
                $activeCheckinCount++;
                $checkinStatus = 'checked_in';
                $checkinStatusLabel = 'Checked-in';
            } elseif ($isStayCheckedOut) {
                $checkedOutCheckinCount++;
                $checkinStatus = 'checked_out';
                $checkinStatusLabel = 'Checked Out';
            } else {
                continue;
            }

            $rawPhone = (string) ($row['guest_phone'] ?? '');
            $cleanPhone = $this->cleanPhoneNumber($rawPhone);
            $isEligibleWhatsApp = $cleanPhone !== '' && $whatsappCheckinEnabled;

            if (!empty($row['checkout_time'])) {
                $ts = strtotime($row['checkout_time']);
                $stayCheckoutTime = $ts !== false ? date('g:i A', $ts) : $checkoutTimeFormatted;
            } else {
                $stayCheckoutTime = $checkoutTimeFormatted;
            }

            $actualCheckinTime = $this->formatCheckoutTime($row['created_at'], $tz, '12:00 PM');
            $advancePaid = $this->getNetAdvanceForStay(
                (int) $row['stay_id'],
                $row['reservation_id'] !== null ? (int) $row['reservation_id'] : null,
                (float) ($row['advance_amount'] ?? 0)
            );

            $checkinItems[] = [
                'id' => 'stay-' . $row['stay_id'],
                'kind' => 'stay',
                'stay_id' => (int) $row['stay_id'],
                'reservation_id' => $row['reservation_id'] !== null ? (int) $row['reservation_id'] : null,
                'booking_code' => $row['booking_code'] ?? null,
                'room_id' => (int) $row['room_id'],
                'room_no' => (int) $row['room_no'],
                'floor' => (int) $row['floor'],
                'room_type_name' => (string) $row['room_type_name'],
                'room_type_code' => (string) $row['room_type_code'],
                'guest_id' => (int) $row['guest_id'],
                'guest_name' => (string) $row['guest_name'],
                'guest_phone' => $rawPhone,
                'guest_city' => $row['guest_city'],
                'check_in_date' => (string) $row['check_in_date'],
                'check_in_time' => $actualCheckinTime,
                'checkout_planned' => (string) $row['checkout_planned'],
                'checkout_time' => $stayCheckoutTime,
                'checkin_status' => $checkinStatus,
                'checkin_status_label' => $checkinStatusLabel,
                'stay_status' => $row['stay_status'],
                'invoice_id' => $row['invoice_id'] !== null ? (int) $row['invoice_id'] : null,
                'invoice_number' => $row['invoice_number'] ?? null,
                'invoice_total' => $row['invoice_total'] !== null ? (float) $row['invoice_total'] : null,
                'rate' => (float) $row['rate'],
                'persons' => (int) $row['persons'],
                'advance_amount' => (float) ($row['advance_amount'] ?? 0),
                'advance_paid' => $advancePaid,
                'is_eligible_whatsapp' => $isEligibleWhatsApp,
                'whatsapp_phone' => $cleanPhone,
            ];
        }

        // Sort checkin items: pending first, then checked_in, then checked_out, then by room_no
        usort($checkinItems, function (array $a, array $b): int {
            $priority = ['pending' => 0, 'checked_in' => 1, 'checked_out' => 2];
            $aPri = $priority[$a['checkin_status']] ?? 3;
            $bPri = $priority[$b['checkin_status']] ?? 3;
            if ($aPri !== $bPri) {
                return $aPri <=> $bPri;
            }
            return ((int) $a['room_no']) <=> ((int) $b['room_no']);
        });

        $completedCheckinCount = $activeCheckinCount + $checkedOutCheckinCount;
        $totalCheckins = $pendingCheckinCount + $completedCheckinCount;

        return [
            'hotel' => [
                'id' => $hotelId,
                'name' => $hotel['name'] ?? 'Hotel',
                'place' => $hotel['place'] ?? '',
                'phone' => $hotel['phone'] ?? '',
                'email' => $hotel['email'] ?? '',
            ],
            'timezone' => $tzString,
            'today' => $today,
            'checkout_hour' => $checkoutHour,
            'checkout_time_standard' => $checkoutTimeFormatted,
            'whatsapp_template' => $whatsappTemplate,
            'whatsapp_checkout_template' => $whatsappTemplate,
            'whatsapp_checkin_template' => $whatsappCheckinTemplate,
            'whatsapp_checkin_enabled' => $whatsappCheckinEnabled,
            'stats' => [
                'total' => count($items),
                'pending' => $pendingCount,
                'checked_out' => $checkedOutCount,
            ],
            'checkouts_stats' => [
                'total' => count($items),
                'pending' => $pendingCount,
                'checked_out' => $checkedOutCount,
            ],
            'checkins_stats' => [
                'total' => $totalCheckins,
                'pending' => $pendingCheckinCount,
                'completed' => $completedCheckinCount,
                'checked_in' => $activeCheckinCount,
                'checked_out' => $checkedOutCheckinCount,
            ],
            'checkouts' => $items,
            'checkins' => $checkinItems,
        ];
    }

    private function getNetAdvanceForReservation(int $reservationId, float $defaultAdvance): float
    {
        try {
            $stmt = $this->db->prepare(
                "SELECT SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END)
                 FROM payments
                 WHERE reservation_id = :id AND type IN ('advance', 'refund') AND status = 'successful'"
            );
            $stmt->execute(['id' => $reservationId]);
            $val = $stmt->fetchColumn();
            if ($val !== false && $val !== null) {
                return (float) $val;
            }
        } catch (\Throwable) {
            // payments table may not exist in mock SQLite environments
        }
        return $defaultAdvance;
    }

    private function getNetAdvanceForStay(int $stayId, ?int $reservationId, float $defaultAdvance): float
    {
        try {
            $stmt = $this->db->prepare(
                "SELECT SUM(CASE WHEN type = 'refund' THEN -amount ELSE amount END)
                 FROM payments
                 WHERE (stay_id = :stay_id OR (:res_id IS NOT NULL AND reservation_id = :res_id))
                   AND type IN ('advance', 'refund') AND status = 'successful'"
            );
            $stmt->execute(['stay_id' => $stayId, 'res_id' => $reservationId]);
            $val = $stmt->fetchColumn();
            if ($val !== false && $val !== null) {
                return (float) $val;
            }
        } catch (\Throwable) {
            // payments table may not exist in mock SQLite environments
        }
        return $defaultAdvance;
    }

    private function formatCheckoutTime(?string $updatedAt, DateTimeZone $tz, string $default): string
    {
        if ($updatedAt === null || $updatedAt === '') {
            return $default;
        }
        try {
            $dt = new DateTimeImmutable($updatedAt);
            return $dt->setTimezone($tz)->format('g:i A');
        } catch (\Throwable) {
            return $default;
        }
    }

    public function cleanPhoneNumber(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';
        if (strlen($digits) < 7) {
            return '';
        }
        if (strlen($digits) === 10) {
            return '91' . $digits;
        }
        return $digits;
    }
}
