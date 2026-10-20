#!/usr/bin/env bash
# Blocks a commit that stages secret-looking files or strings. Installed as .git/hooks/pre-commit (see scripts/install-hooks.sh).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
bad=0
# 1) Files that should never be committed.
while IFS= read -r f; do
  case "$f" in
    .env|.env.*|*.local|.dev.vars|.dev.vars.*|*.pem|*.key|*.p12|.wrangler/*|recordings/*.wav|recordings/*.m4a)
      [ "$f" = ".env.example" ] && continue
      echo "BLOCKED: staging $f (secret or private file)"; bad=1 ;;
  esac
done < <(git diff --cached --name-only --diff-filter=ACM)
# 2) Secret-looking strings in the added lines.
if git diff --cached -U0 -- . ':!package-lock.json' | grep -E '^\+' | grep -vE '^\+\+\+' \
   | grep -nIE '(CLOUDFLARE_API_TOKEN|CF_API_TOKEN|api[_-]?key|secret|passw(or)?d|bearer )[^a-z]{0,6}[=:]\s*["'"'"']?[A-Za-z0-9_\-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----'; then
  echo "BLOCKED: a staged line looks like a secret"; bad=1
fi
[ "$bad" = 0 ] || { echo "Commit aborted. Remove the secret (use .env.production.local / wrangler secrets) and try again."; exit 1; }
