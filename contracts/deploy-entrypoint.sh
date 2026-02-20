#!/bin/sh
set -e

echo "Waiting for hardhat node..."
until curl -sf -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://hardhat-node:8545 >/dev/null 2>&1; do
  sleep 1
done
echo "Hardhat node is ready"

echo "Deploying contracts..."
npx hardhat run scripts/deploy.js --network localhost

echo "Exporting ABIs..."
node scripts/export-abis.js || true

echo "Deployment complete"

# Copy deployment artifacts to shared volume
cp -f deployment.json /shared/deployment.json
cp -rf artifacts /shared/artifacts 2>/dev/null || true

echo "Artifacts copied to /shared"
