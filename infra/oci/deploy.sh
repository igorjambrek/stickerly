#!/usr/bin/env bash
# Copy this working tree to the OCI instance and (re)build it there.
#
# The repo is the unit of deployment, not an image registry: the instance has
# four Ampere cores and builds the ARM image itself in a couple of minutes,
# which is one less thing to host. Run from the repo root:
#
#   infra/oci/deploy.sh
#
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"

SITE_ADDRESS="${SITE_ADDRESS:-nalepko.jambrek.com}"
API_ADDRESS="${API_ADDRESS:-api.nalepko.jambrek.com}"
KEY="${KEY:-$HOME/.ssh/nalepko_oci}"

ip="${IP:-$(terraform -chdir="$here" output -raw public_ip)}"
ssh_opts=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10)
remote="ubuntu@$ip"

echo "==> deploying to $ip ($SITE_ADDRESS, $API_ADDRESS)"

# cloud-init installs Docker on first boot; starting a build before it has
# finished fails in a confusing way, so wait for the marker it leaves.
echo "==> waiting for the instance to finish first boot"
for _ in $(seq 1 60); do
  if ssh "${ssh_opts[@]}" "$remote" 'test -f /var/lib/cloud/nalepko-ready' 2>/dev/null; then
    ready=1
    break
  fi
  sleep 10
done
[ "${ready:-}" = 1 ] || { echo "instance never became ready" >&2; exit 1; }

# Ship the source, minus everything that is either rebuilt on the far side or
# belongs to the running deployment (data/ especially — it is the live album
# database on the server).
echo "==> uploading source"
tar czf - -C "$root" \
  --exclude=.git \
  --exclude=node_modules \
  --exclude='*/node_modules' \
  --exclude=dist \
  --exclude='*/dist' \
  --exclude=tmp \
  --exclude=data \
  --exclude=.env \
  --exclude=infra/oci/.terraform \
  --exclude='infra/oci/*.tfstate*' \
  . | ssh "${ssh_opts[@]}" "$remote" 'cat > /tmp/nalepko.tar.gz'

echo "==> building and restarting"
ssh "${ssh_opts[@]}" "$remote" \
  SITE_ADDRESS="$SITE_ADDRESS" API_ADDRESS="$API_ADDRESS" 'bash -seu' <<'REMOTE'
mkdir -p /opt/nalepko
tar xzf /tmp/nalepko.tar.gz -C /opt/nalepko
rm -f /tmp/nalepko.tar.gz
cd /opt/nalepko

printf 'SITE_ADDRESS=%s\nAPI_ADDRESS=%s\n' "$SITE_ADDRESS" "$API_ADDRESS" > .env

docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
REMOTE

echo "==> done — https://$SITE_ADDRESS"
