#!/bin/bash
# End-to-end checks of the real api.php/upload.php against a v2-shaped database (migrated to v3 on first request).
#   ./test/api-test.sh        (needs php-cli with pdo_sqlite + gd; starts its own server via test/serve.sh)
cd "$(dirname "$0")/.." || exit 1
./test/serve.sh /tmp/aps-api-test >/dev/null
B=http://127.0.0.1:4190 J=$(mktemp) PASS=0 FAILN=0 CSRF=''
get(){ curl -s -b "$J" -c "$J" "$B/api.php?action=$1$2" "${@:3}"; }
post(){ curl -s -b "$J" -c "$J" "$B/api.php?action=$1" -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" -H "Origin: $B" -d "$2"; }
up(){ curl -s -b "$J" -c "$J" "$B/upload.php" -H "Origin: $B" -F csrf="$CSRF" "$@"; }
js(){ php -r '$x=json_decode(stream_get_contents(STDIN),true);echo '"$1"';'; }
check(){ if [[ "$2" == *"$3"* ]]; then PASS=$((PASS+1)); else FAILN=$((FAILN+1)); echo "FAIL: $1 -> $2"; fi; }
sql(){ php -r '$d=new PDO("sqlite:/tmp/aps-api-test/orders.sqlite");echo $d->query($argv[1])->fetchColumn();' "$1"; }
login(){ rm -f "$J"; CSRF=$(get session | js '$x["csrf"]'); R=$(post login "{\"email\":\"$1\",\"password\":\"zellige-test-passphrase-2026\"}"); CSRF=$(echo "$R" | js '$x["csrf"]'); }

CSRF=$(get session | js '$x["csrf"]')
M=$(get menu '&slug=dar-zellige&table=tok1a1b2c3d4e5f6a7b8c9d0e1f2')
check "migrated to v3" "$(sql 'PRAGMA user_version')" 3
check "menu offers six languages" "$M" '"languages":["fr","en","ar","es","de","zh"]'
check "menu has es/de/zh columns" "$M" '"name_zh":""'
O=$(post order-create '{"slug":"dar-zellige","table_token":"tok1a1b2c3d4e5f6a7b8c9d0e1f2","order_type":"table","payment_method":"table","guest_count":2,"items":[{"item_id":4,"quantity":2}]}')
check "customer order still works" "$O" '"total":26400'
ID=$(echo "$O" | js '$x["public_id"]'); TK=$(echo "$O" | js '$x["status_token"]')
check "rating refused before served+paid" "$(post order-rate "{\"id\":\"$ID\",\"token\":\"$TK\",\"rating\":5}")" '"error":"conflict"'
check "csrf enforced" "$(curl -s -b "$J" "$B/api.php?action=order-rate" -H 'Content-Type: application/json' -d '{}')" '"error":"csrf"'

login omar@darzellige.ma
W=$(post staff-order-create '{"order_type":"table","table_id":2,"guest_count":3,"items":[{"item_id":3,"quantity":1,"note":"sans olives"}]}')
check "waiter order created as confirmed" "$(sql "SELECT status||'/'||created_by FROM orders ORDER BY id DESC LIMIT 1")" "confirmed/2"
check "waiter order priced by server" "$W" '"total":10450'
check "unknown table refused" "$(post staff-order-create '{"order_type":"table","table_id":99,"guest_count":1,"items":[{"item_id":5,"quantity":1}]}')" '"error":"not_found"'
check "dashboard shows waiter name" "$(get dashboard)" '"created_by_name":"Omar"'
check "staff cannot change settings" "$(post restaurant-settings '{"id":1}')" '"error":"forbidden"'
check "staff cannot manage screens" "$(post screen-save '{"name":"x"}')" '"error":"forbidden"'
OID=$(sql "SELECT id FROM orders WHERE public_id='$ID'")
post order-update "{\"id\":$OID,\"status\":\"served\",\"payment_status\":\"paid\"}" >/dev/null

login nadia@darzellige.ma
check "rating accepted once served+paid" "$(post order-rate "{\"id\":\"$ID\",\"token\":\"$TK\",\"rating\":4,\"comment\":\"Très bon\"}")" '"google_review_url"'
check "rating only once" "$(post order-rate "{\"id\":\"$ID\",\"token\":\"$TK\",\"rating\":1}")" '"error":"conflict"'
check "settings reject non-https link" "$(post restaurant-settings '{"id":1,"google_review_url":"javascript:alert(1)"}')" '"error":"validation"'
check "settings saved" "$(post restaurant-settings '{"id":1,"google_review_url":"https://g.page/r/test/review","languages":["en","zh"],"default_language":"de"}')" '"ok":true'
check "fr forced, unknown default falls back" "$(sql "SELECT languages||default_language FROM restaurants WHERE id=1")" '["fr","en","zh"]fr'
check "screen created with pin" "$(post screen-save '{"name":"Entrée"}')" '"id":1'
php -r '$i=imagecreatetruecolor(800,450);imagefill($i,0,0,imagecolorallocate($i,15,110,93));imagepng($i,"/tmp/aps-t.png");file_put_contents("/tmp/aps-t.mp4","\0\0\0\x20ftypisom\0\0\x02\0isomiso2avc1mp41".str_repeat("\0",4000));file_put_contents("/tmp/aps-t.mov","\0\0\0\x14ftypqt  \0\0\x02\0qt  ".str_repeat("\0",400));file_put_contents("/tmp/aps-t.php.mp4","<?php system(\$_GET[1]);?>");'
check "signage image upload" "$(up -F kind=signage -F restaurant_id=1 -F title=Promo -F file=@/tmp/aps-t.png)" '"kind":"image"'
check "signage video upload" "$(up -F kind=signage -F restaurant_id=1 -F screen_id=1 -F file=@/tmp/aps-t.mp4)" '"kind":"video"'
check "quicktime refused" "$(up -F kind=signage -F restaurant_id=1 -F file=@/tmp/aps-t.mov)" '"error":"media"'
check "php disguised as mp4 refused" "$(up -F kind=signage -F restaurant_id=1 -F file=@/tmp/aps-t.php.mp4)" '"error":"media"'
check "logo upload" "$(up -F kind=logo -F restaurant_id=1 -F image=@/tmp/aps-t.png)" '"logo_path"'
check "item photo upload still works" "$(up -F item_id=1 -F image=@/tmp/aps-t.png)" '"image_path"'
check "upload folders readable by web server" "$(stat -c %a new/public/uploads/1/signage)" 755
PIN=$(sql "SELECT pin FROM screens WHERE id=1")
check "wrong pin refused" "$(post screen-pair '{"pin":"000000"}')" '"error":"pin"'
T=$(post screen-pair "{\"pin\":\"$PIN\"}"); TOKEN=$(echo "$T" | js '$x["token"]')
check "screen paired" "$T" '"token"'
check "pin single-use" "$(post screen-pair "{\"pin\":\"$PIN\"}")" '"error":"pin"'
P=$(get screen-playlist '' -H "X-Screen-Token: $TOKEN")
check "playlist has both items" "$(echo "$P" | js 'count($x["items"])')" 2
check "bad token refused" "$(get screen-playlist '' -H "X-Screen-Token: $(printf 'b%.0s' {1..64})")" '"error":"auth"'
CID=$(sql "SELECT id FROM signage_content WHERE kind='image'")
check "end before start refused" "$(post signage-save "{\"id\":$CID,\"duration\":8,\"start_date\":\"2026-05-01\",\"end_date\":\"2026-01-01\",\"active\":true}")" '"error":"validation"'
post signage-save "{\"id\":$CID,\"duration\":8,\"start_date\":\"2020-01-01\",\"end_date\":\"2020-12-31\",\"active\":true}" >/dev/null
check "expired item leaves playlist" "$(get screen-playlist '' -H "X-Screen-Token: $TOKEN" | js 'count($x["items"])')" 1
F=$(sql "SELECT path FROM signage_content WHERE kind='video'"); VID=$(sql "SELECT id FROM signage_content WHERE kind='video'")
post signage-delete "{\"id\":$VID}" >/dev/null
check "deleted media file removed" "$([ -e "new/public$F" ] && echo present || echo gone)" gone
post screen-pin '{"id":1}' >/dev/null
check "re-pair revokes the TV" "$(get screen-playlist '' -H "X-Screen-Token: $TOKEN")" '"error":"auth"'
for i in $(seq 1 11); do R=$(post screen-pair '{"pin":"111111"}'); done
check "pin attempts rate-limited" "$R" '"error":"rate"'

rm -rf new/public/uploads "$J" /tmp/aps-t.*; kill "$(cat /tmp/aps-php.pid)" 2>/dev/null
echo "passed $PASS, failed $FAILN"; [ "$FAILN" = 0 ]
