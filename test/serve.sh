#!/bin/sh
# Starts the real PHP backend on 127.0.0.1:4190 against a fresh v2-shaped test database (migrates to v3 on first request).
DIR=${1:-/tmp/aps-test}
[ -f /tmp/aps-php.pid ] && kill "$(cat /tmp/aps-php.pid)" 2>/dev/null; sleep 0.3
php "$(dirname "$0")/seed-v2.php" "$DIR" >/dev/null
APS_ORDER_ENV=test APS_ORDER_TEST_DIR="$DIR" php -S 127.0.0.1:4190 -t "$(dirname "$0")/../new/public" "$(dirname "$0")/router.php" >/tmp/aps-php.log 2>&1 &
echo $! >/tmp/aps-php.pid; sleep 0.8; echo "php backend on http://127.0.0.1:4190 (pid $(cat /tmp/aps-php.pid))"
