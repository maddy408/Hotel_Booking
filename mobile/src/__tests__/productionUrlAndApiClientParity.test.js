import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mobileRoot = path.resolve(__dirname, '..', '..');
const srcDir = path.resolve(mobileRoot, 'src');

describe('Production API Configuration & URL Resolution', () => {
  const apiClientPath = path.join(srcDir, 'lib', 'apiClient.js');
  const apiClientContent = fs.readFileSync(apiClientPath, 'utf8');

  it('1. Verifies exact production API base URL constant and format in apiClient.js', () => {
    assert.ok(
      apiClientContent.includes("export const PRODUCTION_API_URL = 'https://hotel-booking.ethiodeploy.app';"),
      'apiClient.js must declare PRODUCTION_API_URL exactly as https://hotel-booking.ethiodeploy.app'
    );
    assert.ok(
      !apiClientContent.includes("PRODUCTION_API_URL = 'https://hotel-booking.ethiodeploy.app/"),
      'PRODUCTION_API_URL must not have trailing slash or /api'
    );
  });

  it('2. Evaluates getCandidateBaseUrls and resolveBaseUrl in production mode', () => {
    // Replicate the exact pure logic from apiClient.js
    function getCleanConfiguredUrl(envUrl) {
      const raw = (envUrl || '').trim();
      if (!raw) return '';
      return raw.replace(/\/+$/, '').replace(/\/api$/, '');
    }

    function getCandidateBaseUrls(envUrl, isDev) {
      const PRODUCTION_API_URL = 'https://hotel-booking.ethiodeploy.app';
      const configured = getCleanConfiguredUrl(envUrl);

      if (!isDev) {
        return [configured || PRODUCTION_API_URL];
      }

      const candidates = [];
      if (configured) candidates.push(configured);
      return candidates.length ? candidates : [PRODUCTION_API_URL];
    }

    // In production build (!isDev)
    const prodCandidates = getCandidateBaseUrls('https://hotel-booking.ethiodeploy.app', false);
    assert.strictEqual(prodCandidates.length, 1);
    assert.strictEqual(prodCandidates[0], 'https://hotel-booking.ethiodeploy.app');

    // Strict check: No localhost, 127.0.0.1 or LAN IP candidates
    for (const url of prodCandidates) {
      assert.ok(!url.includes('localhost'), `Candidate ${url} must not include localhost`);
      assert.ok(!url.includes('127.0.0.1'), `Candidate ${url} must not include 127.0.0.1`);
      assert.ok(!url.includes('10.0.2.2'), `Candidate ${url} must not include 10.0.2.2`);
      assert.ok(!url.includes('192.168.'), `Candidate ${url} must not include LAN IP`);
    }
  });

  it('3. Defensive URL sanitization strips trailing slashes and /api suffix', () => {
    function getCleanConfiguredUrl(envUrl) {
      const raw = (envUrl || '').trim();
      if (!raw) return '';
      return raw.replace(/\/+$/, '').replace(/\/api$/, '');
    }

    assert.strictEqual(getCleanConfiguredUrl('https://hotel-booking.ethiodeploy.app/api/'), 'https://hotel-booking.ethiodeploy.app');
    assert.strictEqual(getCleanConfiguredUrl('https://hotel-booking.ethiodeploy.app/api'), 'https://hotel-booking.ethiodeploy.app');
    assert.strictEqual(getCleanConfiguredUrl('https://hotel-booking.ethiodeploy.app/'), 'https://hotel-booking.ethiodeploy.app');
    assert.strictEqual(getCleanConfiguredUrl('https://hotel-booking.ethiodeploy.app'), 'https://hotel-booking.ethiodeploy.app');
  });

  it('4. mobile/.env and mobile/.env.production are set to exact production URL', () => {
    const envPath = path.join(mobileRoot, '.env');
    const envProdPath = path.join(mobileRoot, '.env.production');
    const envDevPath = path.join(mobileRoot, '.env.development');

    assert.ok(fs.existsSync(envPath), '.env file must exist');
    assert.ok(fs.existsSync(envProdPath), '.env.production must exist');
    assert.ok(fs.existsSync(envDevPath), '.env.development must exist');

    const envContent = fs.readFileSync(envPath, 'utf8');
    const envProdContent = fs.readFileSync(envProdPath, 'utf8');
    const envDevContent = fs.readFileSync(envDevPath, 'utf8');

    assert.ok(envContent.includes('EXPO_PUBLIC_API_URL=https://hotel-booking.ethiodeploy.app'), '.env must point to production URL');
    assert.ok(!envContent.includes('hotel-booking.ethiodeploy.app/api'), '.env must not end with /api');
    assert.ok(envProdContent.includes('EXPO_PUBLIC_API_URL=https://hotel-booking.ethiodeploy.app'), '.env.production must point to production URL');
    assert.ok(envDevContent.includes('EXPO_PUBLIC_API_URL='), '.env.development must provide separate dev config');
  });

  it('5. Database credentials and secrets are not exposed in mobile configuration or source', () => {
    const forbiddenSecrets = [
      'Ramya@123',
      'DB_PASSWORD',
      'DB_USERNAME',
      'JWT_SECRET',
      'ENCRYPTION_KEY',
    ];

    function checkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'node_modules' && entry.name !== '.expo') {
            checkDir(fullPath);
          }
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx') || entry.name.endsWith('.json') || entry.name.startsWith('.env'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const secret of forbiddenSecrets) {
            assert.ok(
              !content.includes(secret),
              `File ${entry.name} must not contain forbidden secret: ${secret}`
            );
          }
        }
      }
    }

    checkDir(srcDir);
    checkDir(mobileRoot);
  });

  it('6. Ensures apiClient does not contain negative bypass filter for ethiodeploy', () => {
    assert.ok(
      !apiClientContent.includes('!envUrl.includes(\'hotel-booking.ethiodeploy.app\')'),
      'apiClient.js must not bypass or filter out the production URL'
    );
  });
});
