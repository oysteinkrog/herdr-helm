#!/bin/bash
# remote.sh SANDBOX NAME LINE: the transport for a fake second machine (hc machine add --via).
# hc gives it a shell line to run "there", like ssh would. Here "there" is this computer with a
# private HOME, runtime and state folder under the sandbox, so the fake machine has its own hc
# core, its own folder file and its own freeze state, and can reach nothing real.
# While the file remote-NAME/down exists, it fails, to test a machine that cannot be reached.
S=${1:?sandbox} N=${2:?name}; shift 2
R=/var/tmp/claude/helm-sbx/$S/remote-$N
[ -d "$R/home" ] || { echo "remote.sh: no $R, run add-remote.sh first" >&2; exit 255; }
case "$R" in /var/tmp/claude/helm-sbx/*) ;; *) exit 255 ;; esac
[ -e "$R/down" ] && { echo "remote.sh: down on purpose" >&2; exit 255; }
# Start "there" in its own home, not in the folder the sandbox core happened to start in.
cd "$R/home" || exit 255
exec env -u HC_SOCKET -u HC_TERMINAL_SOCKET -u HC_TERMINAL_ID -u WAYLAND_DISPLAY -u DISPLAY -u HERDR_APP_HOME \
  HOME="$R/home" XDG_RUNTIME_DIR="$R/rt" XDG_STATE_HOME="$R/state" XDG_CONFIG_HOME="$R/home/.config" XDG_CACHE_HOME="$R/cache" \
  sh -c "$*"
