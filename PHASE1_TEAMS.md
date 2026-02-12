# Phase 1: Team Assignments & Coordination

**Date:** 2026-02-11
**Architecture:** See `PHASE1_BLOCKCHAIN_ARCHITECTURE.md`

---

## Team A: Contracts Team

**Mission:** Build, test, and deploy all smart contracts for Phase 1.

**Agents:**
- `architect.md` - Lead contract architecture, design decisions
- `blockchain-solidity-expert.md` - Write all Solidity code
- `functional-tester.md` - Write comprehensive test suites
- `physicist.md` + `solar-sailing-expert.md` - Validate ship stats

**Owned Files:**
- `/contracts/**/*.sol`
- `/test/contracts/**/*.js`
- `/scripts/**/*.js`
- `/contracts/hardhat.config.js`
- `/contracts/package.json`
- **Output:** `/backoffice/public/abis/*.json`

**Deliverables:**
1. ✅ All contracts compiled and deployed to local Hardhat network
2. ✅ Test suite with >90% coverage (all tests passing)
3. ✅ Deployment script outputs JSON with addresses
4. ✅ ABIs exported to `/backoffice/public/abis/`

**Contract List:**
1. `GameRegistry.sol` - Central registry
2. `ResourceToken.sol` - ERC-20 template (deploy 5x: CH4, O2, H2O, CO2, N2)
3. `ShipNFT.sol` - ERC-721 + ERC-6551
4. `CelestialBodyRegistry.sol` - Factory for bodies
5. `CelestialBody.sol` - Individual body with emission profile

**TDD Protocol:**
- Write test FIRST (it must fail)
- Implement code until test passes
- Refactor while keeping tests green
- No implementation without a failing test

---

## Team B: Backoffice Team

**Mission:** Build the admin web interface for managing the blockchain.

**Agents:**
- `backend-nodejs-expert.md` - Node.js + Express backend
- `native-js-expert.md` - Frontend implementation (ES6, no frameworks)
- `scifi-ui-ux-expert.md` - Dark theme design
- `functional-tester.md` - API and frontend tests

**Owned Files:**
- `/backoffice/**/*` (except `/backoffice/public/abis/`)

**Deliverables:**
1. ✅ Node.js backend with all API routes functional
2. ✅ Frontend UI with dark theme (mission control aesthetic)
3. ✅ Integration tests for all routes
4. ✅ Can deploy, mint ships, harvest resources via UI

**API Routes:**
- `POST /api/deploy` - Deploy contracts
- `POST /api/ships/mint` - Mint ship
- `GET /api/ships/:tokenId` - Get ship stats
- `GET /api/ships/:tokenId/tba` - Get TBA balance
- `POST /api/resources/mint` - Mint resources to TBA
- `POST /api/celestial-bodies/create` - Create body
- `POST /api/celestial-bodies/:name/harvest` - Harvest to ship

**TDD Protocol:**
- Write test FIRST (API route test or frontend unit test)
- Implement until test passes
- Refactor while keeping tests green

---

## Handshake Points

### Handshake #1: ABIs (Team A → Team B)
**When:** After Team A compiles each contract
**What:** Team A exports ABIs to `/backoffice/public/abis/`
**Why:** Team B needs ABIs to instantiate contract instances

**Process:**
1. Team A: Compile contracts → ABIs generated in `artifacts/`
2. Team A: Run `npm run export-abis` → copies to backoffice
3. Team A: Commit ABIs and notify lead
4. Team B: Pull latest ABIs, update backend contract instances

### Handshake #2: Ship Configurator (Team B depends on Team A)
**When:** After Team A deploys `ShipNFT.sol`
**What:** Team B builds UI form to mint ships
**Why:** Backoffice UI directly calls ship contract

**Dependencies:**
- Team A: `ShipNFT.sol` deployed and tested
- Team A: ABI available in `/backoffice/public/abis/ShipNFT.json`
- Team B: `POST /api/ships/mint` route implemented
- Team B: Frontend form calling the route

---

## Coordination Rules

### File Ownership
- **NO TWO AGENTS MAY EDIT THE SAME FILE**
- Team A owns `/contracts`, Team B owns `/backoffice`
- Exception: Team A writes to `/backoffice/public/abis/` (one-way only)

### Communication
- Teams work in parallel
- Lead monitors handshake points
- Teams notify lead when deliverables complete

### Testing
- Both teams follow STRICT TDD
- Tests must be meaningful (test behavior, not implementation)
- All tests must pass before claiming completion

---

## Progress Tracking

### Team A Milestones
- [ ] Hardhat initialized, OpenZeppelin installed
- [ ] `GameRegistry.sol` - tested and deployed
- [ ] `ResourceToken.sol` - tested (5 instances deployed)
- [ ] `ShipNFT.sol` - tested, ERC-6551 TBA creation verified
- [ ] `CelestialBody.sol` - tested
- [ ] `CelestialBodyRegistry.sol` - tested
- [ ] Deployment script outputs JSON
- [ ] ABIs exported to backoffice
- [ ] All tests passing (>90% coverage)

### Team B Milestones
- [ ] Node.js server scaffolded
- [ ] Environment config (`.env`) loading
- [ ] Blockchain service (ethers.js provider/signer)
- [ ] `POST /api/deploy` route - tested and functional
- [ ] `POST /api/ships/mint` route - tested
- [ ] `GET /api/ships/:tokenId` routes - tested
- [ ] `POST /api/resources/mint` route - tested
- [ ] `POST /api/celestial-bodies/*` routes - tested
- [ ] Frontend UI scaffolded (dark theme)
- [ ] Ship configurator UI - functional
- [ ] Resource management UI - functional
- [ ] Deployment UI - functional
- [ ] All tests passing

### Integration Milestones (Lead)
- [ ] Contracts deployed to local Hardhat network
- [ ] Backoffice connects to deployed contracts
- [ ] Can mint ship via UI
- [ ] Ship has TBA with correct address
- [ ] Can harvest CH4 from TITAN to ship TBA
- [ ] TBA balance visible in UI
- [ ] Transfer ship → cargo follows (verified)
- [ ] All critical flows working end-to-end

---

## Resource Allocation

**Estimated Time:** 3-5 days of development

**Team A Focus:**
- Days 1-2: Write tests, implement core contracts
- Days 2-3: ERC-6551 integration, celestial body system
- Days 3-4: Deployment scripts, ABI export, refinement

**Team B Focus:**
- Days 1-2: Backend scaffolding, API routes with tests
- Days 2-3: Contract integration, frontend UI
- Days 3-4: Integration testing, UI polish

**Lead Focus:**
- Continuous: Monitor handshakes, resolve blockers
- Day 4-5: End-to-end integration testing, verification

---

## Definition of Done (Phase 1 Complete)

**All checkboxes checked:**
- ✅ Contracts deployed to local chain
- ✅ All contract tests passing (>90% coverage)
- ✅ All API tests passing
- ✅ Backoffice UI functional with dark theme
- ✅ Can deploy contracts from UI
- ✅ Can mint ship with custom stats
- ✅ Ship has Token Bound Account
- ✅ Can harvest resources to ship TBA
- ✅ TBA balances displayed in UI
- ✅ Transfer ship → cargo transfers with it (verified)
- ✅ Chain URL configurable via `.env`

---

**Status:** READY TO SPAWN TEAMS
**Next Action:** Lead spawns Team A and Team B agents
