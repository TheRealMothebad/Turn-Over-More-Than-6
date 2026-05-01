#!/usr/bin/env bash
# This script compiles the shared TypeScript code into JavaScript for the client.
set -e

echo "Bundling shared/game.ts for the client..."
deno bundle -o client/game.shared.js shared/game.ts
echo "Bundle complete: client/game.shared.js created."

echo "Trimming last 4 lines from client/game.shared.js..."
mv client/game.shared.js client/game.shared.js.tmp
head -n -4 client/game.shared.js.tmp > client/game.shared.js
rm client/game.shared.js.tmp
echo "Trimming complete."
