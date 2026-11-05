<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\ApiException;
use App\Support\Jwt;
use PHPUnit\Framework\TestCase;

final class JwtTest extends TestCase
{
    public function testAccessTokenRoundTrip(): void
    {
        $token = Jwt::issueAccessToken(7, 'manager', 1, ['name' => 'Meena']);
        $claims = Jwt::decode($token);

        $this->assertSame(7, $claims['sub']);
        $this->assertSame('manager', $claims['role']);
        $this->assertSame(1, $claims['hotel_id']);
        $this->assertSame('access', $claims['type']);
    }

    public function testRefreshTokenHasRefreshType(): void
    {
        $refresh = Jwt::issueRefreshToken(7);
        $claims = Jwt::decode($refresh['token']);
        $this->assertSame('refresh', $claims['type']);
    }

    public function testTamperedTokenIsRejected(): void
    {
        $token = Jwt::issueAccessToken(1, 'admin', 1);
        $tampered = substr($token, 0, -2) . 'xx';

        $this->expectException(ApiException::class);
        Jwt::decode($tampered);
    }

    public function testHashIsDeterministicAndDiffersPerToken(): void
    {
        $this->assertSame(Jwt::hash('abc'), Jwt::hash('abc'));
        $this->assertNotSame(Jwt::hash('abc'), Jwt::hash('abd'));
    }
}
