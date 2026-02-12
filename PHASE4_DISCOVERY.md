# Phase 4: Celestial Bodies Resource Management - Discovery

**Date:** 2026-02-12
**Status:** Discovery Complete
**Lead Coordinator:** Claude Sonnet 4.5

---

## Executive Summary

Phase 4 will transform the placeholder Celestial Bodies page into a complete resource management UI. The backend infrastructure and smart contracts are fully deployed and ready. This phase is **frontend-only**, requiring no changes to backend or smart contracts.

**Goal:** Enable admins to manage celestial bodies as resource faucets - create bodies, configure emission profiles, and harvest resources to ship TBAs.

---

## 1. Current State Analysis

### 1.1 Existing Backend API (Fully Implemented)

**Location:** `/Users/mattcameron/Projects/sailship/backoffice/server/routes/celestialBodies.js`

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/celestial-bodies` | GET | List all celestial bodies | ✅ Deployed |
| `/api/celestial-bodies/:name` | GET | Get body details | ✅ Deployed |
| `/api/celestial-bodies/create` | POST | Create new celestial body | ✅ Deployed |
| `/api/celestial-bodies/:name/add-resource` | POST | Add resource to emission profile | ✅ Deployed |
| `/api/celestial-bodies/:name/harvest` | POST | Harvest resources to ship TBA | ✅ Deployed |

**Request/Response Examples:**

```javascript
// List all bodies
GET /api/celestial-bodies
Response: [
  { name: "TITAN", bodyType: "moon", address: "0x..." },
  { name: "EUROPA", bodyType: "moon", address: "0x..." }
]

// Get body details
GET /api/celestial-bodies/TITAN
Response: {
  name: "TITAN",
  bodyType: "moon",
  address: "0x..."
}

// Create celestial body
POST /api/celestial-bodies/create
Body: { name: "MARS", bodyType: "planet" }
Response: {
  name: "MARS",
  bodyType: "planet",
  address: "0x...",
  txHash: "0x...",
  blockNumber: 123
}

// Add resource to emission profile
POST /api/celestial-bodies/TITAN/add-resource
Body: {
  resourceSymbol: "CH4",
  ratePerSecond: "1000000000000000000" // 1 kg/s in wei
}
Response: {
  name: "TITAN",
  resourceSymbol: "CH4",
  resourceAddress: "0x...",
  ratePerSecond: "1000000000000000000",
  txHash: "0x...",
  blockNumber: 124
}

// Harvest resources
POST /api/celestial-bodies/TITAN/harvest
Body: {
  shipTokenId: "1",
  resourceSymbol: "CH4",
  amount: "100000000000000000000" // 100 kg in wei
}
Response: {
  celestialBody: "TITAN",
  shipTokenId: "1",
  tbaAddress: "0x...",
  resourceSymbol: "CH4",
  amount: "100000000000000000000",
  txHash: "0x...",
  blockNumber: 125
}
```

### 1.2 Smart Contract Architecture

**CelestialBody.sol** (Individual body contract)
```solidity
struct EmissionProfile {
    address resourceToken;  // ERC-20 token address
    uint256 ratePerSecond;  // Base emission rate (18 decimals)
    bool isActive;          // Can be disabled
}

function addResource(address resourceToken, uint256 ratePerSecond) external onlyOwner;
function harvest(address shipTBA, address resourceToken, uint256 amount) external onlyOwner;
function getCelestialBodyData() external view returns (CelestialBodyData memory);
```

**CelestialBodyRegistry.sol** (Factory contract)
```solidity
function createCelestialBody(string memory name, string memory bodyType) external onlyOwner returns (address);
function getCelestialBody(string memory name) external view returns (address);
function getAllBodies() external view returns (BodyInfo[] memory);
```

**Key Insight:** The smart contract has a `getCelestialBodyData()` function that returns full emission profiles, but the backend API doesn't expose this data yet. We need to call it from the frontend.

### 1.3 Frontend (Current Placeholder)

**Location:** `/Users/mattcameron/Projects/sailship/backoffice/public/app.js` (lines 983-992)

```javascript
function loadCelestialBodiesUI(container) {
  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">CELESTIAL BODIES</h1>
      <div class="form-panel">
        <p>Celestial body management - Click SHIPS tab to mint ships first!</p>
      </div>
    </div>
  `;
}
```

**Status:** Placeholder stub with no functionality

### 1.4 Existing UI Patterns (Phase 2 & 3)

**Ships List:**
- Uses `data-grid` for card layout
- Uses `data-card` for individual items
- Click-to-inspect pattern

**Ship Details:**
- Uses `form-panel` for sections
- Uses `createResourcesFormHTML()` for resource forms
- Uses `parseResourceAmount()` for wei conversion
- Uses `formatTokenAmount()` for display
- Uses `validateEthereumAddress()` for validation
- Uses `showToast()` for feedback
- Uses `setLoading()` for transaction overlays

**Resources Page:**
- 5 resource token cards (`data-grid`)
- Mint form with dropdown + amount + address
- Balance checker with results table

### 1.5 Deployment Status

**Contracts Deployed:** ✅
- CelestialBodyRegistry: `process.env.CELESTIAL_BODY_REGISTRY_ADDRESS`
- Resource Tokens: CH4, O2, H2O, CO2, N2 (from `RESOURCE_METADATA`)

**Bodies Created:** Unknown (need to query `/api/celestial-bodies`)

**Typical Setup:**
- TITAN (moon) - produces CH4 (methane)
- EUROPA (moon) - produces H2O (water), O2 (oxygen)
- MARS (planet) - produces CO2 (carbon dioxide)
- VENUS (planet) - produces CO2, N2 (nitrogen)

---

## 2. Gap Analysis

### 2.1 Missing Frontend Functionality

| Feature | Current State | Required |
|---------|---------------|----------|
| List celestial bodies | ❌ None | ✅ Display all bodies with name, type, address |
| View emission profiles | ❌ None | ✅ Show which resources each body produces + rates |
| Create celestial body | ❌ None | ✅ Form with name, bodyType fields |
| Add resource to body | ❌ None | ✅ Form with resource dropdown, rate input |
| Harvest resources | ❌ None | ✅ Form with ship selector, resource, amount |
| Display emission rates | ❌ None | ✅ Human-readable rates (kg/day, kg/hour) |

### 2.2 Missing Backend Endpoints

**Note:** The backend API is missing an endpoint to retrieve emission profiles. We have two options:

**Option A: Add Backend Endpoint** (Requires backend changes - violates constraints)
```javascript
GET /api/celestial-bodies/:name/emissions
Response: {
  name: "TITAN",
  emissions: [
    { resourceToken: "0x...", symbol: "CH4", ratePerSecond: "1000000000000000000", isActive: true }
  ]
}
```

**Option B: Call Contract Directly from Frontend** (Frontend-only)
```javascript
// Call getCelestialBodyData() directly using ethers.js
const body = new ethers.Contract(bodyAddress, CelestialBodyABI, provider);
const data = await body.getCelestialBodyData();
// Returns: { name: "TITAN", bodyType: "moon", emissions: [...] }
```

**Recommendation:** Option B (frontend-only approach). However, this requires adding ethers.js and contract ABIs to the frontend, which introduces dependencies. **We should ask the user for guidance.**

**Alternative Option C: Store emission profiles in memory during creation** (Pragmatic)
- Track emission profiles in frontend state after adding resources
- Don't query them from blockchain (admin knows what they added)
- Display rates based on what was just configured
- Limitation: Page refresh loses data (acceptable for admin tool)

### 2.3 Required Data Structures

```javascript
// Frontend state for celestial bodies
const celestialBodiesState = {
  bodies: [
    {
      name: "TITAN",
      bodyType: "moon",
      address: "0x...",
      emissions: [
        { resourceSymbol: "CH4", ratePerSecond: "1000000000000000000" }
      ]
    }
  ]
};

// Helper function
function formatEmissionRate(ratePerSecond) {
  // Convert wei/second to kg/day
  const kgPerSecond = parseFloat(ratePerSecond) / 1e18;
  const kgPerDay = kgPerSecond * 86400;
  return `${kgPerDay.toFixed(2)} kg/day`;
}
```

---

## 3. Technical Architecture

### 3.1 Data Flow

```
User Action → Frontend Form → Validation → API Call → Backend → Smart Contract
                                                                       ↓
                                                                   Blockchain
                                                                       ↓
User Feedback ← Toast/Refresh ← API Response ← Transaction Receipt ←
```

### 3.2 Component Structure

**loadCelestialBodiesUI(container)**
- Fetches list of bodies from API
- Renders 4 sections:
  1. **Bodies Overview** - Grid of body cards
  2. **Create Body** - Form to create new body
  3. **Configure Emissions** - Form to add resources to bodies
  4. **Harvest Resources** - Form to harvest from body to ship

**Event Handlers:**
- `setupCreateBodyForm()` - Handle body creation
- `setupAddEmissionForm()` - Handle adding resources to emission profiles
- `setupHarvestForm()` - Handle harvesting resources to ships

### 3.3 UI Layout (Wireframe)

```
┌─────────────────────────────────────────────────────────────┐
│ CELESTIAL BODIES                                            │
│                                                              │
│ REGISTERED BODIES                                           │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ TITAN    │ │ EUROPA   │ │ MARS     │ │ VENUS    │       │
│ │ Moon     │ │ Moon     │ │ Planet   │ │ Planet   │       │
│ │ 0xABC... │ │ 0xDEF... │ │ 0xGHI... │ │ 0xJKL... │       │
│ │          │ │          │ │          │ │          │       │
│ │ PRODUCES:│ │ PRODUCES:│ │ PRODUCES:│ │ PRODUCES:│       │
│ │ CH4      │ │ H2O      │ │ CO2      │ │ CO2      │       │
│ │ 86.4 kg/d│ │ 43.2 kg/d│ │ 21.6 kg/d│ │ 10.8 kg/d│       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│ CREATE CELESTIAL BODY                                       │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Name: [MARS          ]  Type: [planet ▼]            │   │
│ │ [🌍 CREATE BODY]                                     │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ ADD RESOURCE TO EMISSION PROFILE                            │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Body: [TITAN ▼]  Resource: [CH4 ▼]  Rate: [1.0    ] │   │
│ │ (kg/second)                                           │   │
│ │ [⚗️ ADD RESOURCE]                                     │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ HARVEST RESOURCES TO SHIP                                   │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Body: [TITAN ▼]  Ship: [#1 HELIOS ▼]  Resource: [CH4▼]│ │
│ │ Amount (kg): [100     ]                               │   │
│ │ [⛽ HARVEST TO SHIP]                                  │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. File Impact Estimate

### 4.1 Files to EDIT

| File | Changes | Complexity |
|------|---------|------------|
| `/Users/mattcameron/Projects/sailship/backoffice/public/app.js` | Replace `loadCelestialBodiesUI()` function (lines 983-992) with full implementation (~300-400 lines) | Medium |

**Specific Additions to app.js:**
- API wrapper functions (if missing): `addResourceToCelestialBody()`, `harvestFromCelestialBody()`
- Helper function: `formatEmissionRate(ratePerSecond)` - convert wei/s to kg/day
- Main UI function: `loadCelestialBodiesUI(container)` - render all sections
- Event handlers: `setupCreateBodyForm()`, `setupAddEmissionForm()`, `setupHarvestForm()`
- State management: Track emission profiles in memory (Option C approach)

### 4.2 Files to CREATE

**None** - All changes are within the existing app.js file.

### 4.3 Files to READ (For Reference)

| File | Purpose |
|------|---------|
| `/Users/mattcameron/Projects/sailship/backoffice/public/app.js` | Understand existing patterns (Phase 2/3 code) |
| `/Users/mattcameron/Projects/sailship/PHASE3_FINAL_PLAN.md` | Reference implementation approach |
| `/Users/mattcameron/Projects/sailship/backoffice/server/routes/celestialBodies.js` | Understand API contracts |
| `/Users/mattcameron/Projects/sailship/contracts/contracts/CelestialBody.sol` | Understand data structures |

---

## 5. Key Constraints

### 5.1 Frontend-Only Development
- ✅ Backend API fully implemented - no changes allowed
- ✅ Smart contracts deployed - no changes allowed
- ✅ All work in `app.js` (vanilla JS, no build tools)

### 5.2 Emission Profile Data Challenge

**Problem:** Backend doesn't expose emission profiles in GET requests.

**Solutions:**
1. **Option A:** Add backend endpoint (violates frontend-only constraint)
2. **Option B:** Use ethers.js in frontend to call contract directly (adds dependency)
3. **Option C:** Track emission profiles in frontend state only (pragmatic)

**Recommendation:** Use Option C for now. Admin creates bodies and adds resources in the same session - they know what they added. Emission rates display based on what was configured this session. Page refresh clears state (acceptable tradeoff for admin tool).

**Future Enhancement:** Add backend endpoint in Phase 5 if persistent emission profile viewing is needed.

### 5.3 Code Style Requirements
- camelCase function names
- UPPER_SNAKE constants
- Try-catch on all async operations
- User-friendly error messages
- Follow existing form-panel, data-grid, data-card patterns
- Use existing utilities: `formatAddress()`, `formatTokenAmount()`, `parseResourceAmount()`, `validateEthereumAddress()`

---

## 6. Open Questions

### 6.1 For User Decision

1. **Emission Profile Persistence:** Are you okay with emission profiles only being visible during the session they're created? (Option C approach)
   - ✅ Pros: Frontend-only, simple, fast
   - ❌ Cons: Page refresh loses emission data
   - Alternative: Add backend endpoint (requires backend changes)

2. **Body Type Dropdown:** What body types should be allowed?
   - Suggested: "planet", "moon", "asteroid", "dwarf-planet"

3. **Default Emission Rates:** Should we provide preset rates for common body/resource combinations?
   - Example: TITAN/CH4 defaults to 1.0 kg/s
   - Or: Always manual input?

4. **Ship Selector:** For harvest form, should we:
   - Show dropdown of all ships (requires fetching ship list)
   - Or: Manual ship token ID input?

5. **Resource Display Units:** Prefer kg/second, kg/hour, or kg/day for emission rates?
   - Suggestion: kg/day (easier to understand)

### 6.2 Technical Clarifications Needed

1. Are there any existing celestial bodies already deployed? (Can check via `/api/celestial-bodies`)
2. Should we validate that celestial body names are uppercase? (TITAN vs Titan)
3. Should harvest amounts be capped? (e.g., max 10,000 kg per harvest)

---

## 7. Existing Patterns to Follow

### 7.1 Form Validation Pattern (from Phase 3)

```javascript
async function handleFormSubmit(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const field1 = formData.get('field1');

  // Validation
  if (!field1) {
    showToast('Field required', 'error');
    return;
  }

  setLoading(true, 'Processing...');

  try {
    const result = await apiCall(field1);
    showToast('Success', 'success', 'DONE');
    // Refresh UI
  } catch (error) {
    let message = error.message;
    if (message.includes('gas')) {
      message = 'Transaction failed: insufficient gas';
    }
    showToast(message, 'error', 'FAILED');
  } finally {
    setLoading(false);
  }
}
```

### 7.2 Data Display Pattern (from Phase 2)

```javascript
const cards = data.map(item => `
  <div class="data-card">
    <div class="data-card-title">${item.name}</div>
    <div class="data-card-value">${item.value}</div>
    <div class="data-card-meta">${formatAddress(item.address)}</div>
  </div>
`).join('');

container.innerHTML = `
  <div class="data-grid">
    ${cards}
  </div>
`;
```

---

## 8. Success Criteria

Phase 4 is complete when:

- [ ] Celestial Bodies page displays list of deployed bodies
- [ ] Each body card shows name, type, address, and emission profiles
- [ ] Can create new celestial bodies via form
- [ ] Can add resources to emission profiles
- [ ] Can harvest resources from bodies to ship TBAs
- [ ] All forms validate inputs
- [ ] All forms provide user feedback (loading, success, errors)
- [ ] UI matches existing design patterns (Phase 2/3)
- [ ] No regressions to existing pages (Ships, Resources, Deploy)

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Emission profile data not available | High | Medium | Use Option C (frontend state) |
| Body name collisions | Low | Low | Backend validates uniqueness |
| Invalid resource symbols | Low | Medium | Validate against `RESOURCE_METADATA` |
| Large emission rates cause overflow | Low | Low | Use string-based wei conversion |
| Harvest to non-existent ship | Medium | Low | Validate ship exists before harvest |

**Overall Risk:** **LOW-MEDIUM** - Main challenge is emission profile data availability (solved via Option C).

---

## 10. Proposed Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Discovery | 1 hour | This document ✅ |
| Brainstorming | 2 hours | Agent proposals (4 agents) |
| Planning | 2 hours | Implementation plan |
| Review | 2 hours | 7-perspective review |
| Synthesis | 1 hour | Final plan for user approval |
| Implementation | 8-12 hours | Working code (after approval) |
| Verification | 2 hours | Test report |

**Total:** 18-22 hours (2-3 days)

---

## 11. Next Steps

1. ✅ **Discovery Complete** (this document)
2. **Spawn 4 Brainstorming Agents:**
   - UX Designer Agent
   - Backend Integration Agent
   - Frontend Developer Agent
   - Solar System Expert Agent
3. **Create PHASE4_PROPOSALS.md** with agent outputs
4. **Synthesize Implementation Plan**
5. **Run 7-Perspective Review**
6. **Create PHASE4_FINAL_PLAN.md**
7. **Get User Approval**
8. **Begin Implementation**

---

## Document Status

✅ **Discovery Complete**
📋 **Ready for Brainstorming Phase**

**Confidence Level:** 8/10

**Key Blocker:** Emission profile data availability (resolved via Option C)

---

**Date:** 2026-02-12
**Lead Coordinator:** Claude Sonnet 4.5
