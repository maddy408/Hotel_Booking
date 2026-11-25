<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Minimal rule-based validator. Rules are pipe-separated strings, e.g.
 * 'required|numeric|min:0' or 'required|in:cash,upi,card'.
 */
final class Validator
{
    /**
     * @param array<string,mixed> $data
     * @param array<string,string> $rules
     * @return array<string,string> field => first error message
     */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];
        foreach ($rules as $field => $ruleString) {
            $value = $data[$field] ?? null;
            $isMissing = $value === null || $value === '';
            foreach (explode('|', $ruleString) as $rule) {
                [$name, $param] = array_pad(explode(':', $rule, 2), 2, null);
                if ($name !== 'required' && $isMissing) {
                    continue; // only "required" applies to an absent optional field
                }
                $error = match ($name) {
                    'required' => $isMissing ? "This field is required." : null,
                    'string' => !is_string($value) ? "Must be text." : null,
                    'numeric' => !is_numeric($value) ? "Must be a number." : null,
                    'integer' => !is_numeric($value) || (string) (int) $value !== (string) (int) (float) $value ? "Must be a whole number." : null,
                    'min' => is_numeric($value) && (float) $value < (float) $param ? "Must be at least {$param}." : null,
                    'max' => is_numeric($value) && (float) $value > (float) $param
                        ? "Must be at most {$param}."
                        : (is_string($value) && mb_strlen($value) > (int) $param ? "Must be at most {$param} characters." : null),
                    'date' => !self::isDate((string) $value) ? "Must be a valid date (YYYY-MM-DD)." : null,
                    'in' => !in_array((string) $value, explode(',', (string) $param), true) ? "Must be one of: {$param}." : null,
                    'phone' => !self::isValidPhone($value) ? "Enter a valid 10-digit mobile number starting with 6, 7, 8, or 9." : null,
                    'email' => !filter_var($value, FILTER_VALIDATE_EMAIL) ? "Must be a valid email." : null,
                    'array' => !is_array($value) ? "Must be a list." : null,
                    default => null,
                };
                if ($error !== null) {
                    $errors[$field] = $error;
                    break;
                }
            }
        }
        return $errors;
    }

    /** @param array<string,mixed> $data @param array<string,string> $rules */
    public static function assert(array $data, array $rules): void
    {
        $errors = self::validate($data, $rules);
        if ($errors !== []) {
            throw ApiException::validation($errors);
        }
    }

    /**
     * Validates 10-digit Indian mobile numbers:
     * - Only numeric digits (with optional leading '+', hyphens, or spaces for formatting)
     * - First digit of 10-digit mobile must be 6, 7, 8, or 9 (rejects 1-5 and 0)
     * - Consistently handles +91 and 0 country-code prefixes
     */
    public static function isValidPhone(mixed $value): bool
    {
        if (!is_string($value) && !is_numeric($value)) {
            return false;
        }
        $str = trim((string) $value);
        if ($str === '') {
            return false;
        }
        // Permitted characters: digits, spaces, hyphens, and optional leading '+'
        if (!preg_match('/^\+?[0-9\s-]+$/', $str)) {
            return false;
        }
        $digits = preg_replace('/\D/', '', $str);
        // Normalize country code / prefixes:
        if (strlen($digits) === 12 && str_starts_with($digits, '91')) {
            $digits = substr($digits, 2);
        } elseif (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }
        return (bool) preg_match('/^[6-9]\d{9}$/', $digits);
    }

    private static function isDate(string $value): bool
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }
        [$y, $m, $d] = array_map('intval', explode('-', $value));
        return checkdate($m, $d, $y);
    }
}
