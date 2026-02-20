# Emergency Fix Instructions - Ship Minting

## The Problem

**Error:** `WARNING: Calling an account which is not a contract` with address `0xb7f8bc63bbcad18155201308c8f3540b07f84f5e`

**Root Cause:** The ShipNFT contract address in `deployment.json` is **STALE**. When Hardhat node restarts, all contracts are wiped from the blockchain. The backend is trying to call a contract that no longer exists.

## The Solution

You MUST redeploy contracts after every Hardhat node restart.

---

## Step-by-Step Fix

### 1. Restart All Services

```bash
# From the project root - stops everything and starts fresh
docker compose down -v
docker compose up --build
```

This starts a fresh Hardhat blockchain, auto-deploys contracts, and starts the backoffice server.

---

### 2. (Legacy) Manual Redeploy Contracts

If not using Docker:

```bash
cd contracts

# Deploy all contracts to the running Hardhat node
npx hardhat run scripts/deploy.js --network localhost
```

**Expected Output:**
```
Deploying contracts...
✓ GameRegistry deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
✓ Resource tokens deployed
✓ ShipNFT deployed to: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
✓ CelestialBodyRegistry deployed to: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
...
Deployment complete! All contracts deployed.
```

**Critical:** Note that the ShipNFT address has changed. The old address `0xB7f8BC63...` is now invalid.

---

### 3. Verify Deployment (Terminal 2)

```bash
# Check deployment.json was updated with new addresses
cat deployment.json
```

**What to look for:**
- `shipNFT` field should have a NEW address (different from `0xB7f8BC63...`)
- `timestamp` should be recent (within last few minutes)

**Example:**
```json
{
  "chainId": "1337",
  "timestamp": "2026-02-12T04:15:30.123Z",
  "contracts": {
    "shipNFT": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    ...
  }
}
```

---

### 4. Restart All Services

```bash
# From the project root
docker compose down -v
docker compose up --build
```

This restarts the Hardhat node, redeploys contracts, and restarts the backoffice server.

---

### 5. Test Ship Minting

1. Open http://localhost:3000 in your browser
2. Go to **Ships** section
3. Click **Mint Test Ship**
4. Wait for the transaction to complete

**Expected Result:**
- Success toast: "Ship minted successfully! Token ID: 1"
- Ship details panel appears below with:
  - Ship stats (mass, sail area, etc.)
  - Token Bound Account address
  - Resource balances table

---

## Verification Checklist

Before testing, verify:

- [ ] All services are running (`docker compose ps`)
- [ ] Contracts deployed successfully (`docker compose logs contracts-deploy`)
- [ ] Backoffice is healthy (`curl http://localhost:3000/health`)
- [ ] Browser has refreshed the page (Ctrl+R or Cmd+R)

---

## What If It Still Fails?

### Error: "ShipNFT contract not deployed yet"

**Cause:** Backoffice server didn't read the new `deployment.json`

**Fix:**
1. Check deployment logs: `docker compose logs contracts-deploy`
2. Restart services: `docker compose restart backoffice`
3. Verify server logs show the correct ShipNFT address: `docker compose logs backoffice`

---

### Error: "ShipMinted event not found in transaction receipt"

**Cause:** The smart contract may not be emitting the `ShipMinted` event correctly

**Fix:**
1. Check the contract code at `contracts/contracts/ShipNFT.sol`
2. Verify the `mintShip` function emits `ShipMinted(tokenId, to, className)`
3. Redeploy contracts (Step 2)

---

### Error: "Unable to load Token Bound Account data"

**Cause:** TBA address lookup failed or resource token addresses are invalid

**Fix:**
1. Verify all resource tokens are deployed (check `deployment.json`)
2. Check that `resources` object has all tokens: CH4, O2, H2O, CO2, N2
3. Redeploy contracts if any are missing (Step 2)

---

### Error: Browser console shows 404 or network errors

**Cause:** Frontend trying to fetch from wrong server URL

**Fix:**
1. Check that backoffice server is running on http://localhost:3000
2. Open browser console (F12) and check the Network tab
3. Verify requests are going to `http://localhost:3000/api/...`

---

## Quick Recovery Commands

If something goes wrong, rebuild everything from scratch:

```bash
docker compose down -v
docker compose up --build
```

Then refresh your browser (Ctrl+R or Cmd+R) and try again.

---

## Understanding the Fix

### What Changed in the Code?

**Backend (`server/routes/ships.js`):**
- **REMOVED** `staticCall` approach (lines 29-38) - it was calling a non-existent contract
- **REPLACED** with event parsing from transaction receipt
- **ethers.js v6 syntax:** `shipNFT.interface.parseLog(log)` takes the entire log object
- **Safety check:** Throws error if `ShipMinted` event is not found

**Frontend (`public/js/ui/ships.js`):**
- **ADDED** null check for `shipData` structure
- **ENHANCED** error handling for missing TBA data
- **IMPROVED** defensive coding to prevent crashes

---

## Why Does This Happen?

Hardhat node is an **in-memory blockchain**. When you restart it:
1. All contract state is WIPED (like restarting a computer with no hard drive)
2. All deployed contracts are DELETED
3. Contract addresses become invalid (they point to empty accounts)

**Solution:** Always redeploy contracts after restarting Hardhat node.

**Alternative:** Use a persistent blockchain like Ganache or a testnet, but Hardhat node is faster for development.

---

## Success Indicators

You'll know it's working when:

1. **Terminal 1** (Hardhat node):
   - Shows RPC requests without errors
   - No "revert" messages

2. **Terminal 2** (Deployment):
   - Shows "Deployment complete!"
   - `deployment.json` has updated timestamp

3. **Terminal 3** (Backoffice server):
   - Shows "Server running on http://localhost:3000"
   - Logs show correct contract addresses

4. **Browser**:
   - Ship mints successfully (green success toast)
   - Ship details panel displays correctly
   - No red error toasts

---

## Maintenance Tip

**Docker Compose handles all startup automation:**

```bash
# Start everything (blockchain, deploy, backoffice, frontend)
docker compose up --build

# Full reset (wipe blockchain state)
docker compose down -v
docker compose up --build
```

---

## Questions?

If you encounter an error not covered here:

1. Check the browser console (F12 → Console tab)
2. Check the backoffice server logs (Terminal 3)
3. Check the Hardhat node logs (Terminal 1)
4. Look for the exact error message and compare to this document

Remember: **Most issues are solved by redeploying contracts and restarting the server.**
