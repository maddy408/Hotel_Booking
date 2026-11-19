<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Repository\PaymentRepository;
use App\Repository\SettingsRepository;
use App\Repository\StayChargeRepository;
use App\Service\BillingService;
use App\Service\GstService;
use App\Support\ApiException;
use PHPUnit\Framework\TestCase;

final class CheckoutDateValidationAndBillingTest extends TestCase
{
    private BillingService $billing;

    protected function setUp(): void
    {
        $settingsRepoMock = $this->createMock(SettingsRepository::class);
        $settingsRepoMock->method('find')->willReturn([
            'gst_slab1_rate' => 0.05,
            'gst_slab2_rate' => 0.18,
            'gst_slab1_threshold' => 7500.0,
            'early_checkout_refund_unused_nights' => 1,
            'early_checkout_fee_type' => 'none',
            'early_checkout_fee_value' => 0.0,
        ]);

        $gstService = new GstService($settingsRepoMock);

        $chargesMock = $this->createMock(StayChargeRepository::class);
        $chargesMock->method('forStay')->willReturn([]);

        $paymentsMock = $this->createMock(PaymentRepository::class);
        $paymentsMock->method('advancePaidForStay')->willReturn(2100.0);
        $paymentsMock->method('otherSuccessfulPaymentsForStay')->willReturn(0.0);
        $paymentsMock->method('totalSuccessfulPaidForStay')->willReturn(2100.0);
        $paymentsMock->method('totalRefundedForStay')->willReturn(0.0);
        $paymentsMock->method('netSettledForStay')->willReturn(2100.0);

        $this->billing = new BillingService($gstService, $chargesMock, $paymentsMock, $settingsRepoMock);
    }

    public function testNormalCheckoutClassificationAndCalculation(): void
    {
        $stay = [
            'id' => 10,
            'hotel_id' => 1,
            'rate' => 2000.00,
            'check_in_date' => '2026-11-09',
            'checkout_planned' => '2026-11-10',
            'checkout_actual' => null,
            'status' => 'in_house',
            'reservation_id' => null,
            'gst_rate' => 0.05,
        ];

        $bill = $this->billing->computeBill($stay, '2026-11-10');

        $this->assertTrue($bill['isNormalCheckout']);
        $this->assertFalse($bill['isEarlyCheckout']);
        $this->assertFalse($bill['isLateCheckout']);
        $this->assertSame('normal', $bill['checkoutType']);
        $this->assertSame(1, $bill['nights']);
        $this->assertSame(1, $bill['plannedNights']);
        $this->assertSame(0, $bill['unusedNights']);
        $this->assertSame(0, $bill['additionalNights']);
        $this->assertEquals(2000.00, $bill['roomAmount']);
        $this->assertEquals(100.00, $bill['roomGstAmount']);
        $this->assertEquals(0.00, $bill['earlyCheckoutFee']);
        $this->assertEquals(2100.00, $bill['total']);
        $this->assertEquals(0.00, $bill['balance']);
    }

    public function testEarlyCheckoutClassificationAndRecalculation(): void
    {
        $stay = [
            'id' => 11,
            'hotel_id' => 1,
            'rate' => 2000.00,
            'check_in_date' => '2026-11-01',
            'checkout_planned' => '2026-11-05', // 4 nights planned
            'checkout_actual' => null,
            'status' => 'in_house',
            'reservation_id' => null,
            'gst_rate' => 0.05,
        ];

        // Guest leaves early after 2 nights
        $bill = $this->billing->computeBill($stay, '2026-11-03');

        $this->assertTrue($bill['isEarlyCheckout']);
        $this->assertFalse($bill['isNormalCheckout']);
        $this->assertFalse($bill['isLateCheckout']);
        $this->assertSame('early', $bill['checkoutType']);
        $this->assertSame(2, $bill['nights']);
        $this->assertSame(4, $bill['plannedNights']);
        $this->assertSame(2, $bill['unusedNights']);
        $this->assertSame(0, $bill['additionalNights']);
        $this->assertEquals(4000.00, $bill['roomAmount']);
        $this->assertEquals(200.00, $bill['roomGstAmount']);
        $this->assertEquals(4200.00, $bill['total']);
    }

    public function testLateCheckoutClassificationAndCalculationUserReportedExample(): void
    {
        // Bug Report Example:
        // Original Check-in: 09-Nov-2026
        // Original Planned Checkout: 10-Nov-2026
        // Selected Actual Checkout: 17-Nov-2026
        // Actual Nights Stayed: 8 nights
        $stay = [
            'id' => 12,
            'hotel_id' => 1,
            'rate' => 2000.00,
            'check_in_date' => '2026-11-09',
            'checkout_planned' => '2026-11-10',
            'checkout_actual' => null,
            'status' => 'in_house',
            'reservation_id' => null,
            'gst_rate' => 0.05,
        ];

        $bill = $this->billing->computeBill($stay, '2026-11-17');

        // MUST be identified as Late Checkout, NOT Early Checkout
        $this->assertTrue($bill['isLateCheckout']);
        $this->assertFalse($bill['isEarlyCheckout']);
        $this->assertFalse($bill['isNormalCheckout']);
        $this->assertSame('late', $bill['checkoutType']);

        // Nights calculation: 8 actual nights, 1 planned night, 7 additional nights
        $this->assertSame(8, $bill['nights']);
        $this->assertSame(1, $bill['plannedNights']);
        $this->assertSame(0, $bill['unusedNights']);
        $this->assertSame(7, $bill['additionalNights']);

        // Room amount & GST includes all 8 nights
        $this->assertEquals(16000.00, $bill['roomAmount']); // 8 * 2000
        $this->assertEquals(800.00, $bill['roomGstAmount']); // 5% of 16000
        $this->assertEquals(0.00, $bill['earlyCheckoutFee']); // No early fee for late checkout!
        $this->assertEquals(16800.00, $bill['total']);
        // 16800 - 2100 (advance) = 14700 outstanding
        $this->assertEquals(14700.00, $bill['balance']);
        $this->assertEquals(14700.00, $bill['outstandingBalance']);
    }

    public function testDateBoundaryCheckoutBeforeCheckInThrowsValidation(): void
    {
        $stay = [
            'id' => 13,
            'hotel_id' => 1,
            'rate' => 2000.00,
            'check_in_date' => '2026-11-09',
            'checkout_planned' => '2026-11-10',
            'checkout_actual' => null,
            'status' => 'in_house',
            'reservation_id' => null,
            'gst_rate' => 0.05,
        ];

        try {
            $this->billing->computeBill($stay, '2026-11-08');
            $this->fail('Expected ApiException was not thrown for checkout date before check-in date');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertSame('validation_failed', $e->getErrorCode());
            $this->assertArrayHasKey('actualCheckoutDate', (array) $e->getFields());
        }
    }

    public function testSameDayCheckoutIsValidMinimumOneNight(): void
    {
        $stay = [
            'id' => 14,
            'hotel_id' => 1,
            'rate' => 2000.00,
            'check_in_date' => '2026-11-09',
            'checkout_planned' => '2026-11-10',
            'checkout_actual' => null,
            'status' => 'in_house',
            'reservation_id' => null,
            'gst_rate' => 0.05,
        ];

        // Same-day checkout: 09-Nov-2026
        $bill = $this->billing->computeBill($stay, '2026-11-09');

        $this->assertTrue($bill['isEarlyCheckout']);
        $this->assertSame('early', $bill['checkoutType']);
        $this->assertSame(1, $bill['nights']); // Minimum 1 night
        $this->assertSame(1, $bill['plannedNights']);
        $this->assertSame(0, $bill['unusedNights']);
        $this->assertEquals(2000.00, $bill['roomAmount']);
    }
}
