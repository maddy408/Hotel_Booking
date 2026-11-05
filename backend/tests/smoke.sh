#!/usr/bin/env bash
# End-to-end curl smoke test against a running backend (php -S or Apache).
# Usage: BASE_URL=http://127.0.0.1:8099 ./tests/smoke.sh
set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8099}"
PASS=0
FAIL=0

check() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    PASS=$((PASS + 1))
    echo "  ok   $desc"
  else
    FAIL=$((FAIL + 1))
    echo "  FAIL $desc"
    echo "       expected to contain: $expected"
    echo "       got: $actual"
  fi
}

echo "== health =="
check "health check" '"status":"ok"' "$(curl -s "$BASE_URL/health")"

echo "== auth =="
LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"Welcome@123"}')
check "login succeeds" '"accessToken"' "$LOGIN"
ACCESS=$(php -r "echo json_decode('$LOGIN', true)['data']['accessToken'] ?? '';" 2>/dev/null)
AUTH="Authorization: Bearer $ACCESS"

check "bad password rejected" 'unauthorized' "$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"wrong"}')"
check "unauthenticated request rejected" 'unauthorized' "$(curl -s "$BASE_URL/auth/me")"
check "/auth/me with token" '"username":"admin"' "$(curl -s "$BASE_URL/auth/me" -H "$AUTH")"

echo "== rooms =="
ROOMS=$(curl -s "$BASE_URL/rooms" -H "$AUTH")
check "rooms list has counts" '"counts"' "$ROOMS"

echo "== bookings/guests/bills/reports/room-master =="
check "reservations list" 'success":true' "$(curl -s "$BASE_URL/reservations" -H "$AUTH")"
check "guests search" 'success":true' "$(curl -s "$BASE_URL/guests?q=" -H "$AUTH")"
check "done stays list" 'success":true' "$(curl -s "$BASE_URL/stays" -H "$AUTH")"
check "today report" '"occupancy"' "$(curl -s "$BASE_URL/reports/today" -H "$AUTH")"
check "room types list" 'success":true' "$(curl -s "$BASE_URL/room-types" -H "$AUTH")"
check "settings" '"gst_slab1_max_rate"' "$(curl -s "$BASE_URL/settings" -H "$AUTH")"

echo "== RBAC =="
RLOGIN=$(curl -s -X POST "$BASE_URL/auth/login" -H "Content-Type: application/json" -d '{"username":"receptionist","password":"Welcome@123"}')
RACCESS=$(php -r "echo json_decode('$RLOGIN', true)['data']['accessToken'] ?? '';" 2>/dev/null)
check "receptionist blocked from /users" 'forbidden' "$(curl -s "$BASE_URL/users" -H "Authorization: Bearer $RACCESS")"

echo
echo "---------------------------------------------"
echo "Passed: $PASS   Failed: $FAIL"
[[ "$FAIL" -eq 0 ]]
