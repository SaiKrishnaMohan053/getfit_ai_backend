#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${STAGING_BASE_URL:-https://api-staging.getfitbyhumanai.com}"

echo "Starting E2E smoke tests against: $BASE_URL"

fail() {
  echo "$1"
  exit 1
}

echo "/health"
curl -fsS "$BASE_URL/health" || fail "/health failed"

echo "/coach/query"
curl -fsS -X POST "$BASE_URL/coach/query" \
  -H "Content-Type: application/json" \
  -d '{"userId":"smoke-test","message":"Hello"}' \
  | jq '.answer' > /dev/null || fail "/coach/query failed"

echo "/workout/plan/current"
curl -fsS "$BASE_URL/workout/plan/current?userId=smoke-test" \
  | jq '.plan' > /dev/null || fail "/workout/plan/current failed"

echo "Smoke tests passed."