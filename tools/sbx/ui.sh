#!/bin/bash
# ui.sh [-n NAME] click|rclick|move X Y | wheel X Y up|down N | drag X1 Y1 X2 Y2 [HOLD_MS] | drop |
#   key KEYS... | type TEXT | shot FILE | do CMD [JSON] | status
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
  wheel) b=5; [ "$4" = up ] && b=4; xdotool mousemove --window "$(w)" "$2" "$3" click --repeat "${5:-1}" --delay 30 "$b" ;;
  drag) xdotool mousemove --window "$(w)" "$2" "$3" mousedown 1 sleep 0.1 mousemove --window "$(w)" "$2" "$(( $3 + 6 ))" sleep 0.1 mousemove --window "$(w)" "$4" "$5" sleep "$(( ${6:-200} / 1000 )).$(printf %03d $(( ${6:-200} % 1000 )))" ;;
  drop) xdotool mouseup 1 ;;
  key) shift; xdotool key --window "$(w)" "$@" ;;
  type) shift; xdotool type --window "$(w)" "$*" ;;
  shot) herdr-app shot "${2:?file}" ;;
  do) shift; herdr-app do "$@" ;;
  status) herdr-app status ;;
  hc) shift; hc "$@" ;;
  sh) shift; "$@" ;;
  *) sed -n '2,5p' "$0"; exit 2 ;;
esac
