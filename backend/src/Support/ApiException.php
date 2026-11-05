<?php

declare(strict_types=1);

namespace App\Support;

class ApiException extends \RuntimeException
{
    /** @param array<string,string>|null $fields */
    public function __construct(
        string $message,
        private readonly int $status = 400,
        private readonly string $errorCode = 'bad_request',
        private readonly ?array $fields = null,
    ) {
        parent::__construct($message);
    }

    public function getStatus(): int
    {
        return $this->status;
    }

    public function getErrorCode(): string
    {
        return $this->errorCode;
    }

    /** @return array<string,string>|null */
    public function getFields(): ?array
    {
        return $this->fields;
    }

    public static function notFound(string $message = 'Not found'): self
    {
        return new self($message, 404, 'not_found');
    }

    public static function unauthorized(string $message = 'Unauthorized'): self
    {
        return new self($message, 401, 'unauthorized');
    }

    public static function forbidden(string $message = 'Forbidden'): self
    {
        return new self($message, 403, 'forbidden');
    }

    public static function conflict(string $message): self
    {
        return new self($message, 409, 'conflict');
    }

    /** @param array<string,string> $fields */
    public static function validation(array $fields, string $message = 'Validation failed'): self
    {
        return new self($message, 422, 'validation_failed', $fields);
    }

    public static function tooManyRequests(string $message = 'Too many attempts'): self
    {
        return new self($message, 429, 'too_many_requests');
    }
}
