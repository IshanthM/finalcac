#!/usr/bin/env bash
# Removes everything the relay created in your Cloudflare account: the Worker and ALL its Durable Object data
# (every store, zone, tag profile and event log). The GitHub Pages site is unaffected.
# Log in first:  npx wrangler login
set -euo pipefail
cd "$(dirname "$0")/.."
echo "This permanently deletes the 'finalcac-relay' Worker and all stores' data."
read -r -p "Type 'delete' to continue: " answer
[ "$answer" = "delete" ] || { echo "Cancelled."; exit 1; }
npx wrangler delete --name finalcac-relay --force
echo "Done. Verify at https://dash.cloudflare.com → Workers & Pages (no 'finalcac-relay' should remain)."
