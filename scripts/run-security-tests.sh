#/usr/bin/env bash
set -euo pipefail

echo "Running security tests..."
npm run test:security -- --runInBand --ci