#!/usr/bin/env bash
set -euo pipefail

echo "Running unit tests..."
npm run test:unit -- --runInBand --ci --coverage