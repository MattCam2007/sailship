# Expected Terminal Outputs - Verification Guide

This document shows exactly what you should see in each terminal during the setup process.

---

## Terminal 1: Hardhat Node

### Command
```bash
cd /Users/mattcameron/Projects/sailship/contracts
npx hardhat node
```

### Expected Output
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Accounts
========

WARNING: These accounts, and their private keys, are publicly known.
Any funds sent to them on Mainnet or any other live network WILL BE LOST.

Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (10000 ETH)
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

...

WARNING: These accounts, and their private keys, are publicly known.
Any funds sent to them on Mainnet or any other live network WILL BE LOST.
```

**Keep this terminal running.** It's your local blockchain.

### During Usage
When contracts are deployed and transactions are sent, you'll see RPC requests:

```
eth_chainId
eth_accounts
eth_estimateGas
eth_sendTransaction
  Contract deployment: ShipNFT
  Transaction: 0x1234...
  Contract deployed to: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
```

**Red flags (bad):**
```
Error: VM Exception while processing transaction: revert
```
This means a contract call failed (usually wrong parameters or contract not deployed).

---

## Terminal 2: Contract Deployment

### Command
```bash
cd /Users/mattcameron/Projects/sailship/contracts
npx hardhat run scripts/deploy.js --network localhost
```

### Expected Output
```
Deploying contracts with account: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

Deploying GameRegistry...
GameRegistry deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3

Deploying Resource tokens...
CH4 (Methane) deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
O2 (Oxygen) deployed to: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
H2O (Water) deployed to: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
CO2 (Carbon Dioxide) deployed to: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
N2 (Nitrogen) deployed to: 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707

Deploying ShipNFT...
ShipNFT deployed to: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853

Deploying CelestialBodyRegistry...
CelestialBodyRegistry deployed to: 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6

Deploying Celestial Bodies...
TITAN deployed to: 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
EUROPA deployed to: 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
MARS deployed to: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
VENUS deployed to: 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0

Saving deployment addresses to deployment.json...

Deployment complete!
```

**Important:** The addresses will be different each time you deploy. This is normal.

### Verify deployment.json
```bash
cat deployment.json
```

**Expected content:**
```json
{
  "chainId": "1337",
  "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "timestamp": "2026-02-12T04:30:15.123Z",
  "contracts": {
    "gameRegistry": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    "resources": {
      "CH4": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      "O2": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      "H2O": "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
      "CO2": "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
      "N2": "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
    },
    "shipNFT": "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
    "celestialBodyRegistry": "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
    "celestialBodies": {
      "TITAN": "0x8A791620dd6260079BF849Dc5567aDC3F2FdC318",
      "EUROPA": "0x610178dA211FEF7D417bC0e6FeD39F05609AD788",
      "MARS": "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
      "VENUS": "0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0"
    }
  }
}
```

**Check:**
- ✓ `timestamp` is recent (last few minutes)
- ✓ `shipNFT` has an address (not null)
- ✓ All resource tokens have addresses
- ✓ All celestial bodies have addresses

**Red flags (bad):**
- Timestamp is old (from hours or days ago) → Contracts not redeployed
- Missing addresses → Deployment failed
- Address is `0xb7f8bc63bbcad18155201308c8f3540b07f84f5e` → This is the OLD STALE address

---

## Terminal 3: Backoffice Server

### Command
```bash
cd /Users/mattcameron/Projects/sailship/backoffice
npm start
```

### Expected Output
```
> backoffice@1.0.0 start
> node server/server.js

Server running on http://localhost:3000
Using contract addresses from: /Users/mattcameron/Projects/sailship/contracts/deployment.json

Contract Addresses:
  GameRegistry: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  ShipNFT: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
  CelestialBodyRegistry: 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6

Resource Tokens:
  CH4: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  O2: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  H2O: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  CO2: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
  N2: 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707

Celestial Bodies:
  TITAN: 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
  EUROPA: 0x610178dA211FEF7D417bC0e6FeD39F05609AD788
  MARS: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
  VENUS: 0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0
```

**Important:** The addresses should match what you saw in Terminal 2.

**Keep this terminal running.** It's your API server.

### During Ship Minting
When you mint a ship in the browser, you'll see:

```
POST /api/ships/mint
  Status: 200
  Token ID: 1
  Tx Hash: 0x1234...
```

**Red flags (bad):**
```
POST /api/ships/mint
  Error: could not decode result data (value="0x")
  Status: 500
```
This is the "not a contract" error. It means contracts weren't deployed.

```
Error: ShipMinted event not found in transaction receipt
```
This means the contract didn't emit the event (unlikely, but possible).

---

## Browser: http://localhost:3000

### Expected UI

**Ships Section:**
```
┌─────────────────────────────────────────────┐
│ SHIPS                                       │
├─────────────────────────────────────────────┤
│ Mint New Ship                               │
│ ┌─────────────────────────────────────┐   │
│ │ Owner Address                       │   │
│ │ [0xf39F...2266                    ] │   │
│ │                                     │   │
│ │ Class Name                          │   │
│ │ [Pioneer-Class               ]     │   │
│ │                                     │   │
│ │ Mass (kg)                           │   │
│ │ [50000                       ]     │   │
│ │                                     │   │
│ │ Sail Area (m²)                      │   │
│ │ [10000                       ]     │   │
│ │                                     │   │
│ │ Sail Reflectivity (%)               │   │
│ │ [90                          ]     │   │
│ │                                     │   │
│ │ Max Sail Count                      │   │
│ │ [1                           ]     │   │
│ │                                     │   │
│ │ Cargo Capacity (kg)                 │   │
│ │ [5000                        ]     │   │
│ │                                     │   │
│ │ [Mint Test Ship]                    │   │
│ └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### After Clicking "Mint Test Ship"

**Success (what you want to see):**

1. **Loading indicator** appears briefly
2. **Green success toast** appears:
   ```
   ✓ Ship minted successfully! Token ID: 1
   ```
3. **Ship details panel** appears below:

```
┌─────────────────────────────────────────────┐
│ SHIP #1 - Pioneer-Class                     │
├─────────────────────────────────────────────┤
│ Ship Statistics                             │
│   Mass:                 50,000 kg          │
│   Sail Area:            10,000 m²          │
│   Sail Reflectivity:    90%                │
│   Max Sail Count:       1                  │
│   Cargo Capacity:       5,000 kg           │
│   Condition:            100%               │
├─────────────────────────────────────────────┤
│ Token Bound Account (TBA)                   │
│   Address: 0x1234...5678                   │
│                                             │
│   Resource Balances:                        │
│   ┌────────┬──────────────┬──────────────┐│
│   │ Symbol │ Balance      │ Address      ││
│   ├────────┼──────────────┼──────────────┤│
│   │ CH4    │ 0.0000       │ 0xe7f1...   ││
│   │ O2     │ 0.0000       │ 0x9fE4...   ││
│   │ H2O    │ 0.0000       │ 0xCf7E...   ││
│   │ CO2    │ 0.0000       │ 0xDc64...   ││
│   │ N2     │ 0.0000       │ 0x5FC8...   ││
│   └────────┴──────────────┴──────────────┘│
└─────────────────────────────────────────────┘
```

**Failure (what you DON'T want to see):**

1. **Red error toast:**
   ```
   ✗ Error: could not decode result data (value="0x")
   ```
   **Cause:** Contracts not deployed. Go back to Terminal 2 and redeploy.

2. **Red error toast:**
   ```
   ✗ ShipNFT contract not deployed yet
   ```
   **Cause:** Server can't find deployment.json or it's missing shipNFT address.

3. **Red error toast:**
   ```
   ✗ ShipMinted event not found in transaction receipt
   ```
   **Cause:** Contract bug (unlikely). Check contract code.

4. **Blank ship details panel (no content)**
   **Cause:** Frontend crash (unlikely with new defensive coding).

---

## Browser Console (F12 → Console Tab)

### Expected (Good)
```
POST http://localhost:3000/api/ships/mint
  Status: 200
  Response: {
    "tokenId": "1",
    "txHash": "0x1234...",
    "blockNumber": 2
  }

GET http://localhost:3000/api/ships/1
  Status: 200
  Response: {
    "tokenId": "1",
    "stats": {
      "mass": "50000",
      "sailArea": "10000",
      ...
    }
  }

GET http://localhost:3000/api/ships/1/tba
  Status: 200
  Response: {
    "tbaAddress": "0x1234...",
    "balances": [...]
  }
```

### Errors (Bad)

**"not a contract" error:**
```
POST http://localhost:3000/api/ships/mint
  Status: 500
  Response: {
    "error": "could not decode result data (value=\"0x\")"
  }
```
**Fix:** Redeploy contracts (Terminal 2).

**Network error:**
```
POST http://localhost:3000/api/ships/mint
  Status: Failed to fetch
  Error: net::ERR_CONNECTION_REFUSED
```
**Fix:** Start backoffice server (Terminal 3).

**404 error:**
```
POST http://localhost:3000/api/ships/mint
  Status: 404 Not Found
```
**Fix:** Check server is running on correct port (should be 3000).

---

## Verification Checklist

Before testing ship minting, verify:

### Terminal 1 (Hardhat Node)
- [ ] Shows "Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/"
- [ ] Shows list of accounts (Account #0, Account #1, etc.)
- [ ] Is still running (not stopped)

### Terminal 2 (Deployment)
- [ ] Shows "Deployment complete!"
- [ ] Shows ShipNFT address (should NOT be `0xb7f8bc63bbcad18155201308c8f3540b07f84f5e`)
- [ ] deployment.json has recent timestamp (last few minutes)

### Terminal 3 (Backoffice Server)
- [ ] Shows "Server running on http://localhost:3000"
- [ ] Shows contract addresses matching Terminal 2
- [ ] Is still running (not stopped)

### Browser
- [ ] Page loaded at http://localhost:3000
- [ ] No console errors before testing (check F12 → Console)
- [ ] "Mint Test Ship" button is clickable

---

## Success Metrics

You'll know it's working when:

1. **Terminal 1** shows RPC requests without "revert" errors
2. **Terminal 3** shows `POST /api/ships/mint` with Status 200
3. **Browser** shows green success toast with Token ID
4. **Browser** shows ship details panel with stats and TBA info
5. **Browser console** shows successful API calls (200 status)

---

## Quick Diagnostic Commands

If something is wrong, use these commands to diagnose:

### Check if Hardhat node is running
```bash
curl http://127.0.0.1:8545
# Should return: {"jsonrpc":"2.0","id":null,"error":{"code":-32700,...}}
# (Error is expected, we just want to confirm the server responds)
```

### Check if backoffice server is running
```bash
curl http://localhost:3000
# Should return HTML page (the frontend)
```

### Check deployment.json exists and is valid
```bash
cat /Users/mattcameron/Projects/sailship/contracts/deployment.json | grep shipNFT
# Should show: "shipNFT": "0x..."
```

### Check contract is actually deployed
```bash
cd /Users/mattcameron/Projects/sailship/contracts
npx hardhat console --network localhost

# In the console:
> const ShipNFT = await ethers.getContractFactory("ShipNFT");
> const address = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853"; // Use your address from deployment.json
> const shipNFT = ShipNFT.attach(address);
> await shipNFT.getAddress();
// Should return the address without error

> await shipNFT.name();
// Should return "SpaceShip" without error
```

---

## Common Mistakes

1. **Forgot to redeploy after restarting Hardhat node**
   - Symptom: "not a contract" error
   - Fix: Run deployment script (Terminal 2)

2. **Didn't restart backoffice server after redeploying**
   - Symptom: Server uses old contract addresses
   - Fix: Restart server (Ctrl+C, then `npm start`)

3. **Wrong terminal directory**
   - Symptom: "command not found" or "file not found"
   - Fix: `cd` to correct directory first

4. **Hardhat node not running**
   - Symptom: "ECONNREFUSED" errors in deployment or server
   - Fix: Start Hardhat node (Terminal 1)

5. **Browser cache showing old page**
   - Symptom: UI doesn't match expected layout
   - Fix: Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

---

## Final Verification

After completing all steps and minting a ship successfully:

**Terminal 1:** Should show RPC logs like:
```
eth_sendTransaction
  Contract call: mintShip
  From: 0xf39F...
  To: 0xa513... (ShipNFT)
  Gas used: 150000
```

**Terminal 3:** Should show:
```
POST /api/ships/mint - 200
GET /api/ships/1 - 200
GET /api/ships/1/tba - 200
```

**Browser:** Should show:
- Green success toast
- Ship details panel with data
- No console errors

If all three match, **ship minting is working correctly**!
