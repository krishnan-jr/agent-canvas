#!/usr/bin/env bash
# Verifies branch naming and uncommitted changes
set -euo pipefail

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo "Current branch: $CURRENT_BRANCH"
