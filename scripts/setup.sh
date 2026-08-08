#!/usr/bin/env bash
# Local development install helper: installs dependencies and builds the
# runtime + creator CLI. This does not curl anything or provision any
# hosted infrastructure — it's a thin wrapper around npm for this repo.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo
echo "Done. Next steps:"
echo "  cp .env.example .env   # then fill in ANTHROPIC_API_KEY"
echo "  node dist/index.js --run"
