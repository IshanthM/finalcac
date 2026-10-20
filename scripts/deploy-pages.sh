#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (GitHub Pages serves it at https://ishanthm.github.io/finalcac/).
# gh-pages is a pure build artifact branch, so it is force-pushed.
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
GITHUB_ACTIONS=true npm run build   # sets the /finalcac/ base path
tmp="$(mktemp -d)"
cp -R dist/. "$tmp"/
touch "$tmp/.nojekyll"
remote="$(git remote get-url origin)"
sha="$(git rev-parse --short HEAD)"
(
  cd "$tmp"
  git init -q -b gh-pages
  git add -A
  git -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" commit -q -m "Deploy $sha"
  git push -q --force "$remote" gh-pages
)
rm -rf "$tmp"
echo "Deployed $sha → https://ishanthm.github.io/finalcac/"
