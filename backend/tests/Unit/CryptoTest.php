<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\Crypto;
use PHPUnit\Framework\TestCase;

final class CryptoTest extends TestCase
{
    public function testEncryptDecryptRoundTrip(): void
    {
        $plain = '482100001234';
        $cipher = Crypto::encrypt($plain);
        $this->assertNotSame($plain, $cipher);
        $this->assertSame($plain, Crypto::decrypt($cipher));
    }

    public function testEachEncryptionUsesAFreshIv(): void
    {
        $a = Crypto::encrypt('same-value');
        $b = Crypto::encrypt('same-value');
        $this->assertNotSame($a, $b, 'ciphertext must differ even for identical plaintext (random IV)');
    }

    public function testLastFourStripsWhitespace(): void
    {
        $this->assertSame('4821', Crypto::lastFour('1234 5678 4821'));
    }

    public function testMaskMatchesPrototypeFormat(): void
    {
        $this->assertSame('XXXX XXXX 4821', Crypto::mask('Aadhaar', '4821'));
        $this->assertSame('••••2290', Crypto::mask('Driving Licence', '2290'));
    }

    public function testDecryptOfGarbageReturnsNull(): void
    {
        $this->assertNull(Crypto::decrypt('not-valid-base64-cipher'));
    }
}
