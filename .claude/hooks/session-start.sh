#!/bin/bash
set -euo pipefail

# Kasma SessionStart hook.
# Installs Node dependencies so lint, typecheck, build, and tests work
# immediately in Claude Code on the web sessions.

# Only run in remote (web) sessions; local sessions manage their own setup.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Ensure pnpm is available (Corepack ships with Node) and install deps.
# `pnpm install` (not `--frozen-lockfile`) benefits from container caching
# and stays resilient if the lockfile is mid-update.
corepack enable >/dev/null 2>&1 || true
pnpm install --prefer-offline
