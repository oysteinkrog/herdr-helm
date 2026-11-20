#!/bin/bash
# fake-agent.sh STATE APP [KIND] [MSG] [SCREEN]: a stand-in agent for sandbox tests.
# It prints SCREEN (a text file, for example a dialog copied from a real terminal), then reports
# one agent status to Herdr with OSC 7501 every 3 s and does nothing else.
#   STATE  idle, working, done, blocked or error
#   APP    the agent it claims to be (claude, codex, ...)
#   KIND   for blocked: permission, question or auth
#   MSG    the status message, for example "answer: Which colour? (Red · Blue)"
# Run it inside a sandbox terminal: ui.sh hc run --bg -- tools/sbx/fake-agent.sh blocked claude question "..."
state=${1:?state} app=${2:?app} kind=${3:-} msg=${4:-} screen=${5:-}
[ -n "$screen" ] && cat "$screen"
# The message is base64 in the report (it may hold ":", the field separator).
b64=$(printf '%s' "$msg" | base64 | tr -d '\n')
report() { printf '\e]7501;state=%s:app=%s%s%s\a' "$1" "$app" "${kind:+:kind=$kind}" "${msg:+:msg=$b64}"; }
if [ "$state" = done ]; then report working; sleep 3; fi
while :; do report "$state"; sleep 3; done
