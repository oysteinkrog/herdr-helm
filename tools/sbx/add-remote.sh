#!/bin/bash
# add-remote.sh [-n SANDBOX] NAME | --rm NAME | --down NAME | --up NAME: add a fake second machine
# to a sandbox's hc core (see remote.sh), with helm installed in its own app folder; remove it
# and stop its core; or make its transport fail (and work again) to test a machine that is gone.
S=a
[ "${1:-}" = -n ] && { S=$2; shift 2; }
D=$(cd "$(dirname "$0")" && pwd)
U="$D/ui.sh -n $S"
case ${1:-} in
  --down) touch "/var/tmp/claude/helm-sbx/$S/remote-${2:?name}/down"; exit 0 ;;
  --up) rm -f "/var/tmp/claude/helm-sbx/$S/remote-${2:?name}/down"; exit 0 ;;
esac
if [ "${1:-}" = --rm ]; then
  N=${2:?name}
  $U hc machine rm "$N"
  # The fake machine's own core: stop it through its own private socket.
  "$D/remote.sh" "$S" "$N" "hc server stop" >/dev/null 2>&1
  exit 0
fi
N=${1:?name}
R=/var/tmp/claude/helm-sbx/$S/remote-$N
{
  mkdir -p "$R/home/.config/herdr-app/mods" "$R/rt" "$R/state" "$R/cache"
  chmod 700 "$R/rt"
  rsync -a --delete "$D/../../helm/" "$R/home/.config/herdr-app/mods/helm/"
  [ -f "$R/home/.config/herdr-space-folders.json" ] || echo '{"list":[],"of":{}}' > "$R/home/.config/herdr-space-folders.json"
}
$U hc machine add --via "$D/remote.sh $S $N" --name "$N"
