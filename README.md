# APS Order

QR-code ordering for restaurants, deployed at https://order.apservices.vip (Namecheap cPanel, PHP 8.1+, SQLite).

- `new/app/` – server code (`core.php`, `schema.sql`), deployed to `/home/apsengur/aps-order/app`
- `new/public/` – web root (`api.php`, `upload.php`, customer page `index.html`, staff dashboard `staff.html`, `assets/`), deployed to `/home/apsengur/aps-order/public`
- `test/mock-server.js` – Node stand-in for `api.php` with seeded sample data (port 4190)
- `test/shots.js` – drives headless Chrome/Edge over DevTools and saves screenshots to `test/shots/`

Deploy: zip `new/` contents, upload to `/home/apsengur/aps-order` in cPanel File Manager, extract (overwrites). The database migrates itself via `PRAGMA user_version` (`SCHEMA_VERSION` in core.php).

cPanel quirks: sessions expire within minutes; `Fileman/get_file_content` injects `<meta charset="utf-8">` after the first `<head`/`<header`; multipart `save_file_content` turns LF into CRLF.

`MFA_REQUIRED` in core.php is currently `false` (two-step verification switched off at the owner's request).
