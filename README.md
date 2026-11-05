# Tamarind Court Front Desk

A production-rebuild of the `Tamarind Court Front Desk.html` prototype: a hotel front-desk
console (rooms, bookings, check-in/out, billing, GST invoicing, reports) with a real
database, authentication, and role-based access, built on React + Vite and a hand-rolled
layered PHP backend on MySQL.

See [docs/ANALYSIS.md](docs/ANALYSIS.md) for the prototype's business rules and the gaps
this rebuild closes, and [docs/PLAN.md](docs/PLAN.md) for the phase-by-phase build plan.

## Stack

- **Frontend**: React 18(/19) + Vite, React Router, TanStack Query, React Hook Form + Zod, plain CSS design tokens (ported from the prototype, incl. dark mode).
- **Backend**: PHP 8.1+, no framework — `Router → Controller → Service → Repository`, PDO prepared statements, JWT auth, Composer autoload.
- **Database**: MySQL/MariaDB, InnoDB, utf8mb4.

## Project structure

```
tamarind-court/
  frontend/   React app (Vite)
  backend/    PHP API (Composer project, public/ is the webroot)
  database/   schema.sql, seed.sql, backup scripts
  docs/       ANALYSIS.md, PLAN.md
```

## Local setup on XAMPP (Windows)

1. **Place the project.** Put this whole `tamarind-court/` folder under your XAMPP
   `htdocs`, e.g. `C:\xampp\htdocs\tamarind-court`, so Apache can serve the backend at
   `http://localhost/tamarind-court/backend/public/`.

2. **Create the database.** Open phpMyAdmin (`http://localhost/phpmyadmin`), then either:
   - use the *Import* tab to import `database/schema.sql`, then `database/seed.sql`, **or**
   - run them from a terminal:
     ```bash
     mysql -u root -p < database/schema.sql
     mysql -u root -p < database/seed.sql
     ```
   `seed.sql` loads demo data matching the original prototype: 1 hotel, 4 room types,
   40 rooms, 19 guests, 5 finished stays (invoices `INV-<FY>-0001..0005`), 13 in-house
   stays, 5 pending bookings, and 4 users (see below).

3. **Configure the backend.**
   ```bash
   cd backend
   composer install
   cp .env.example .env
   ```
   Edit `.env`:
   - `DB_USERNAME` / `DB_PASSWORD` — match your MySQL root (XAMPP's default is `root`
     with an **empty** password; if a non-XAMPP MySQL service is already using port 3306
     on your machine, as can happen on a shared dev box, point these at that instance
     instead).
   - `JWT_SECRET` — generate with `php -r "echo bin2hex(random_bytes(32));"`.
   - `ENCRYPTION_KEY` — generate with `php -r "echo base64_encode(random_bytes(32));"`
     (used to encrypt guests' ID proof numbers at rest — **never reuse the one in this
     repo's `.env.example` for anything real**).
   - `CORS_ALLOWED_ORIGINS` — the frontend's dev origin, default `http://localhost:5173`.

   Apache's `mod_rewrite` must be enabled (it is by default in XAMPP) for
   `backend/public/.htaccess` to route requests to `index.php`.

4. **Configure and run the frontend.**
   ```bash
   cd frontend
   npm install
   cp .env.example .env   # VITE_API_URL — point at your backend URL
   npm run dev
   ```
   Open the URL Vite prints (default `http://localhost:5173`).

5. **Log in.** Seeded users (password **`Welcome@123`** for all of them — change these
   before using real data):

   | Username | Role |
   |---|---|
   | `admin` | Administrator |
   | `manager` | Manager |
   | `receptionist` | Receptionist |
   | `housekeeping` | Housekeeping |

### Running the backend without Apache (quick iteration)

`php -S 127.0.0.1:8099 backend/public/index.php` works for local testing too — point
the frontend's `VITE_API_URL` at `http://127.0.0.1:8099`. (The front controller handles
both; `Request::fromGlobals()` detects which server is running it.)

### Tests

```bash
cd backend
php vendor/bin/phpunit
```

Integration tests run against the real database configured in `backend/.env`, each
wrapped in a transaction that's always rolled back (the `TenantIsolationTest` suite
creates and cleans up its own extra "hotel" row instead, since the services under test
manage their own transactions). They cover the critical flows: booking/overlap
rejection, GST slab boundaries and bill calculation, sequential invoice numbering, and
cross-tenant access control.

```bash
cd backend
find src public -name "*.php" -print0 | xargs -0 -n1 php -l   # lint everything
```

```bash
cd frontend
npm run build   # must complete with no warnings
```

## What's implemented

- **Auth**: JWT access + refresh tokens, bcrypt passwords, DB-backed login rate
  limiting, role-based permission checks on every mutating endpoint (admin / manager /
  receptionist / housekeeping).
- **Rooms**: live status derivation (occupied > cleaning > repair > booked > free,
  matching the prototype), the single tap-a-tile popup pattern for every action.
- **Bookings/check-in/out**: server-side, transaction + row-locked overlap checking so
  double-booking is structurally impossible; direct check-in and check-in-from-booking;
  extras; extend stay; early/late checkout; cancellation with optional refund;
  no-show marking.
- **Billing & GST**: configurable GST slabs (Settings screen), sequential GST invoice
  numbers per financial year, printable invoice view with CGST/SGST split.
- **Guests**: phone-based de-duplication, full ID proof number encrypted at rest
  (AES-256-GCM) and only ever shown masked, optional ID photo upload (stored outside
  the public webroot, served through an authenticated endpoint).
- **Reports**: today snapshot, day-end cash/UPI/card collection, occupancy and revenue
  by date range, CSV export.
- **Admin**: Room Master (types/rooms), Users (create/edit/disable/reset password),
  Settings (hotel details, GST config).
- **Audit log** for check-in, checkout, cancel, no-show, rate changes, and room/type
  deletion.
- **Security**: every resource lookup by ID is scoped to the caller's hotel (the schema
  is multi-tenant-shaped even though this deployment seeds one hotel) — see
  `TenantIsolationTest` for the broken-access-control regression coverage.

## Production deployment

### 1. Build the frontend

```bash
cd frontend
npm run build
```
This produces `frontend/dist/`. Serve it as static files from your web server (Apache,
Nginx, or a CDN) — it's a client-side-routed SPA, so the server must fall back to
`index.html` for unknown paths (see the Apache vhost example below).

### 2. Apache vhost + HTTPS

Example vhost serving the built frontend and proxying `/api/` to the PHP backend
(adjust paths; this assumes you reverse-proxy `/api` rather than exposing
`backend/public` directly — simpler to reason about on a public host):

```apache
<VirtualHost *:443>
    ServerName tamarindcourt.example.com
    DocumentRoot "/var/www/tamarind-court/frontend/dist"

    SSLEngine on
    SSLCertificateFile    /etc/letsencrypt/live/tamarindcourt.example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/tamarindcourt.example.com/privkey.pem

    <Directory "/var/www/tamarind-court/frontend/dist">
        AllowOverride None
        Require all granted
        RewriteEngine On
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteRule ^ index.html [L]
    </Directory>

    Alias /api "/var/www/tamarind-court/backend/public"
    <Directory "/var/www/tamarind-court/backend/public">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>

<VirtualHost *:80>
    ServerName tamarindcourt.example.com
    Redirect permanent / https://tamarindcourt.example.com/
</VirtualHost>
```

If you mount the API under `/api` like this, set the frontend's `VITE_API_URL` to
`https://tamarindcourt.example.com/api` at build time, and update
`backend/.env`'s `CORS_ALLOWED_ORIGINS` to the real frontend origin (drop the dev
`localhost:5173` entries).

Get a certificate with `certbot --apache -d tamarindcourt.example.com` (Let's Encrypt)
or your organization's CA.

### 3. PHP production `php.ini` settings

```ini
display_errors = Off
display_startup_errors = Off
log_errors = On
error_log = /var/log/php/tamarind-court-error.log
expose_php = Off
opcache.enable = 1
opcache.validate_timestamps = 0   ; clear the opcache on every deploy instead (below)
upload_max_filesize = 5M          ; matches the ID-image upload limit
post_max_size = 6M
```

And in `backend/.env`:
```
APP_ENV=production
APP_DEBUG=false
```
(`APP_DEBUG=false` makes the API return a generic "Something went wrong" message
instead of the real exception text — keep it off in production.)

If you set `opcache.validate_timestamps = 0`, restart PHP-FPM/Apache (or run
`cachetool opcache:reset`) after every deploy so the opcache picks up new code —
otherwise stale route definitions can keep serving after a release, the same class of
bug this project hit once already during development with PHP's *built-in* dev server
(see `Request::fromGlobals()`'s comment on `SCRIPT_NAME`).

### 4. Database backups

`database/backup.sh` (Linux/cron) and `database/backup.bat` (Windows/Task Scheduler)
both run `mysqldump --single-transaction` against the DB credentials in `backend/.env`
and prune anything older than 14 days. Example cron entry:

```
0 2 * * * /var/www/tamarind-court/database/backup.sh >> /var/log/tamarind-court-backup.log 2>&1
```

Store backups off-host too (e.g. sync `database/backups/` to S3/Backblaze nightly) —
a local-disk-only backup doesn't protect against disk/host failure.

### 5. File permissions (Linux)

```bash
# Web server user (e.g. www-data) needs to read everything and write only to:
chown -R youruser:www-data /var/www/tamarind-court
find /var/www/tamarind-court -type d -exec chmod 750 {} \;
find /var/www/tamarind-court -type f -exec chmod 640 {} \;
chmod -R 770 backend/storage/uploads   # ID proof images — write + read for the app
chmod 640 backend/.env                 # secrets — not world-readable
```
Never put `backend/.env` or `backend/storage/uploads` inside a directory Apache serves
directly — in this layout only `backend/public/` is a web document root, so neither is
reachable by URL regardless, but keep the permissions tight anyway (defense in depth).

### 6. Deployment checklist

- [ ] `backend/.env`: `APP_DEBUG=false`, real `JWT_SECRET` and `ENCRYPTION_KEY`
      (never the repo's example values), production DB credentials, `CORS_ALLOWED_ORIGINS`
      set to the real frontend origin only.
- [ ] Changed every seeded user's password (`Welcome@123` is a known default — rotate it
      immediately via the Users screen, or `UPDATE users SET password_hash = ...`).
- [ ] `composer install --no-dev --optimize-autoloader` on the server (skip PHPUnit in prod).
- [ ] `npm run build` with the production `VITE_API_URL`, and the SPA fallback rewrite
      configured on the web server.
- [ ] HTTPS certificate installed and auto-renewing (`certbot renew` via cron/systemd timer).
- [ ] `display_errors=Off`, `expose_php=Off` in the production `php.ini`.
- [ ] `backend/storage/uploads/` exists and is writable by the PHP process, outside any
      directory served directly by the web server.
- [ ] Backup script scheduled and a *restore* has been tested at least once.
- [ ] Login rate-limit settings (`LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCKOUT_SECONDS`) reviewed
      for the deployment's expected traffic.
- [ ] GST slabs and checkout hour in the Settings screen match the hotel's actual tariff
      and GSTIN, before the first real invoice is issued (invoice numbering is
      sequential and not editable after the fact).
