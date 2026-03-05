#!/usr/bin/env bash
set -euo pipefail

# deploy-github.sh
# Usage:
# 1) Install and login with GitHub CLI: `gh auth login` (interactive)
# 2) Run: `./deploy-github.sh`
# This script will create a user Pages repo named `dfd31345-crypto.github.io`
# (if it doesn't exist) and push the current folder as the site content.

REPO_NAME="dfd31345-crypto.github.io"
OWNER="dfd31345-crypto"
REMOTE_URL="https://github.com/${OWNER}/${REPO_NAME}.git"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh (GitHub CLI) is required. Install it and run 'gh auth login' first."
  exit 1
fi

echo "Creating GitHub repo ${OWNER}/${REPO_NAME} (if needed) and pushing site..."
gh repo create ${OWNER}/${REPO_NAME} --public --confirm || true

git init >/dev/null 2>&1 || true
git checkout -B main
git add .
if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "Publish site for shipzibi.com" || true
fi

# Ensure remote
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${REMOTE_URL}"
else
  git remote add origin "${REMOTE_URL}"
fi

echo "Pushing to GitHub..."
git push -u origin main --force

echo "Done. On GitHub go to Settings → Pages to confirm the custom domain is shipzibi.com."
