#!/bin/bash
# guard.sh ENVFILE: exit 3 unless ENVFILE describes a sandbox. Every sandbox script calls it
# before it acts, so nothing reaches the real window, display or core.
E=${1:?usage: guard.sh ENVFILE}
[ -f "$E" ] || { echo "guard: no $E, refusing" >&2; exit 3; }
(
  . "$E"
  case "${HERDR_APP_HOME:-}" in /var/tmp/claude/helm-sbx/*) ;; *) echo "guard: HERDR_APP_HOME is not a sandbox folder" >&2; exit 3 ;; esac
  case "${HOME:-}" in /var/tmp/claude/helm-sbx/*) ;; *) echo "guard: HOME is not a sandbox folder" >&2; exit 3 ;; esac
  case "${XDG_RUNTIME_DIR:-}" in /var/tmp/claude/helm-sbx/*) ;; *) echo "guard: XDG_RUNTIME_DIR is not private" >&2; exit 3 ;; esac
  case "${DISPLAY:-}" in :0|:0.*|"") echo "guard: refusing DISPLAY=${DISPLAY:-}" >&2; exit 3 ;; esac
  [ -z "${WAYLAND_DISPLAY:-}" ] || { echo "guard: WAYLAND_DISPLAY is set" >&2; exit 3; }
)
