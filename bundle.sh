#!/usr/bin/env bash
#
# Bundle a Next.js “standalone” build into win-bundle/
# so it can be unzipped and run on Windows with:
#   node .next/standalone/server.js
#
set -euo pipefail

# 1. Fresh build
rm -rf .next
npm run build         # requires output:'standalone' in next.config.js

# 2. Clean destination
rm -rf nvl-nlp-bundle
mkdir -p nvl-nlp-bundle/.next

# 3. Always copy the two critical folders verbatim
cp -R .next/standalone         nvl-nlp-bundle/.next/standalone
cp -R .next/static             nvl-nlp-bundle/.next/static

# 4. Copy *exactly* what Next says is required
jq -r '.files[]' < .next/required-server-files.json | while read -r f; do
  mkdir -p "nvl-nlp-bundle/$(dirname "$f")"
  cp -R "$f" "nvl-nlp-bundle/$f"
done

# 5. Optional Windows launcher
cat > nvl-nlp-bundle/start.bat <<'EOF'
@echo off
cd /d "%~dp0\.next\standalone"
node server.js
pause
EOF

echo
echo "✅  Bundle created:  nvl-nlp-bundle/"
