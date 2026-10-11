#!/usr/bin/env bash
# Bygger och startar om live-appen (inventory.catso.io) på servern.
# Lokalt:  ./scripts/deploy.sh      (använder ~/.ssh/catso_deploy)
# I CI:    körs av .github/workflows/deploy.yml på push till main.
set -euo pipefail

HOST="${DEPLOY_HOST:-root@185.211.5.180}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/catso_deploy}"
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new "$HOST")
DIR=/opt/inventory-frontend

cd "$(dirname "$0")/.."

echo "→ Skickar källkod till $HOST"
tar czf - --exclude=node_modules --exclude=dist --exclude=.angular --exclude=.git . \
  | "${SSH[@]}" "rm -rf $DIR.new && mkdir -p $DIR.new && tar xzf - -C $DIR.new"

echo "→ Bygger och startar om"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
rm -rf $DIR && mv $DIR.new $DIR
cd $DIR
docker build -t inventory-frontend:new .
docker tag inventory-frontend:new inventory-frontend:latest
docker rm -f inventory-frontend 2>/dev/null || true
docker run -d --name inventory-frontend --restart unless-stopped -p 8081:80 inventory-frontend:latest
docker image prune -f >/dev/null
REMOTE

echo "✓ Klart: https://inventory.catso.io"
