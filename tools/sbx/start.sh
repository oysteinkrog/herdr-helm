#!/bin/bash
# start.sh [NAME]: herdr-app on a private Xvfb display, with its own hc core, its own HOME and
# its own app home. Nothing here touches the real screen, the real core or ~/.config/herdr-app.
#
# The run folder is /var/tmp/claude/helm-sbx/NAME (NAME defaults to "a"). The first start copies
# the real app home and the real space folder file into it (reflinked, read only on the real
# side). Later starts reuse that copy. Run it in the background: it stays in the foreground for
# as long as the app runs. Stop it with stop.sh NAME.
#
# WAYLAND_DISPLAY is unset, not a dummy name: gpui panics on a dummy name. The wayland-0 fallback
# cannot reach the real compositor because XDG_RUNTIME_DIR is private.
set -eu
name=${1:-a}
run=/var/tmp/claude/helm-sbx/$name
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$run/rt" "$run/cache" "$run/state" "$run/home/.config"
chmod 700 "$run/rt"
app=$run/home/.config/herdr-app
if [ ! -d "$app" ]; then
  cp -a --reflink=auto "$HOME/.config/herdr-app" "$app"
  rm -f "$app/herdr-app.sock"
  [ -f "$HOME/.config/herdr-space-folders.json" ] && cp "$HOME/.config/herdr-space-folders.json" "$run/home/.config/"
fi
# A display at :20 or above that nobody holds. Never let Xvfb pick (it may take :0).
n=20; rm -f "$run/display"
while :; do
  while [ -e "/tmp/.X$n-lock" ] || [ -e "/tmp/.X11-unix/X$n" ]; do n=$((n + 1)); done
  Xvfb ":$n" -displayfd 4 -screen 0 1600x1000x24 -nolisten tcp 4>"$run/display" 2>"$run/xvfb.log" &
  echo $! >"$run/xvfb.pid"
  until [ -s "$run/display" ] || ! kill -0 "$(cat "$run/xvfb.pid")" 2>/dev/null; do sleep 0.1; done
  [ -s "$run/display" ] && break
  n=$((n + 1))
done
cat >"$run/env" <<EOT
export HOME=$run/home DISPLAY=:$(cat "$run/display") XAUTHORITY=/dev/null SHELL=/usr/bin/fish
export XDG_RUNTIME_DIR=$run/rt XDG_CACHE_HOME=$run/cache XDG_STATE_HOME=$run/state XDG_CONFIG_HOME=$run/home/.config
export HERDR_APP_HOME=$app PATH=$HOME/.local/bin:$HOME/bin:\$PATH
unset WAYLAND_DISPLAY HC_SOCKET HC_TERMINAL_SOCKET HC_TERMINAL_ID CLAUDE_CODE_CHILD_SESSION CLAUDECODE CLAUDE_CODE_ENTRYPOINT AIOLOS_RC_PORT AIOLOS_RC_SCOPED LD_PRELOAD DBUS_SESSION_BUS_ADDRESS
EOT
. "$run/env"
"$here/guard.sh" "$run/env"
hc server start >"$run/hc.log" 2>&1
trap 'hc server stop >/dev/null 2>&1; kill "$(cat "$run/xvfb.pid")" 2>/dev/null' EXIT
# A session bus that activates no system services (see the headless-app-ui skill).
conf=/home/$(id -un)/.claude/skills/headless-app-ui/headless-session.conf
opt=(); [ -f "$conf" ] && opt=(--config-file="$conf")
dbus-run-session "${opt[@]}" -- sh -c 'echo $$ >"$1/app.pid"; exec herdr-app' sh "$run" >"$run/app.log" 2>&1
