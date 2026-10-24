#!/usr/bin/env bash
# Exécute les variantes de test des deux workflows dans un vrai n8n (Docker), sans compte :
# webhook, Gmail, Sheets et l'API Claude sont remplacés par des nœuds Code ; Switch et IF sont les vrais nœuds.
set -euo pipefail
cd "$(dirname "$0")/.."

# Même version que le serveur (freelance-pipeline/infra/docker-compose.yml).
IMAGE="${N8N_IMAGE:-n8nio/n8n:2.44.6}"
DIR=.n8n-test
rm -rf "$DIR"
npx tsx scripts/build-n8n.ts --test "$DIR"
chmod -R a+rwX "$DIR"

echo "Exécution dans $IMAGE…"
docker run --rm --user node -v "$PWD/$DIR:/data" -e N8N_DIAGNOSTICS_ENABLED=false --entrypoint sh "$IMAGE" -c '
  for f in /data/kit1-*-test.json; do n8n import:workflow --input="$f" > /dev/null 2>&1; done
  n8n execute --id=kit1DemoWebhTest --rawOutput > /data/demo-resultat.json 2> /data/demo.log || true
  n8n execute --id=kit1ModeleTrTest --rawOutput > /data/modele-resultat.json 2> /data/modele.log || true
'
npx tsx scripts/verifier-n8n.ts "$DIR"
