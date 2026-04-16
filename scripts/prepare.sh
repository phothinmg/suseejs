#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

npm run lint --workspaces --if-present
npm run build --workspaces --if-present || echo "Error when building"
npm run fmt --workspaces --if-present