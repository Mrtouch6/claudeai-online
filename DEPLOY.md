# Deploying APS Order v3 to cPanel

Target: `/home/apsengur/aps-order` on the Namecheap cPanel account (`app/`, `public/`, `var/` live there).
Package: `dist/aps-order-deploy.zip` — it contains `app/` and `public/` at its root (the contents of `new/`).
Nothing in `var/` is touched: the database, sessions, backups and `app.key` stay as they are.

## 1. Before you start (5 min, once)

**PHP limits** — cPanel → *MultiPHP INI Editor* → domain `order.apservices.vip`:

| Setting | Value | Why |
|---|---|---|
| `upload_max_filesize` | `64M` | screen videos up to 50 MB |
| `post_max_size` | `64M` | same |
| `memory_limit` | `256M` | GD re-encodes images up to 20 MP |
| `max_execution_time` | `120` | slow uploads on restaurant Wi-Fi |

Without this, video uploads fail with "File too large for the server" (the dashboard says so explicitly).
Check that the PHP version is still 8.1 or newer and that the `gd`, `pdo_sqlite` and `openssl` extensions are on (*Select PHP Version → Extensions*). `fileinfo` is used when present but is not required.

## 2. Back up (File Manager)

1. Open `/home/apsengur/aps-order`.
2. Select `app` and `public` → *Compress* → `backup-code-YYYYMMDD.zip`.
3. In `var/`, select `orders.sqlite`, **`orders.sqlite-wal` and `orders.sqlite-shm` if they exist** (the database runs in WAL mode: the newest writes can sit in the `-wal` file) → *Compress* → `backup-db-YYYYMMDD.zip`.
   The daily snapshots in `var/backups/` are a second safety net.
4. Download both zips to your computer.

Do steps 2–4 and the upload in one go: cPanel sessions expire within minutes and the File Manager then silently stops responding — reload and sign in again if a click does nothing.

## 3. Upload and extract

1. *Upload* `aps-order-deploy.zip` into `/home/apsengur/aps-order`.
2. Right-click → *Extract* → path `/home/apsengur/aps-order` → confirm overwrite.
3. Delete the zip.

Do not edit PHP/JS/HTML through the File Manager editor afterwards: its save turns LF into CRLF and `get_file_content` injects a `<meta charset>` after the first `<head`. Always ship changes as a zip.

## 4. First request = automatic migration

Open https://order.apservices.vip/staff and sign in. The first request upgrades the database from version 2 to 3 inside one transaction:

- adds `name_es/de/zh` and `description_es/de/zh` to categories and items,
- adds `google_review_url` to restaurants (placeholder `https://g.page/r/PLACEHOLDER/review`),
- adds `created_by`, `rating`, `rating_comment`, `rated_at` to orders,
- creates `screens`, `signage_content`, `signage_targets`,
- widens restaurants saved with exactly fr/en/ar to all six languages.

Existing rows are not modified otherwise. If anything fails, the transaction rolls back and the site keeps running on the old schema (error in cPanel → *Errors*).

## 5. Smoke test (10 min)

| Check | Where | Expected |
|---|---|---|
| Sign-in | `/staff` | dashboard loads, new menu items Réception, Serveur, Écrans, Établissement |
| Venue settings | Établissement | upload the logo, paste the real Google review link (Google Business Profile → *Ask for reviews*), save |
| Customer flow | scan a table QR | language picker with 6 flags → menu |
| Waiter | Serveur, on a phone | tables grid → pick table → add dishes → send; ticket on Service board shows the waiter's name |
| Reception | Réception | counter/takeaway order → confirmation with tracking QR; leave idle 2 min → logo-only saver, touch wakes it |
| Rating | mark a served order *Encaissée* | guest tracking page asks for stars, then offers the Google link |
| Screens | Écrans → Ajouter un écran | 6-digit code shown; open `/screen` on the TV, enter the code, upload an image → shows within a minute |
| Analytics | Analyses | bar charts have height again (see note below), guest rating KPI |

## 6. Rollback

Restore `backup-code-*.zip` over `app/` and `public/`. The v3 database stays compatible with the old code (columns were only added), so the database backup is needed only if data itself went wrong.

## Notes for the restaurant

- **TV player hardware**: any smart TV browser works; for reliability use an Android TV / Fire TV stick with a kiosk browser (e.g. Fully Kiosk Browser) set to start on `https://order.apservices.vip/screen`. Videos play muted (browsers block autoplay with sound). Use landscape 16:9 media, H.264 MP4.
- **Offline**: the player keeps the last playlist and the media in its local cache and keeps looping if the Wi-Fi drops; a small red dot appears in the corner while offline.
- **Unpairing a TV**: Écrans → *Réappairer* revokes the old device immediately and shows a new code.
- **Google reviews**: the review link is offered to every guest who rates, whatever the score. Showing it only to happy guests ("review gating") breaks Google's review policy and can get reviews removed.

## What changed in this release (for the record)

- Reception desk ordering and waiter phone ordering (`staff-order-create`, waiter recorded in `orders.created_by`, printed on kitchen tickets).
- Six languages (fr, en, ar, es, de, zh) on the customer page and the dashboard; Arabic right-to-left on both.
- Language picker after the QR scan; star rating then Google review once an order is served and paid.
- Reception screen saver (logo only after idle, wakes on touch or new order) and logo upload.
- Digital signage: screens with pairing codes, image/video library with schedule and targeting, `/screen` player.
- Fixes: inline `style=""` attributes were ignored by the site's CSP in production (analytics bars had no height); upload folders were created `0700` under `umask(0077)` and now get `0755`; `favicon.svg` was missing.
