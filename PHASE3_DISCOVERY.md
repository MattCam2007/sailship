# Phase 3: Resource Management for Ships - Discovery Document

**Date:** 2026-02-12
**Status:** Discovery Complete
**Lead Coordinator:** Claude Sonnet 4.5

---

## 1. Executive Summary

Phase 3 focuses on two interconnected features:
1. **Add resources to ships** - Enable minting resources directly to a ship's Token Bound Account (TBA) from the Ship Configurator page
2. **Resources page functionality** - Transform the placeholder Resources page into a full-featured resource management interface

**Key Insight:** The backend infrastructure is already complete from Phase 1. This is primarily a UI/UX enhancement task with some workflow improvements.

---

## 1.1 Estimated File Impact

### Files to EDIT:
- `/Users/mattcameron/Projects/sailship/backoffice/public/app.js` - Enhance `loadResourcesUI()` function (lines 585-594)
- `/Users/mattcameron/Projects/sailship/backoffice/public/app.js` - Add resource minting UI to ship details view (lines 488-583)

### Files to CREATE:
- None (all backend APIs exist from Phase 1)

### Files to DELETE:
- None

---

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose | Status |
|--------|----------|---------|--------|
| Resource Mint API | `/backoffice/server/routes/resources.js` | POST /api/resources/mint | ✅ Working (lines 13-42) |
| Resource Balance API | `/backoffice/server/routes/resources.js` | GET /api/resources/balances/:address | ✅ Working (lines 48-87) |
| Ship TBA API | `/backoffice/server/routes/ships.js` | GET /api/ships/:tokenId/tba | ✅ Working (lines 118-159) |
| Ship Inspection UI | `/backoffice/public/app.js` | `displayShipDetails()` | ✅ Working (lines 488-583) |
| Resources Page UI | `/backoffice/public/app.js` | `loadResourcesUI()` | ⚠️ Placeholder only (lines 585-594) |

**Key Finding:** All necessary backend infrastructure exists. The frontend just needs to wire it up.

### 2.2 Backend API Capabilities

#### POST /api/resources/mint
**Purpose:** Mint resource tokens to any address (including TBAs)

**Parameters:**
```javascript
{
  resourceSymbol: "CH4" | "O2" | "H2O" | "CO2" | "N2",
  to: "0x...",           // Ethereum address (can be a TBA)
  amount: "1000000000000000000"  // 18 decimal places
}
```

**Response:**
```javascript
{
  symbol: "CH4",
  to: "0x...",
  amount: "1000000000000000000",
  txHash: "0x...",
  blockNumber: 12345
}
```

**Important Notes:**
- Requires admin wallet signature
- Amount must be in wei (18 decimals): `1 token = 1000000000000000000 wei`
- No restriction on recipient address (can mint to EOAs or TBAs)

#### GET /api/resources/balances/:address
**Purpose:** Get all resource balances for an address

**Response:**
```javascript
{
  address: "0x...",
  balances: [
    {
      symbol: "CH4",
      name: "Methane",
      balance: "1000000000000000000",
      decimals: 18,
      address: "0x..." // token contract address
    },
    // ... 4 more resources
  ]
}
```

**Current Usage:** Called automatically when displaying ship TBA (line 379 in `app.js`)

### 2.3 Frontend API Client Functions

#### Existing Functions (in `app.js`)
```javascript
// Lines 53-58: mintResource()
async function mintResource(params) {
  return fetchAPI(`${API_BASE}/resources/mint`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// Lines 60-62: getResourceBalances()
async function getResourceBalances(address) {
  return fetchAPI(`${API_BASE}/resources/balances/${address}`);
}
```

**Status:** ✅ Fully implemented and working

### 2.4 Current Ship Details UI

The `displayShipDetails()` function (lines 488-583) shows:
- Ship stats (mass, sail area, reflectivity, max sails, cargo capacity, condition)
- Token Bound Account address
- Resource balances table

**Current Flow:**
1. User inspects ship by token ID
2. UI fetches ship stats + TBA data
3. Displays TBA resource balances in read-only table

**What's Missing:**
- No way to ADD resources to the ship
- No inline "mint to TBA" action

### 2.5 Current Resources Page UI

The `loadResourcesUI()` function (lines 585-594) is a **placeholder**:

```javascript
function loadResourcesUI(container) {
  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">RESOURCE MANAGEMENT</h1>
      <div class="form-panel">
        <p>Resource minting UI - Click SHIPS tab to mint ships first!</p>
      </div>
    </div>
  `;
}
```

**What's Missing:**
- Resource token contract addresses
- Resource metadata display
- Mint resources form
- Balance checker
- Resource overview dashboard

### 2.6 Smart Contract Details

#### ResourceToken.sol
```solidity
contract ResourceToken is ERC20, ERC20Burnable, Ownable {
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
```

**Key Characteristics:**
- Standard ERC-20 (18 decimals)
- Admin-only minting (`onlyOwner`)
- Burnable by holders
- No supply cap

**Deployed Tokens (from `app.js` lines 133-137):**
| Symbol | Name | Contract Address |
|--------|------|------------------|
| CH4 | Methane | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| O2 | Oxygen | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |
| H2O | Water | `0x5FC8d32690cc91D4c39d9d3abcBD16989F875707` |
| CO2 | Carbon Dioxide | `0xa513E6E4b8f2a923D98304ec87F64353C4D5C853` |
| N2 | Nitrogen | `0x8A791620dd6260079BF849Dc5567aDC3F2FdC318` |

#### ShipNFT.sol
```solidity
function getShipTBA(uint256 tokenId) external view returns (address) {
    // Returns deterministic TBA address
    // TBA can hold ERC-20 tokens (resources)
}
```

**Key Characteristics:**
- Each ship has a unique TBA address
- TBA can receive ERC-20 tokens
- TBA address is deterministic (computed from tokenId)
- No actual ERC-6551 account contract deployed (simplified for Phase 1)

### 2.7 Data Flow

#### Current Flow: Inspect Ship
```
User → inspectShipForm → getShip(tokenId) + getShipTBA(tokenId)
    → displayShipDetails() → shows TBA balances
```

#### Desired Flow: Add Resources to Ship
```
User → shipDetails → "Add Resources" button
    → mintResourceForm → mintResource({to: tbaAddress, ...})
    → refresh ship details → updated balances
```

#### Desired Flow: Resources Page
```
User → Resources tab → loadResourcesUI()
    → displays:
       1. Resource token info cards
       2. Mint resources form (to any address)
       3. Balance checker (check any address)
       4. Quick reference guide
```

---

## 3. Gap Analysis

### 3.1 Missing Capabilities

#### Feature 1: Add Resources to Ships
- [ ] "Add Resources" button in ship details view
- [ ] Inline mint form showing:
  - Resource dropdown (CH4, O2, H2O, CO2, N2)
  - Amount input (with decimal conversion helper)
  - Pre-filled recipient (TBA address)
- [ ] Form validation (positive amounts, valid resource)
- [ ] Success toast notification
- [ ] Auto-refresh balances after minting

#### Feature 2: Resources Page
- [ ] Resource token overview cards
  - Symbol, name, contract address
  - Total supply (optional)
  - Quick copy address button
- [ ] Mint Resources form
  - Resource dropdown
  - Recipient address input
  - Amount input with unit converter
- [ ] Balance checker
  - Address input
  - Shows all 5 resource balances
  - Formatted display (human-readable units)
- [ ] Quick reference guide
  - What each resource is used for (future game mechanics)
  - Decimal conversion table (1 unit = 10^18 wei)

### 3.2 Required Changes

#### Backend (Team A)
**Status:** ✅ **NO CHANGES NEEDED**
- All APIs exist and work correctly
- No new endpoints required
- No contract changes

#### Frontend (Team B)
**Required:**
1. Enhance `displayShipDetails()` to include "Add Resources" section
2. Implement `loadResourcesUI()` with full functionality
3. Add helper function `convertToWei(amount)` for decimal handling
4. Add form validation for resource minting

**Optional Enhancements:**
- Resource amount presets (e.g., "100 units", "1000 units")
- "Mint to this ship" quick action in ship list
- Resource balance history (requires new API)

### 3.3 Open Questions

#### UX Questions
1. **Amount input format:** Should users enter human-readable units (e.g., "100") or wei (e.g., "100000000000000000000")?
   - **Recommendation:** Human-readable with automatic wei conversion
2. **Resource selection:** Dropdown, radio buttons, or individual forms per resource?
   - **Recommendation:** Dropdown for flexibility
3. **Ship context:** Should Resources page show "recently inspected ship" for quick minting?
   - **Recommendation:** Yes, as a convenience feature

#### Technical Questions
1. **Error handling:** What if TBA address is invalid (shouldn't happen, but defensive coding)?
   - **Recommendation:** Validate TBA format before calling API
2. **Amount limits:** Should there be UI-enforced min/max amounts?
   - **Recommendation:** Min = 0.0001 (to prevent accidental dust), Max = 1,000,000 (reasonable cargo)
3. **Decimal precision:** Show all 18 decimals or round to 4?
   - **Recommendation:** Display 4 decimals, store 18

### 3.4 Design Patterns from Phase 1/2

#### Pattern 1: Form Panel Structure
All forms follow this structure:
```html
<div class="form-panel">
  <h2>SECTION TITLE</h2>
  <form id="formName">
    <div class="form-group">
      <label class="form-label">Label</label>
      <input class="form-input" ...>
    </div>
    <button class="btn btn-primary">ACTION</button>
  </form>
</div>
```

#### Pattern 2: Data Cards
```html
<div class="data-grid">
  <div class="data-card">
    <div class="data-card-title">TITLE</div>
    <div class="data-card-value">VALUE</div>
    <div class="data-card-meta">Metadata</div>
  </div>
</div>
```

#### Pattern 3: Loading States
```javascript
setLoading(true, 'Processing...');
try {
  await apiCall();
  showToast('Success!', 'success');
} catch (error) {
  showToast(error.message, 'error');
} finally {
  setLoading(false);
}
```

#### Pattern 4: Amount Formatting
```javascript
// From app.js lines 85-89
function formatTokenAmount(wei, decimals = 18, displayDecimals = 2) {
  const divisor = Math.pow(10, decimals);
  const ether = parseFloat(wei) / divisor;
  return ether.toFixed(displayDecimals);
}
```

**Note:** Need inverse function for minting:
```javascript
function convertToWei(amount, decimals = 18) {
  const multiplier = Math.pow(10, decimals);
  return (parseFloat(amount) * multiplier).toString();
}
```

---

## 4. Technical Constraints

### 4.1 No Backend Changes Allowed
- All backend APIs are locked (Phase 1 complete)
- Cannot add new routes or modify existing responses
- Must work with current API schema

### 4.2 Admin Wallet Only
- Only the admin wallet (0xf39Fd...92266) can mint resources
- User authentication not in scope for Phase 3
- All minting operations require admin signature

### 4.3 No Smart Contract Changes
- ResourceToken contracts are deployed and immutable
- Cannot change mint permissions or add features
- Must work within `onlyOwner` constraint

### 4.4 Decimal Precision
- All amounts must be 18 decimals (wei)
- JavaScript `Number` has precision limits (use string operations for large numbers)
- Display precision: 4 decimals (user-friendly)

### 4.5 Browser Compatibility
- Must work in modern browsers (Chrome, Firefox, Safari)
- No external dependencies (vanilla JS only)
- Bundled `app.js` approach (no ES6 modules in frontend)

---

## 5. Success Criteria

### Feature 1: Add Resources to Ships
✅ **Complete when:**
1. Ship details view has "Add Resources" section
2. User can select resource type from dropdown
3. User can enter amount in human-readable format
4. TBA address is pre-filled and read-only
5. Minting transaction succeeds
6. Resource balances auto-refresh after minting
7. Success/error toasts display correctly

### Feature 2: Resources Page
✅ **Complete when:**
1. Resources page shows all 5 resource token cards
2. Each card displays: symbol, name, contract address
3. Mint form allows selecting resource + entering amount + specifying recipient
4. Balance checker shows all 5 balances for any address
5. Decimal conversion is automatic and correct
6. Page layout matches existing design patterns
7. All API calls handle errors gracefully

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Decimal conversion errors | Medium | High | Add unit tests, validate with small amounts first |
| TBA address validation | Low | Medium | Use regex validation before API call |
| Large number precision loss | Low | High | Use string operations for wei conversion |
| User confusion with amount input | Medium | Low | Add helper text, show examples |
| API rate limiting (multiple mints) | Low | Low | No rate limiting on local Hardhat |

---

## 7. Next Steps

1. **Brainstorming Phase** - Spawn specialized agents to propose solutions:
   - UX/UI Designer: Propose user workflows and mockups
   - Frontend Developer: Propose implementation approach
   - Backend Architect: Validate API integration patterns
   - Solar System Expert: Suggest resource quantities and use cases

2. **Synthesis Phase** - Merge proposals into coherent plan

3. **Review Phase** - Validate with 7-perspective review

4. **Implementation Phase** - Execute units of work

5. **Verification Phase** - Test end-to-end functionality

---

## Appendix A: Resource Reference

### Resource Symbols
| Symbol | Name | Typical Use (Future) |
|--------|------|----------------------|
| CH4 | Methane | Fuel for chemical rockets |
| O2 | Oxygen | Life support, oxidizer |
| H2O | Water | Life support, radiation shielding |
| CO2 | Carbon Dioxide | Greenhouse gas (terraforming) |
| N2 | Nitrogen | Pressurization, life support |

### Amount Examples
| Human-Readable | Wei (18 decimals) |
|----------------|-------------------|
| 1 unit | 1000000000000000000 |
| 100 units | 100000000000000000000 |
| 0.5 units | 500000000000000000 |
| 1,000 units | 1000000000000000000000 |

---

**Document Status:** ✅ Discovery Complete
**Next Document:** `PHASE3_PROPOSALS.md` (Brainstorming)
