# Team A Deliverables - Phase 1 Blockchain Contracts

**Date:** 2026-02-11
**Team:** Contracts Team (Team A)
**Status:** ✅ COMPLETE

---

## Summary

All Phase 1 smart contracts implemented, tested, and deployed using strict TDD methodology.

- **Test Coverage:** 98.57% (exceeds >90% requirement)
- **Test Results:** 72 tests passing
- **Contracts Deployed:** 5 core contracts
- **ABIs Exported:** All 5 ABIs in `/backoffice/public/abis/`

---

## Contracts Implemented

### 1. GameRegistry.sol
**Purpose:** Central registry for all contract addresses

**Functions:**
- `setShipNFT(address)` - Register ShipNFT contract
- `setCelestialBodyRegistry(address)` - Register celestial body registry
- `setResourceToken(string, address)` - Register resource token
- `getResourceToken(string)` - Get resource token by symbol
- `getAllResourceTokens()` - Get all registered resources

**Tests:** 10 tests passing
**Coverage:** 100% statements, 62.5% branches (due to require checks)

### 2. ResourceToken.sol (ERC-20)
**Purpose:** Fungible resource tokens (CH4, O2, H2O, CO2, N2)

**Features:**
- Standard ERC-20 implementation
- Admin-only minting via `mint(address, uint256)`
- Burnable via `burn(uint256)`
- 18 decimals

**Deployed Instances:**
- Methane (CH4)
- Oxygen (O2)
- Water (H2O)
- Carbon Dioxide (CO2)
- Nitrogen (N2)

**Tests:** 14 tests passing
**Coverage:** 100% statements, 100% branches

### 3. ShipNFT.sol (ERC-721 + ERC-6551)
**Purpose:** Solar sail ships as NFTs with Token Bound Accounts

**Features:**
- ERC-721 standard compliance (via OpenZeppelin)
- On-chain ship stats (mass, sailArea, reflectivity, maxSailCount, cargoCapacity)
- Deterministic TBA address generation (ERC-6551 compatible)
- Admin-only minting via `mintShip(...)`
- Sequential token IDs starting at 1
- Token URI with ship class and ID

**Ship Stats Structure:**
```solidity
struct ShipStats {
    uint256 mass;              // kg (e.g., 10000)
    uint256 sailArea;          // m² (e.g., 3000000 = 3 km²)
    uint256 sailReflectivity;  // Basis points (9000 = 0.9)
    uint256 maxSailCount;      // 1-20
    uint256 cargoCapacity;     // Max resource units
    string className;          // "HELIOS-CLASS"
    uint256 condition;         // 0-10000 (10000 = perfect)
}
```

**Tests:** 17 tests passing
**Coverage:** 95.83% statements (one line in _toString helper uncovered)

### 4. CelestialBody.sol
**Purpose:** Individual celestial bodies with resource emission profiles

**Features:**
- Name and body type (planet, moon, asteroid)
- Multiple resource emission profiles
- Admin harvest function to transfer resources to ship TBAs
- Enable/disable resources
- Configurable emission rates

**Functions:**
- `addResource(address, uint256)` - Add resource to emission profile
- `setEmissionRate(address, uint256)` - Update emission rate
- `setResourceActive(address, bool)` - Enable/disable resource
- `harvest(address, address, uint256)` - Transfer resources to ship TBA
- `getCelestialBodyData()` - Get all body data and emission profiles

**Tests:** 17 tests passing
**Coverage:** 100% statements, 77.27% branches

### 5. CelestialBodyRegistry.sol
**Purpose:** Factory and registry for celestial bodies

**Features:**
- Factory pattern for creating CelestialBody contracts
- Maintains name → address mapping
- Admin access control
- Transfers ownership of created bodies to registry owner

**Functions:**
- `createCelestialBody(string, string)` - Deploy new body contract
- `getCelestialBody(string)` - Get body address by name
- `getAllBodies()` - Get all registered bodies

**Initial Bodies Created:**
- TITAN (moon) - emits CH4 at 100/s
- EUROPA (moon) - emits H2O at 100/s
- MARS (planet) - emits CO2 at 50/s, H2O at 10/s
- VENUS (planet) - emits CO2 at 80/s, N2 at 30/s

**Tests:** 14 tests passing
**Coverage:** 100% statements, 100% branches

---

## Test-Driven Development (TDD)

All contracts implemented using strict RED-GREEN-REFACTOR cycle:

1. **RED:** Write failing test first
2. **GREEN:** Implement contract until test passes
3. **REFACTOR:** Clean up while keeping tests green

**Test Statistics:**
- Total tests: 72
- Passing: 72 (100%)
- Coverage: 98.57% statements, 76% branches, 100% functions

**Coverage Report:**
```
File                        |  % Stmts | % Branch |  % Funcs |  % Lines |
----------------------------|----------|----------|----------|----------|
 contracts/                 |    98.57 |       76 |      100 |    98.86 |
  CelestialBody.sol         |      100 |    77.27 |      100 |      100 |
  CelestialBodyRegistry.sol |      100 |      100 |      100 |      100 |
  GameRegistry.sol          |      100 |     62.5 |      100 |      100 |
  ResourceToken.sol         |      100 |      100 |      100 |      100 |
  ShipNFT.sol               |    95.83 |       75 |      100 |    96.77 |
```

---

## Deployment

### Scripts

**deploy.js**
- Deploys all contracts in correct dependency order
- Registers contracts in GameRegistry
- Creates initial celestial bodies
- Configures resource emission profiles
- Outputs `deployment.json` with all addresses

**export-abis.js**
- Copies ABIs from `artifacts/contracts/` to `/backoffice/public/abis/`
- Exports simplified JSON with contract name, ABI, and bytecode
- Team B depends on these for contract interaction

### Deployment JSON Structure

```json
{
  "chainId": "1337",
  "deployer": "0x...",
  "timestamp": "2026-02-12T03:27:16.452Z",
  "contracts": {
    "gameRegistry": "0x...",
    "resources": {
      "CH4": "0x...",
      "O2": "0x...",
      "H2O": "0x...",
      "CO2": "0x...",
      "N2": "0x..."
    },
    "shipNFT": "0x...",
    "celestialBodyRegistry": "0x...",
    "celestialBodies": {
      "TITAN": "0x...",
      "EUROPA": "0x...",
      "MARS": "0x...",
      "VENUS": "0x..."
    }
  }
}
```

---

## Handshake #1 Complete

**Deliverable:** ABIs exported to `/backoffice/public/abis/`

Team B can now:
- Instantiate contract instances with ethers.js
- Build API routes for contract interaction
- Develop frontend UI for ship minting and resource management

**Files Exported:**
- GameRegistry.json (10 KB)
- ResourceToken.json (15 KB)
- ShipNFT.json (30 KB)
- CelestialBody.json (15 KB)
- CelestialBodyRegistry.json (17 KB)

---

## Ship Stats Validation

Ship stats align with game physics from `/src/js/config.js`:

| Property | Game Default | Contract Type | Notes |
|----------|--------------|---------------|-------|
| mass | 10,000 kg | uint256 | Default ship mass |
| sailArea | 3,000,000 m² | uint256 | 3 km² sail |
| sailReflectivity | 0.9 (90%) | uint256 | Stored as basis points (9000) |
| maxSailCount | 1-20 | uint256 | Thrust multiplier |
| cargoCapacity | Backend enforced | uint256 | Max resource units |
| className | "HELIOS-CLASS" | string | Ship type identifier |
| condition | 10000 (perfect) | uint256 | 0-10000 scale |

**Physics Accuracy:**
- Solar pressure: 4.56e-6 N/m² at 1 AU (game config matches reality)
- Typical acceleration: ~0.5 mm/s² with default ship stats
- Ship mass and sail area produce realistic orbital mechanics

---

## ERC-6551 Token Bound Accounts

**Implementation:**
- Deterministic TBA address generation using ship token ID
- Each ship has a unique TBA address that can hold resources
- TBA address calculated via `getShipTBA(tokenId)`
- Transferring ship NFT transfers ownership of cargo (ERC-6551 standard)

**Phase 1 Simplification:**
- TBA addresses are deterministic but not yet deployed contracts
- Backend transfers resources to TBA addresses directly
- Phase 2 will deploy actual ERC-6551 account contracts

---

## Access Control

**Strategy:** OpenZeppelin's `Ownable` for Phase 1

- All admin functions use `onlyOwner` modifier
- Deployer = owner
- Owner can mint ships, resources, and harvest from planets
- Owner can update registry addresses

**Security:**
- No public minting (prevents unauthorized ship creation)
- No public harvesting (backend validates before calling)
- Zero address checks on all registration functions

---

## Integration Testing

**End-to-End Flow Verified:**

1. Deploy all contracts → ✅
2. Register contracts in GameRegistry → ✅
3. Create celestial bodies via factory → ✅
4. Add resource emission profiles → ✅
5. Mint ships with correct stats → ✅
6. Generate TBA addresses for ships → ✅
7. Harvest resources to ship TBAs → ✅
8. Transfer ships (tests ERC-721 compliance) → ✅

---

## Commands

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Run coverage
npx hardhat coverage

# Deploy to local network
npx hardhat run scripts/deploy.js --network localhost

# Export ABIs to backoffice
npm run export-abis
```

---

## Next Steps (Team B Integration)

Team B can now:

1. Read ABIs from `/backoffice/public/abis/`
2. Create contract instances in backend using ethers.js
3. Build API routes:
   - POST /api/ships/mint
   - GET /api/ships/:tokenId
   - POST /api/resources/mint
   - POST /api/celestial-bodies/:name/harvest
4. Build frontend UI:
   - Ship configurator (mint ships with custom stats)
   - Resource management (view balances, mint to TBAs)
   - Celestial body management (configure emission rates)

---

## Definition of Done ✅

All checklist items complete:

- ✅ All contracts compiled without errors
- ✅ All contracts deployed to local test chain
- ✅ Test suite passes with >90% coverage (98.57% achieved)
- ✅ ABIs written to `/backoffice/public/abis/`
- ✅ Deployment script outputs JSON with addresses
- ✅ All 5 contracts fully tested
- ✅ Integration verified end-to-end

---

**Team A Status:** READY FOR TEAM B INTEGRATION
