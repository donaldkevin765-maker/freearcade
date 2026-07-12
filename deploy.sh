#!/usr/bin/env bash
# Deploy Chromatic Hub web build to a static host.
# Requires YOUR credentials — Sisyphus cannot run this without them.
# Usage:
#   NETLIFY_AUTH_TOKEN=xxxx ./deploy.sh netlify
#   (GitHub Pages: push this repo to GitHub with the workflow in
#    .github/workflows/deploy-pages.yml enabled; no script needed)
set -euo pipefail
cd "$(dirname "$0")"
TARGET="${1:-netlify}"
case "$TARGET" in
  netlify)
    [ -z "${NETLIFY_AUTH_TOKEN:-}" ] && { echo "Set NETLIFY_AUTH_TOKEN"; exit 1; }
    npx --yes netlify-cli deploy --prod --dir . --auth "$NETLIFY_AUTH_TOKEN"
    ;;
  *)
    echo "Unknown target: $TARGET (use: netlify)"; exit 1 ;;
esac
