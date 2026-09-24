#!/usr/bin/env bash
# ==============================================================================
# ErgoSense 360 - Security Verification & Attack-Surface Audit Script
# ==============================================================================

set -euo pipefail

TARGET_URL="${1:-https://ergosense.yourdomain.com}"

echo "=========================================================================="
echo " Running Production Attack-Surface & Security Audit..."
echo " Target URL: $TARGET_URL"
echo "=========================================================================="

# 1. Audit Listening Sockets on Host
echo ""
echo "[1/5] Checking Host Listening Sockets (Postgres 5432 & Redis 6379 must NOT appear)..."
if command -v ss &>/dev/null; then
  LEAKED_PORTS=$(ss -tulpn | grep -E ':(5432|6379)' || true)
  if [ -n "$LEAKED_PORTS" ]; then
    echo "[-] FAILED: Database or Cache port exposed on host!"
    echo "$LEAKED_PORTS"
  else
    echo "[+] PASSED: Zero host port exposure for 5432 and 6379."
  fi
fi

# 2. Inspect Docker Port Bindings
echo ""
echo "[2/5] Inspecting Docker Port Mappings..."
if command -v docker &>/dev/null; then
  docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
fi

# 3. Verify Container Non-Root UID execution
echo ""
echo "[3/5] Verifying Non-Root Execution across running containers..."
if command -v docker &>/dev/null; then
  for container in ergosense_backend ergosense_frontend ergosense_edge_proxy ergosense_postgres ergosense_redis; do
    if docker ps -q -f name="$container" | grep -q .; then
      USER_ID=$(docker top "$container" -eo user | sed 1d | head -n 1)
      echo "  - $container running as UID: $USER_ID"
    fi
  done
fi

# 4. Audit HTTP Security Headers
echo ""
echo "[4/5] Auditing HTTP Response Security Headers..."
HEADERS=$(curl -s -I "$TARGET_URL" || true)

check_header() {
  local header_name="$1"
  if echo "$HEADERS" | grep -iq "^$header_name:"; then
    echo "  [✓] $header_name is present."
  else
    echo "  [✗] WARNING: $header_name is missing!"
  fi
}

check_header "Strict-Transport-Security"
check_header "X-Frame-Options"
check_header "X-Content-Type-Options"
check_header "Referrer-Policy"
check_header "Content-Security-Policy"
check_header "Cross-Origin-Opener-Policy"
check_header "Cross-Origin-Embedder-Policy"

# 5. Test Vulnerability Scanner Blocking
echo ""
echo "[5/5] Testing Vulnerability Scanner User-Agent Blocking (sqlmap)..."
SCANNER_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -A "sqlmap/1.5" "$TARGET_URL/api/health" || true)
if [ "$SCANNER_HTTP_CODE" = "403" ]; then
  echo "  [✓] PASSED: Scanner user-agent successfully blocked with HTTP 403 Forbidden."
else
  echo "  [✗] WARNING: Scanner test returned HTTP $SCANNER_HTTP_CODE (Expected 403)."
fi

echo ""
echo "=========================================================================="
echo " Security verification complete!"
echo "=========================================================================="
