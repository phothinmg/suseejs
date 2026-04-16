#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

npm run lcov --workspaces --if-present
sleep 1
node __tests__/runner/lcov.mjs