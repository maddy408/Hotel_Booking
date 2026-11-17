<?php

declare(strict_types=1);

namespace App\Controller;

use App\Repository\GuestRepository;
use App\Repository\PaymentRepository;
use App\Repository\ReservationRepository;
use App\Repository\StayRepository;
use App\Router\Request;
use App\Service\BillingService;
use App\Service\GuestService;
use App\Service\OccupantDocumentService;
use App\Support\ApiException;
use App\Support\Validator;

final class GuestController
{
    public function __construct(
        private readonly GuestRepository $guests,
        private readonly GuestService $guestService,
        private readonly StayRepository $stays,
        private readonly ReservationRepository $reservations,
        private readonly ?OccupantDocumentService $occupantDocService = null,
        private readonly ?PaymentRepository $payments = null,
        private readonly ?BillingService $billing = null,
    ) {
    }

    public function index(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $q = (string) $request->input('q', '');
        $rows = $this->guests->search($hotelId, $q);
        return $this->guests->getRegisterEntries($hotelId, $rows, $this->guestService);
    }

    public function lookup(Request $request): array
    {
        $phone = (string) $request->input('phone', '');
        $guest = $this->guestService->findByPhone((int) $request->attribute('hotelId'), $phone);
        return ['guest' => $guest === null ? null : $this->guestService->toPublic($guest)];
    }

    public function show(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $guestId = (int) $request->routeParams['id'];

        $guest = $this->guests->find($guestId);
        if ($guest === null || (int) $guest['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Guest not found.');
        }
        $public = $this->guestService->toPublic($guest);
        $public['gender'] = $this->guests->findGenderForGuest($guestId);
        $public['visits'] = $this->guests->visitCount($guestId);
        $public['history'] = $this->guests->history($guestId);
        $public['now'] = $this->currentStatus($guestId);

        $bookings = $this->guests->getBookings($guestId, $hotelId);
        $stays = $this->guests->getStays($guestId, $hotelId);
        $payments = $this->guests->getPayments($guestId, $hotelId);

        foreach ($bookings as &$bk) {
            $in = new \DateTimeImmutable($bk['check_in_date']);
            $out = new \DateTimeImmutable($bk['check_out_date']);
            $bk['nights'] = max(1, (int) round(($out->getTimestamp() - $in->getTimestamp()) / 86400));
            $bk['advance_amount'] = (float) ($bk['advance_amount'] ?? 0);
            $bk['rate'] = (float) ($bk['rate'] ?? 0);
            $bk['total_amount'] = isset($bk['total_amount']) && $bk['total_amount'] !== null ? (float) $bk['total_amount'] : ($bk['rate'] * $bk['nights']);
            $bk['total_paid'] = (float) ($bk['total_paid'] ?? $bk['advance_amount']);

            if ($bk['status'] === 'cancelled') {
                $bk['payment_status'] = $bk['total_paid'] > 0 ? 'refund_pending' : 'cancelled';
            } elseif ($bk['total_paid'] >= $bk['total_amount'] && $bk['total_amount'] > 0) {
                $bk['payment_status'] = 'paid';
            } elseif ($bk['total_paid'] > 0) {
                $bk['payment_status'] = 'partial';
            } else {
                $bk['payment_status'] = 'unpaid';
            }

            if ($this->occupantDocService !== null) {
                $bk['documents'] = $this->occupantDocService->getDocumentsForReservation($hotelId, (int) $bk['id']);
            } else {
                $bk['documents'] = [];
            }
        }
        unset($bk);

        foreach ($stays as &$st) {
            $in = new \DateTimeImmutable($st['check_in_date']);
            $outDate = $st['checkout_actual'] ?: $st['checkout_planned'];
            $out = new \DateTimeImmutable($outDate);
            $st['nights'] = max(1, (int) round(($out->getTimestamp() - $in->getTimestamp()) / 86400));
            $st['rate'] = (float) ($st['rate'] ?? 0);
            $st['persons'] = (int) ($st['persons'] ?? 1);
            if ($this->occupantDocService !== null) {
                $st['documents'] = $this->occupantDocService->getDocumentsForStay($hotelId, (int) $st['id']);
                $st['occupants'] = $this->occupantDocService->getOccupantsWithDocumentsForStay($hotelId, (int) $st['id']);
            } else {
                $st['documents'] = [];
                $st['occupants'] = [];
            }
            if (empty($st['occupants'])) {
                $st['occupants'] = [
                    [
                        'id' => null,
                        'stay_id' => (int) $st['id'],
                        'occupant_number' => 1,
                        'name' => $guest['name'],
                        'gender' => $public['gender'] ?? null,
                        'phone' => $guest['phone'],
                        'is_primary' => 1,
                        'documents' => $st['documents'],
                    ],
                ];
            }
        }
        unset($st);

        if ($this->occupantDocService !== null) {
            $docs = $this->occupantDocService->getDocumentsForGuest($hotelId, $guestId);
        } else {
            $docs = [];
        }
        foreach ($docs as &$d) {
            $d['file_size'] = (int) ($d['file_size'] ?? 0);
            $fname = strtolower($d['original_filename'] ?? '');
            if (str_contains($fname, 'aadhaar')) {
                $docType = 'Aadhaar';
            } elseif (str_contains($fname, 'passport')) {
                $docType = 'Passport';
            } elseif (str_contains($fname, 'voter')) {
                $docType = 'Voter ID';
            } elseif (str_contains($fname, 'licence') || str_contains($fname, 'license')) {
                $docType = 'Driving Licence';
            } elseif (!empty($d['mime_type']) && str_contains($d['mime_type'], 'pdf')) {
                $docType = 'PDF Document';
            } else {
                $docType = $guest['id_proof_type'] ?? 'ID Proof';
            }
            $d['document_type'] = $docType;

            $related = '';
            if (!empty($d['linked_stay_id'])) {
                $related = 'Stay #' . $d['linked_stay_id'] . (!empty($d['room_no']) ? ' (Room ' . $d['room_no'] . ')' : '');
                if (!empty($d['booking_code'])) {
                    $related = $d['booking_code'] . ' · ' . $related;
                }
            } elseif (!empty($d['booking_code'])) {
                $related = 'Booking ' . $d['booking_code'] . (!empty($d['room_no']) ? ' (Room ' . $d['room_no'] . ')' : '');
            } else {
                $related = 'Profile Document';
            }
            $d['related_label'] = $related;
            if (empty($d['occupant_name'])) {
                $d['occupant_name'] = $guest['name'];
            }
        }
        unset($d);
        $public['documents'] = $docs;

        $totalPaid = 0.0;
        $advanceTotal = 0.0;
        $additionalTotal = 0.0;
        $refundTotal = 0.0;

        foreach ($payments as &$p) {
            $p['amount'] = (float) $p['amount'];
            if ($p['status'] === 'successful') {
                if ($p['type'] === 'advance') {
                    $advanceTotal += $p['amount'];
                    $totalPaid += $p['amount'];
                } elseif ($p['type'] === 'balance' || $p['type'] === 'extra') {
                    $additionalTotal += $p['amount'];
                    $totalPaid += $p['amount'];
                } elseif ($p['type'] === 'refund') {
                    $refundTotal += $p['amount'];
                    $totalPaid -= $p['amount'];
                }
            }

            $reference = '';
            if (!empty($p['stay_id'])) {
                $reference = 'Stay #' . $p['stay_id'] . (!empty($p['stay_room_no']) ? ' (Room ' . $p['stay_room_no'] . ')' : '');
                if (!empty($p['booking_code'])) {
                    $reference = $p['booking_code'] . ' · ' . $reference;
                }
            } elseif (!empty($p['booking_code'])) {
                $reference = 'Booking ' . $p['booking_code'] . (!empty($p['reservation_room_no']) ? ' (Room ' . $p['reservation_room_no'] . ')' : '');
            } else {
                $reference = 'Payment #' . $p['id'];
            }
            $p['reference'] = $reference;
        }
        unset($p);

        $completedStaysCount = 0;
        $lastVisitDate = null;
        foreach ($stays as $st) {
            if ($st['status'] === 'checked_out') {
                $completedStaysCount++;
                $visitDate = $st['checkout_actual'] ?: $st['check_in_date'];
                if ($lastVisitDate === null || $visitDate > $lastVisitDate) {
                    $lastVisitDate = $visitDate;
                }
            } elseif ($st['status'] === 'in_house') {
                if ($lastVisitDate === null || $st['check_in_date'] > $lastVisitDate) {
                    $lastVisitDate = $st['check_in_date'];
                }
            }
        }

        $outstandingBalance = 0.0;
        $totalRoomCharges = 0.0;
        $totalGst = 0.0;
        foreach ($stays as $st) {
            if ($this->billing !== null && $st['status'] !== 'cancelled') {
                $stayRow = $this->stays->find((int) $st['id']);
                if ($stayRow !== null) {
                    $bill = $this->billing->computeBill($stayRow);
                    $totalRoomCharges += (float) ($bill['roomAmount'] ?? 0.0);
                    $totalGst += (float) ($bill['roomGstAmount'] ?? 0.0) + (float) ($bill['extrasGstAmount'] ?? 0.0);
                    if ($st['status'] === 'in_house') {
                        $outstandingBalance += max(0.0, (float) ($bill['outstandingBalance'] ?? $bill['balance'] ?? 0.0));
                    }
                }
            }
        }

        $public['bookings'] = $bookings;
        $public['stays'] = $stays;
        $public['payments'] = $payments;
        $public['referred_guests'] = $this->guests->getReferredGuests($guestId, $hotelId);
        $public['referrals'] = $public['referred_guests'];
        $referredBy = $this->guests->findReferredBy($guestId, $hotelId);
        $public['referred_by'] = $referredBy;
        $public['referredBy'] = $referredBy;
        $public['payment_summary'] = [
            'totalPaid' => max(0.0, $totalPaid),
            'advanceTotal' => $advanceTotal,
            'additionalTotal' => $additionalTotal,
            'refundTotal' => $refundTotal,
            'totalRoomCharges' => round($totalRoomCharges, 2),
            'totalGst' => round($totalGst, 2),
            'outstandingBalance' => $outstandingBalance,
        ];
        $public['summary'] = [
            'totalVisits' => (int) $public['visits'],
            'referralsMade' => count($public['referred_guests']),
            'totalReferrals' => count($public['referred_guests']),
            'completedStays' => $completedStaysCount,
            'currentStayStatus' => $public['now'] ? ($public['now']['type'] === 'in_house' ? 'In-House' : 'Upcoming Booking') : 'Not Staying',
            'currentRoomNo' => ($public['now'] && $public['now']['type'] === 'in_house') ? $public['now']['roomNo'] : null,
            'lastVisitDate' => $lastVisitDate,
            'outstandingBalance' => $outstandingBalance,
        ];

        return $public;
    }

    public function allReferrals(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        return $this->guests->getAllReferrals($hotelId, $request->all());
    }

    public function referrals(Request $request): array
    {
        $hotelId = (int) $request->attribute('hotelId');
        $guestId = (int) $request->routeParams['id'];

        $guest = $this->guests->find($guestId);
        if ($guest === null || (int) $guest['hotel_id'] !== $hotelId) {
            throw ApiException::notFound('Guest not found.');
        }

        return $this->guests->getReferredGuests($guestId, $hotelId);
    }

    public function update(Request $request): array
    {
        $data = $request->all();
        Validator::assert($data, [
            'name' => 'string',
            'phone' => 'phone',
            'email' => 'email',
            'idProofType' => 'in:Aadhaar,Driving Licence,Voter ID,Passport,Other',
        ]);
        $guest = $this->guestService->update(
            (int) $request->attribute('hotelId'),
            (int) $request->routeParams['id'],
            $data,
            (int) $request->attribute('userId'),
        );
        $public = $this->guestService->toPublic($guest);
        $public['visits'] = $this->guests->visitCount((int) $guest['id']);
        $public['history'] = $this->guests->history((int) $guest['id']);
        $public['now'] = $this->currentStatus((int) $guest['id']);
        return $public;
    }

    public function uploadIdImage(Request $request): array
    {
        if (empty($_FILES['image'])) {
            throw ApiException::validation(['image' => 'Choose an image to upload.']);
        }
        $guest = $this->guestService->uploadIdImage(
            (int) $request->attribute('hotelId'),
            (int) $request->routeParams['id'],
            $_FILES['image'],
        );
        return $this->guestService->toPublic($guest);
    }

    /** Streams the image directly — not wrapped in the JSON envelope. */
    public function downloadIdImage(Request $request): ?array
    {
        $path = $this->guestService->idImagePath((int) $request->attribute('hotelId'), (int) $request->routeParams['id']);
        header('Content-Type: ' . (mime_content_type($path) ?: 'application/octet-stream'));
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: private, max-age=0, no-store');
        readfile($path);
        return null;
    }

    /** @return array{type:string, roomNo:?int, stayId:?int, bookingId:?int, bookingDate:?string}|null */
    private function currentStatus(int $guestId): ?array
    {
        $stay = $this->stays->findInHouseByGuest($guestId);
        if ($stay !== null) {
            return ['type' => 'in_house', 'roomNo' => (int) $stay['room_no'], 'stayId' => (int) $stay['id'], 'bookingId' => null, 'bookingDate' => null];
        }
        $reservation = $this->reservations->findPendingByGuest($guestId);
        if ($reservation !== null) {
            return ['type' => 'booked', 'roomNo' => (int) $reservation['room_no'], 'stayId' => null, 'bookingId' => (int) $reservation['id'], 'bookingDate' => $reservation['check_in_date']];
        }
        return null;
    }
}
