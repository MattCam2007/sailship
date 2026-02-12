# Phase 2: Backoffice UI Enhancements - Feature Specification

**Date:** 2026-02-12
**Status:** Discovery Complete
**Lead Coordinator:** Claude Sonnet 4.5

---

## 1. Executive Summary

Phase 2 enhances the Sailship backoffice UI to provide complete CRUD (Create, Read, Update, Delete) functionality for ships, resources, and celestial bodies. Currently, the UI only allows creating/minting new entities. Phase 2 adds listing, viewing, and managing existing entities.

**Key Features:**
1. **Ships Page** - Display all minted ships with stats (currently only shows mint form)
2. **Resources Page** - Enhanced resource management UI (currently minimal functionality)
3. **Celestial Bodies Page** - Full CRUD for celestial bodies (currently only creation/harvest forms)

---

## 1.1 Estimated File Impact

### Files to EDIT:
- `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/ships.js` - Add ship listing functionality
- `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/resources.js` - Enhance resource UI with better filtering/viewing
- `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/celestialBodies.js` - Improve body list display with resource profiles

### Files to CREATE:
- None (all required API routes and backend services already exist from Phase 1)

### Files to DELETE:
- None

---

## 2. Current State Analysis

### 2.1 Existing Systems

| System | Location | Purpose | Status |
|--------|----------|---------|--------|
| Ship Minting API | `/server/routes/ships.js` | POST /api/ships/mint | ✅ Working |
| Ship Stats API | `/server/routes/ships.js` | GET /api/ships/:tokenId | ✅ Working |
| Ship TBA API | `/server/routes/ships.js` | GET /api/ships/:tokenId/tba | ✅ Working |
| **Ship List API** | `/server/routes/ships.js` | GET /api/ships | ✅ **EXISTS** (line 153) |
| Resource Mint API | `/server/routes/resources.js` | POST /api/resources/mint | ✅ Working |
| Resource Balance API | `/server/routes/resources.js` | GET /api/resources/balances/:address | ✅ Working |
| Celestial Body Create API | `/server/routes/celestialBodies.js` | POST /api/celestial-bodies/create | ✅ Working |
| Celestial Body List API | `/server/routes/celestialBodies.js` | GET /api/celestial-bodies | ✅ Working |
| Celestial Body Get API | `/server/routes/celestialBodies.js` | GET /api/celestial-bodies/:name | ✅ (assumed) |

**Key Finding:** All necessary backend APIs already exist! Phase 2 is purely a frontend enhancement task.

### 2.2 Current UI State

#### Ships Page (`/backoffice/public/js/ui/ships.js`)
**Current:**
- Mint ship form ✅
- Inspect single ship by token ID ✅
- Displays ship stats + TBA balances ✅

**Missing:**
- List of all minted ships
- Owner filter
- Quick view cards for each ship

#### Resources Page (`/backoffice/public/js/ui/resources.js`)
**Current:**
- Mint resources form ✅
- Check balances for any address ✅

**Missing:**
- List of all resource tokens with metadata
- Total supply display
- Filter by resource type

#### Celestial Bodies Page (`/backoffice/public/js/ui/celestialBodies.js`)
**Current:**
- Create celestial body form ✅
- Add resource emission profile ✅
- Harvest resources ✅
- List all celestial bodies ✅ (via refresh button)

**Missing:**
- Auto-load bodies list on page load
- Display resource emission profiles for each body
- Better visual hierarchy

### 2.3 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  USER                                                       │
│    ↓                                                        │
│  UI Component (ships.js / resources.js / celestialBodies.js)│
│    ↓                                                        │
│  API Client (api.js) - already has listShips() defined!    │
│    ↓                                                        │
│  Express Routes (server/routes/*.js)                        │
│    ↓                                                        │
│  Contract Services (server/services/contracts.js)           │
│    ↓                                                        │
│  Ethers.js Contract Instances                               │
│    ↓                                                        │
│  Hardhat Local Chain                                        │
└─────────────────────────────────────────────────────────────┘
```

**Critical Observation:** The API client already has `listShips()` defined (line 44-47 of `api.js`), but the ships UI never calls it!

### 2.4 Relevant Code

#### API Client (`api.js`)
- **Line 44-47:** `listShips(owner)` function exists but unused
- **Line 85-87:** `listCelestialBodies()` function exists and IS used

#### Ships Route (`server/routes/ships.js`)
- **Line 153-193:** `GET /api/ships` route with owner filtering logic
- Returns empty array if no owner specified (line 189)
- Uses `tokenOfOwnerByIndex` for enumeration

#### Ships UI (`ui/ships.js`)
- **Line 7-99:** Only renders forms, no list display
- **Line 156-218:** `displayShipDetails()` function for single ship inspection

---

## 3. Gap Analysis

### 3.1 Missing Capabilities

#### Ships Page
- [ ] Call `listShips()` API on page load
- [ ] Display ships in card grid layout
- [ ] Show truncated stats (className, mass, sail area) on cards
- [ ] Click card to expand full details
- [ ] Owner filter dropdown/input

#### Resources Page
- [ ] Display all 5 resource token contracts
- [ ] Show token metadata (symbol, name, decimals, contract address)
- [ ] Quick reference for resource types

#### Celestial Bodies Page
- [ ] Auto-load bodies list on page load (currently requires button click)
- [ ] Display resource emission profiles per body
- [ ] Show body contract address in list

### 3.2 Required Changes

#### Team A: Backend/API
**Status:** ✅ NO WORK REQUIRED - All APIs exist!

The following APIs are already implemented and working:
- `GET /api/ships` - List ships by owner
- `GET /api/celestial-bodies` - List all bodies

#### Team B: Frontend/UI
**Required Changes:**

1. **Ships Page (`ui/ships.js`)**
   - Add "MINTED SHIPS" section above or below mint form
   - Call `listShips()` on page load (default to admin address)
   - Create `displayShipsList(ships)` function
   - Add refresh button
   - Add owner filter input

2. **Resources Page (`ui/resources.js`)**
   - Add "RESOURCE TOKENS" info panel
   - Display all 5 resources with metadata from config
   - Show contract addresses

3. **Celestial Bodies Page (`ui/celestialBodies.js`)**
   - Auto-call refresh on page load
   - Enhance `displayBodiesList()` to show resource profiles
   - Add loading state

#### Team C: Integration/Testing
**Required Testing:**

1. Verify ships list displays correctly with 0, 1, and multiple ships
2. Verify owner filtering works
3. Verify celestial bodies auto-load
4. Verify all data matches blockchain state
5. Cross-browser testing (Chrome, Firefox, Safari)
6. Responsive design testing

---

## 4. Design Patterns

### 4.1 UI Layout Pattern

All pages follow this structure:
```
┌─────────────────────────────────────────────────┐
│  <h1> PAGE TITLE                                │
│  <p> Page description                           │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ SECTION 1: CREATE/MINT FORM               │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │ SECTION 2: VIEW/INSPECT                   │ │
│  │  [Refresh Button]                          │ │
│  │  [Data Grid/Cards]                         │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### 4.2 Data Display Pattern

**Card Grid** (for ships):
```html
<div class="data-grid">
  <div class="data-card">
    <div class="data-card-title">SHIP #1</div>
    <div class="data-card-value">HELIOS-CLASS</div>
    <!-- Quick stats -->
  </div>
</div>
```

**Table** (for lists):
```html
<table class="data-table">
  <thead>...</thead>
  <tbody>...</tbody>
</table>
```

### 4.3 Loading Pattern

All async operations use:
```javascript
setLoading(true, 'Loading message...');
try {
  const data = await apiCall();
  displayData(data);
} catch (error) {
  showToast(error.message, 'error');
} finally {
  setLoading(false);
}
```

---

## 5. Open Questions

### 5.1 Ships List Default Behavior
**Question:** Should ships list default to showing:
- A) All ships (requires on-chain enumeration, currently returns empty array)
- B) Admin's ships (requires passing admin address)
- C) Empty state with "Enter owner address to view ships"

**Recommendation:** Option B - Default to admin's ships since this is an admin tool.

### 5.2 Refresh Frequency
**Question:** Should lists auto-refresh on interval?

**Recommendation:** No. Manual refresh only to avoid unnecessary RPC calls.

### 5.3 Resource Metadata Source
**Question:** Where to get resource metadata (names, symbols)?

**Recommendation:** Hard-code in frontend since there are only 5 resources and they're defined in contracts/scripts/deploy.js.

---

## 6. Success Criteria

Phase 2 is complete when:

- [ ] Ships page displays list of minted ships on load
- [ ] Ship cards show className, mass, sail area, token ID
- [ ] Clicking ship card/button loads full stats + TBA balances
- [ ] Resources page displays all 5 resource token addresses
- [ ] Celestial bodies page auto-loads list on page open
- [ ] All data matches blockchain state
- [ ] No console errors
- [ ] UI matches existing dark theme aesthetic
- [ ] Toast notifications work for all operations
- [ ] Loading states work correctly

---

## 7. Phase Approach

### Phase 2.1: Ships List (Priority: High)
- Display minted ships on ships page
- Owner filtering
- Quick view cards

### Phase 2.2: Resources Info (Priority: Medium)
- Display resource token metadata
- Contract addresses

### Phase 2.3: Celestial Bodies Auto-Load (Priority: Low)
- Auto-load bodies list
- Display resource profiles

---

**Prepared By:** Lead Coordinator
**Next Step:** Create implementation plan with atomic units of work
**Teams Required:** 3 (Backend/API, Frontend/UI, Integration/Testing)
