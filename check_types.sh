#!/usr/bin/env bash
set -e

echo "Running Deno type checker on all server and shared TypeScript files..."

# Find all .ts files in server and shared directories
# Exclude .d.ts if any
TS_FILES=$(find server shared -name "*.ts" -not -name "*.d.ts")

for file in $TS_FILES; do
  echo "Checking $file..."
  deno check --config server/deno.json "$file"
done

echo "Successfully type-checked all files!"
