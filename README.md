# APS Order

QR-code ordering for restaurants, deployed at https://order.apservices.vip (Namecheap cPanel, PHP 8.1+, SQLite).

- `new/app/` – server code (`core.php`, `schema.sql`), deployed to `/home/apsengur/aps-order/app`
- `new/public/` – web root, deployed to `/home/apsengur/aps-order/public`
  - `api.php` (JSON API), `upload.php` (item photos, logo, screen media)
  - `index.html` customer page (`/r/<slug>/?table=…`), `staff.html` dashboard (`/staff`), `screen.html` TV player (`/screen`, + `screen-sw.js`)
  - `assets/` – vanilla JS/CSS, no build step; `order-i18n.js` / `staff-i18n.js` hold the es/de/zh (and staff ar) strings keyed by the English text
- `DEPLOY.md` – step-by-step cPanel deployment; `dist/aps-order-deploy.zip` – ready-to-extract package

## Features

Customer: language picker (fr, en, ar, es, de, zh) → menu with allergen filter → order → live tracking → star rating and Google review link once served and paid.
Staff: service board, **Réception** (counter/takeaway/table orders, tracking QR, idle screen saver), **Serveur** (phone ordering from a table plan; waiter name on tickets), menu with six-language fields, tables & QR, analytics with guest ratings, team, **Écrans** (digital signage), **Établissement** (logo, languages, Google review link).

## Tests

- `test/serve.sh` – runs the real `api.php` with `php -S` (via `test/router.php`, which mimics `.htaccess` incl. the CSP) on port 4190, against a fresh database in the production v2 shape (`test/seed-v2.php`) that migrates to v3 on first request. Sign in as `nadia@darzellige.ma` / `zellige-test-passphrase-2026`.
- `test/api-test.sh` – 35 end-to-end API checks (migration, ordering, rating rules, permissions, uploads, pairing, rate limits).
- `test/mock-server.js` – Node stand-in for `api.php` with richer seeded data (port 4190).
- `test/shots.js [customer|staff|take|screens|player|rating]` – drives headless Chrome over DevTools and saves screenshots to `test/shots/`; works against either backend (`CHROME=` to override the browser path).

The database migrates itself via `PRAGMA user_version` (`SCHEMA_VERSION` in core.php, `migrate()` adds columns to existing tables).

cPanel quirks: sessions expire within minutes; `Fileman/get_file_content` injects `<meta charset="utf-8">` after the first `<head`/`<header`; multipart `save_file_content` turns LF into CRLF.

`MFA_REQUIRED` in core.php is currently `false` (two-step verification switched off at the owner's request).
