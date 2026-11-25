<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Validator;
use PHPUnit\Framework\TestCase;

final class ValidatorTest extends TestCase
{
    public function testRequiredFieldIsFlagged(): void
    {
        $errors = Validator::validate([], ['name' => 'required|string']);
        $this->assertArrayHasKey('name', $errors);
    }

    public function testPhoneMustBeTenDigits(): void
    {
        $this->assertArrayHasKey('phone', Validator::validate(['phone' => '12345'], ['phone' => 'required|phone']));
        $this->assertSame([], Validator::validate(['phone' => '98430 11872'], ['phone' => 'required|phone']));
    }

    public function testIndianMobileNumberRules(): void
    {
        // Invalid starting digits 1-5 rejected
        $this->assertFalse(Validator::isValidPhone('1234567890'));
        $this->assertFalse(Validator::isValidPhone('2345678901'));
        $this->assertFalse(Validator::isValidPhone('3456789012'));
        $this->assertFalse(Validator::isValidPhone('4567890123'));
        $this->assertFalse(Validator::isValidPhone('5555555555'));
        $this->assertFalse(Validator::isValidPhone('098765432')); // 9 digits

        // Valid starting digits 6-9 allowed
        $this->assertTrue(Validator::isValidPhone('6543210987'));
        $this->assertTrue(Validator::isValidPhone('7654321098'));
        $this->assertTrue(Validator::isValidPhone('8765432109'));
        $this->assertTrue(Validator::isValidPhone('9876543210'));

        // Length validation: fewer or more than 10 digits rejected
        $this->assertFalse(Validator::isValidPhone('98765'));
        $this->assertFalse(Validator::isValidPhone('987654321'));
        $this->assertFalse(Validator::isValidPhone('98765432101'));

        // Non-numeric characters rejected
        $this->assertFalse(Validator::isValidPhone('98765abcdef'));
        $this->assertFalse(Validator::isValidPhone('9876543210a'));
        $this->assertFalse(Validator::isValidPhone('98765@4321'));

        // Country code support
        $this->assertTrue(Validator::isValidPhone('+91 9876543210'));
        $this->assertTrue(Validator::isValidPhone('+91-98765-43210'));
        $this->assertTrue(Validator::isValidPhone('09876543210'));
        $this->assertFalse(Validator::isValidPhone('+91 1234567890'));
    }

    public function testNumericMinMax(): void
    {
        $errors = Validator::validate(['rate' => -5], ['rate' => 'required|numeric|min:0']);
        $this->assertArrayHasKey('rate', $errors);

        $this->assertSame([], Validator::validate(['rate' => 2200], ['rate' => 'required|numeric|min:0']));
    }

    public function testInRule(): void
    {
        $errors = Validator::validate(['method' => 'bitcoin'], ['method' => 'required|in:cash,upi,card']);
        $this->assertArrayHasKey('method', $errors);
    }

    public function testDateRuleRejectsInvalidCalendarDate(): void
    {
        $errors = Validator::validate(['d' => '2024-02-30'], ['d' => 'required|date']);
        $this->assertArrayHasKey('d', $errors);

        $this->assertSame([], Validator::validate(['d' => '2024-02-29'], ['d' => 'required|date']));
    }

    public function testOptionalFieldSkipsOtherRulesWhenAbsent(): void
    {
        $this->assertSame([], Validator::validate([], ['nickname' => 'string|max:10']));
    }
}
