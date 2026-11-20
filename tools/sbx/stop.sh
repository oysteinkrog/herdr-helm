#!/bin/bash
# stop.sh [NAME]: stop the sandbox NAME's app, core and display, by the ids this sandbox recorded.
name=${1:-a}
run=/var/tmp/claude/helm-sbx/$name
"$(dirname "$0")/guard.sh" "$run/env" || exit 3
. "$run/env"
herdr-app do window.close >/dev/null 2>&1 || true
sleep 1
[ -f "$run/app.pid" ] && kill "$(cat "$run/app.pid")" 2>/dev/null
hc server stop >/dev/null 2>&1 || true
[ -f "$run/xvfb.pid" ] && kill "$(cat "$run/xvfb.pid")" 2>/dev/null
true
