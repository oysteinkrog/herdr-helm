#!/bin/bash
# ui.sh [-n NAME] click|rclick|move X Y | key KEYS... | type TEXT | shot FILE | do CMD [JSON] | status
# Drives the sandbox window NAME (default "a") only. Refuses if the sandbox env is missing or
# points anywhere real (guard.sh).
name=a
[ "${1:-}" = -n ] && { name=$2; shift 2; }
E=/var/tmp/claude/helm-sbx/$name/env
"$(dirname "$0")/guard.sh" "$E" || exit 3
. "$E"
w() { xdotool search --name '^Herdr' | head -1; }
case ${1:-} in
  click) xdotool mousemove --window "$(w)" "$2" "$3" click 1 ;;
  dclick) xdotool mousemove --window "$(w)" "$2" "$3" click --repeat 2 1 ;;
  rclick) xdotool mousemove --window "$(w)" "$2" "$3" click 3 ;;
  move) xdotool mousemove --window "$(w)" "$2" "$3" ;;
  key) shift; xdotool key --window "$(w)" "$@" ;;
  type) shift; xdotool type --window "$(w)" "$*" ;;
  shot) herdr-app shot "${2:?file}" ;;
  do) shift; herdr-app do "$@" ;;
  status) herdr-app status ;;
  hc) shift; hc "$@" ;;
  sh) shift; "$@" ;;
  *) sed -n '2,4p' "$0"; exit 2 ;;
esac
