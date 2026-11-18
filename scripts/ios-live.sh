#!/usr/bin/env bash
# Kör appen i iOS med live reload: Angulars dev-server startas, och appen laddar sidan därifrån i
# stället för från den inbyggda kopian. Varje sparad ändring i src/ syns direkt.
#
#   npm run ios:live                  simulatorn (localhost)
#   npm run ios:live -- phone         riktig iPhone på samma wifi (Macens adress hittas automatiskt)
#   HOST=192.168.1.5 npm run ios:live -- phone    om adressen inte hittas
#
# Ctrl+C stoppar dev-servern. Kör `npm run cap:sync` innan en riktig build, så pekar appen inte
# längre på dev-servern.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT=4200
if [ "${1:-}" = "phone" ]; then
  HOST="${HOST:-$(ipconfig getifaddr en0 || ipconfig getifaddr en1)}"
  SERVE_HOST=(--host 0.0.0.0)
else
  # Simulatorn delar Macens nätverk, så localhost funkar (och apiUrl blir http://localhost:3000/api).
  HOST=localhost
  SERVE_HOST=()
fi

npx ng serve --port "$PORT" ${SERVE_HOST[@]+"${SERVE_HOST[@]}"} &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT INT TERM

until curl -s -o /dev/null "http://localhost:$PORT"; do sleep 1; done

echo "Live reload mot http://$HOST:$PORT"
npx cap run ios -l --host "$HOST" --port "$PORT"
wait $SERVER
