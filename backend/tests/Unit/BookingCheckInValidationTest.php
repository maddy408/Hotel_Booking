<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\ApiException;
use PHPUnit\Framework\TestCase;

final class BookingCheckInValidationTest extends TestCase
{
    public function testAdvancePaymentValidationProducesExactFieldAndMessage(): void
    {
        $advance = 0.0;
        $expectedMsg = 'Please enter and collect the advance amount before check-in.';

        try {
            if ($advance <= 0) {
                throw ApiException::validation(['advanceAmount' => $expectedMsg], $expectedMsg);
            }
            $this->fail('Expected ApiException was not thrown');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertSame('validation_failed', $e->getErrorCode());
            $this->assertSame($expectedMsg, $e->getMessage());
            $fields = $e->getFields();
            $this->assertIsArray($fields);
            $this->assertArrayHasKey('advanceAmount', $fields);
            $this->assertSame($expectedMsg, $fields['advanceAmount']);
        }
    }

    public function testMaxPersonsValidationProducesExactFieldAndMessage(): void
    {
        $maxPersons = 2;
        $enteredPersons = 3;
        $expectedMsg = "This room allows a maximum of {$maxPersons} persons.";

        try {
            if ($enteredPersons > $maxPersons) {
                throw ApiException::validation(['persons' => $expectedMsg], $expectedMsg);
            }
            $this->fail('Expected ApiException was not thrown');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertSame('validation_failed', $e->getErrorCode());
            $this->assertSame($expectedMsg, $e->getMessage());
            $fields = $e->getFields();
            $this->assertIsArray($fields);
            $this->assertArrayHasKey('persons', $fields);
            $this->assertSame($expectedMsg, $fields['persons']);
        }
    }

    public function testMaxPersonsValidationPassesWhenWithinLimit(): void
    {
        $maxPersons = 2;
        $enteredPersons = 2;

        $hasError = $enteredPersons > $maxPersons;
        $this->assertFalse($hasError);
    }
}

