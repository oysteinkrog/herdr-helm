#!/bin/bash
# check-all.sh: run the plain Node tests and herdr-app check on helm. herdr-app check passes no
# props, so helm/main.js draws every part in that case (PLAN.md 2.9): one check covers them all.
set -e
cd "$(dirname "$0")/.."
node --import ./tests/register.mjs --test 'tests/**/*.test.mjs' 2>&1 | grep -E '^# (pass|fail)|^not ok'
herdr-app check helm
