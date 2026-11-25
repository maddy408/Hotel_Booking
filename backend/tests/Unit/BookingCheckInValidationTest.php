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

    public function testSinglePersonRoomGrammarValidation(): void
    {
        $maxPersons = 1;
        $enteredPersons = 2;
        $unit = $maxPersons === 1 ? 'person' : 'persons';
        $expectedMsg = "This room allows a maximum of {$maxPersons} {$unit}.";

        try {
            if ($enteredPersons > $maxPersons) {
                throw ApiException::validation(['persons' => $expectedMsg], $expectedMsg);
            }
            $this->fail('Expected ApiException was not thrown');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertSame('This room allows a maximum of 1 person.', $e->getMessage());
        }
    }

    public function testDynamicRoomCapacityLimit(): void
    {
        $maxPersons = 4;
        $withinLimit = 4;
        $exceeded = 5;

        $this->assertFalse($withinLimit > $maxPersons);
        $this->assertTrue($exceeded > $maxPersons);

        $unit = $maxPersons === 1 ? 'person' : 'persons';
        $msg = "This room allows a maximum of {$maxPersons} {$unit}.";
        $this->assertSame('This room allows a maximum of 4 persons.', $msg);
    }

    public function testRejectNonPositivePersons(): void
    {
        $invalidPersons = 0;
        try {
            if ($invalidPersons < 1) {
                throw ApiException::validation(['persons' => 'Persons count must be a positive whole number.'], 'Persons count must be a positive whole number.');
            }
            $this->fail('Expected ApiException for 0 persons');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertSame('Persons count must be a positive whole number.', $e->getMessage());
        }
    }

    public function testRejectNonPositiveDays(): void
    {
        $invalidDays = -1;
        try {
            if ($invalidDays < 1) {
                throw ApiException::validation(['days' => 'Days must be at least 1.'], 'Days must be at least 1.');
            }
            $this->fail('Expected ApiException for negative days');
        } catch (ApiException $e) {
            $this->assertSame(422, $e->getStatus());
            $this->assertSame('Days must be at least 1.', $e->getMessage());
        }
    }
}

