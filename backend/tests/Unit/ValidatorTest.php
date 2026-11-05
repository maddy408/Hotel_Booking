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
