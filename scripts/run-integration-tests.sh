#!/usr/bin/env bash
set -euo pipefail

echo "Running integration tests..."
npm run test:int -- --runInBand --ci