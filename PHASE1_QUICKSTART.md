# Phase 1: Quick Start Guide

**Status:** ✅ Deployed and Verified
**Date:** 2026-02-12

---

## 🚀 Start the System

### Terminal 1: Blockchain
```bash
cd /Users/mattcameron/Projects/sailship/contracts
npx hardhat node
```
Keep this running. Hardhat will show transactions in real-time.

### Terminal 2: Backoffice
```bash
cd /Users/mattcameron/Projects/sailship/backoffice
npm start
```
Server starts at `http://localhost:3000`

### Browser
Open `http://localhost:3000` for the admin UI.

---

## 🧪 Test the System

### 1. Mint a Ship
```bash
curl -X POST http://localhost:3000/api/ships/mint \
  -H "Content-Type: application/json" \
  -d '{
    "to": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "className": "HELIOS-CLASS",
    "mass": 10000,
    "sailArea": 3000000,
    "sailReflectivity": 9000,
    "maxSailCount": 5,
    "cargoCapacity": 1000000
  }'
```

### 2. Check TBA Address
```bash
curl http://localhost:3000/api/ships/1/tba | jq .
```

### 3. Add Cargo (5000 CH4)
```bash
curl -X POST http://localhost:3000/api/resources/mint \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSymbol": "CH4",
    "to": "0x4F094d441d97C87EAb82E7b41c1651b8F530c62E",
    "amount": "5000000000000000000000"
  }'
```
Replace TBA address with your ship's TBA from step 2.

### 4. Verify Cargo
```bash
curl http://localhost:3000/api/ships/1/tba | jq '.balances[] | select(.symbol == "CH4")'
```
Should show `"balance": "5000000000000000000000"`

---

## 📊 Deployed Addresses

All contract addresses are in:
- `/contracts/deployment.json` (JSON)
- `/backoffice/.env` (environment variables)

**Key Addresses:**
- GameRegistry: `0x5FbDB2315678afecb367f032d93F642f64180aa3`
- ShipNFT: `0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e`
- CH4 Token: `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512`

**Test Accounts:**
- Admin: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Account #1: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`

---

## 🔄 Reset Everything

```bash
# Stop Hardhat node (Ctrl+C in Terminal 1)
# Restart it - this resets the blockchain
npx hardhat node

# Redeploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Update .env with new addresses from deployment.json
# Restart backoffice server
```

---

## ✅ What Works

- ✅ Ship minting with custom stats
- ✅ ERC-6551 Token Bound Accounts
- ✅ Resource minting to TBAs
- ✅ TBA balance queries
- ✅ **Ship transfer with cargo** (verified!)
- ✅ Backoffice dark theme UI
- ✅ All API routes

## ⚠️ Known Issues

- Harvest function has a bug (use direct minting instead)
- No "Deploy" button in UI (use CLI)

---

## 📖 Full Documentation

- **Architecture:** `PHASE1_BLOCKCHAIN_ARCHITECTURE.md`
- **Team Coordination:** `PHASE1_TEAMS.md`
- **Verification Report:** `PHASE1_VERIFICATION_REPORT.md`
- **Contracts README:** `contracts/README.md`
- **Backoffice README:** `backoffice/README.md`

---

## 🎯 Next Steps

**Immediate:**
1. Open UI at http://localhost:3000
2. Explore ship configurator, resource minting
3. Test creating celestial bodies

**Phase 2:**
1. Fluid system protocol (sources, sinks, ports)
2. Compositional crafting (nested NFTs)
3. Durability mechanics
4. Mining equipment NFTs
5. Multiplayer & trading

---

**Status:** 🎉 Phase 1 Complete!
