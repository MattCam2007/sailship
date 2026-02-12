# Phase 2: Quick Start Guide

**Date:** 2026-02-12
**Status:** Ready to Begin

---

## Overview

Phase 2 adds list/view functionality to the backoffice UI. All backend APIs already exist from Phase 1, so this is purely frontend work.

**Key Insight:** The backend APIs for listing ships and celestial bodies were implemented in Phase 1 but never connected to the UI!

---

## Prerequisites

Before starting, ensure:

1. **Hardhat node running:**
   ```bash
   cd /Users/mattcameron/Projects/sailship/contracts
   npx hardhat node
   ```

2. **Contracts deployed:**
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```

3. **Backoffice server running:**
   ```bash
   cd /Users/mattcameron/Projects/sailship/backoffice
   npm start
   # Server at http://localhost:3000
   ```

4. **Test data exists:**
   - At least 1 ship minted
   - At least 1 celestial body created
   - (Use backoffice UI to create test data)

---

## Team Assignments

### ✅ Team A: Backend/API
**Status:** COMPLETE (all APIs exist from Phase 1)

No work required. The following APIs are already implemented:
- `GET /api/ships?owner={address}` - List ships
- `GET /api/celestial-bodies` - List celestial bodies
- All other CRUD endpoints working

---

### 🚀 Team B: Frontend/UI
**Status:** READY TO START

**Tasks:**
1. **Task #1** - Ships List Display (Unit 1) - START HERE
2. **Task #2** - Ship Card Click-to-Expand (Unit 2) - Blocked by #1
3. **Task #3** - Resources Metadata Display (Unit 3) - Can start immediately
4. **Task #4** - Celestial Bodies Auto-Load (Unit 4) - Can start immediately

**Recommended Order:**
```
Start with Task #1 (Ships List)
  ↓
Then Task #2 (Ship Click)
  ↓
Parallel: Task #3 (Resources) + Task #4 (Bodies)
```

**Files to Edit:**
- `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/ships.js`
- `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/resources.js`
- `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/celestialBodies.js`

**Key Patterns to Follow:**
```javascript
// Auto-load on page init pattern
export function loadSomeUI(container) {
  container.innerHTML = `...`; // Render HTML
  setupForms();                // Attach event listeners
  loadData();                  // NEW: Auto-load data
}

// API call pattern
async function loadData() {
  setLoading(true, 'Loading...');
  try {
    const data = await apiCall();
    displayData(data);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}
```

**CSS Classes Available:**
- `.data-card` - Card container
- `.data-card-title` - Card header
- `.data-card-value` - Card main value
- `.data-card-meta` - Card metadata
- `.data-table` - Table container
- `.data-grid` - Grid layout for cards

---

### 🧪 Team C: Integration/Testing
**Status:** WAITING FOR TEAM B

**Tasks:**
5. **Task #5** - Integration Test Suite (Unit 6) - Blocked by Tasks 1-4
6. **Task #6** - Verification Report (Unit 7) - Blocked by Task 5

**When Team B Completes:**
1. Pull latest code from `crypto/framing` branch
2. Start backoffice (ensure Hardhat running)
3. Execute all test cases from Task #5
4. Document results in verification report (Task #6)

**Test Environment:**
- Browser: Chrome (primary), Firefox, Safari (optional)
- Network: Hardhat localhost:8545
- Server: Backoffice localhost:3000

---

## Current Branch

All work happens on: **`crypto/framing`**

```bash
git status
# On branch crypto/framing
# Modified: backoffice/ directory
```

---

## API Reference (Already Exists!)

### Ships API
```javascript
// List ships (ALREADY IMPLEMENTED!)
import { listShips } from './api.js';
const ships = await listShips(ownerAddress);
// Returns: [{ tokenId, stats: { className, mass, sailArea, ... } }]

// Get single ship
const ship = await getShip(tokenId);

// Get TBA balances
const tba = await getShipTBA(tokenId);
```

### Celestial Bodies API
```javascript
// List bodies (ALREADY IMPLEMENTED!)
import { listCelestialBodies } from './api.js';
const bodies = await listCelestialBodies();
// Returns: [{ name, bodyType, address }]
```

---

## Testing Workflow

After each unit implementation:

1. **Save file** (auto-reload in browser)
2. **Refresh backoffice** (http://localhost:3000)
3. **Navigate to tab** (Ships / Resources / Celestial)
4. **Verify acceptance criteria** from task description
5. **Check console** for errors (F12 → Console)
6. **Test error cases** (disconnect Hardhat, invalid input)

---

## Common Issues & Solutions

### Issue: "Ships list is empty"
**Solution:** Check if ships exist. Mint a test ship using the mint form.

### Issue: "Contract not deployed"
**Solution:** Run deployment script:
```bash
cd /Users/mattcameron/Projects/sailship/contracts
npx hardhat run scripts/deploy.js --network localhost
```

### Issue: "Network error"
**Solution:** Verify Hardhat node is running at localhost:8545

### Issue: "Admin address is 0x..."
**Solution:** Backoffice server not connected. Check server logs.

---

## Definition of Done

Each task is **DONE** when:
- [ ] Code changes committed to `crypto/framing` branch
- [ ] All acceptance criteria met
- [ ] No console errors
- [ ] Loading states work correctly
- [ ] Error handling works (test by disconnecting Hardhat)
- [ ] UI matches existing dark theme aesthetic

Phase 2 is **COMPLETE** when:
- [ ] All 6 tasks complete
- [ ] Verification report signed off
- [ ] No critical bugs

---

## Next Steps

1. **Team B**: Start with Task #1 (Ships List Display)
2. **Team C**: Wait for Team B completion, then begin testing
3. **Lead Coordinator**: Monitor progress, review verification report

---

**Prepared By:** Lead Coordinator
**Good Luck!** 🚀
