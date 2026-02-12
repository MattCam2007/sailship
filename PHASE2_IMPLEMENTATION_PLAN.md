# Phase 2: Backoffice UI Enhancements - Implementation Plan

**Date:** 2026-02-12
**Status:** Ready for Review → Implementation
**Spec:** [PHASE2_SPEC.md](./PHASE2_SPEC.md)

---

## 0. File Impact Summary

### Files to EDIT:
1. `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/ships.js` - Add ship list display
2. `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/resources.js` - Add resource metadata display
3. `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/celestialBodies.js` - Auto-load bodies on page load

### Files to CREATE:
- None

### Files to DELETE:
- None

---

## 1. Problem Statement

### 1.1 Description

The backoffice UI currently only allows **creating** new entities (ships, resources, celestial bodies) but does not provide easy **viewing** of existing entities. Users must manually enter token IDs or addresses to inspect data, which creates poor UX for admin tasks.

**Specific Issues:**
1. **Ships page** - No way to see all minted ships at a glance
2. **Resources page** - No reference for resource token addresses
3. **Celestial bodies page** - Requires manual button click to see bodies list

### 1.2 Root Cause

The backend APIs for listing entities exist and work correctly, but the frontend UI components never call them on page load. The disconnect occurred during Phase 1 implementation when the focus was on minting/creation flows rather than admin viewing workflows.

### 1.3 Constraints

- **No backend changes allowed** - All APIs already exist and are tested
- **Maintain existing UI patterns** - Use existing CSS classes and layout conventions
- **No breaking changes** - Existing mint/create forms must remain functional
- **Performance** - RPC calls are slow, so avoid polling/auto-refresh
- **Dark theme** - Match existing mission control aesthetic

---

## 2. Solution Architecture

### 2.1 High-Level Design

```
┌────────────────────────────────────────────────────────────┐
│  PAGE LOAD EVENT                                           │
│    ↓                                                       │
│  loadShipsUI(container)                                    │
│    ├─→ Render mint form HTML                              │
│    ├─→ Render ship list section HTML                      │
│    ├─→ setupShipForms()                                    │
│    └─→ loadShipsList()  ← NEW FUNCTION                    │
│         ├─→ Get admin address from DOM (#adminAddress)    │
│         ├─→ Call listShips(adminAddress)                  │
│         └─→ displayShipsList(ships)                        │
│              └─→ Render ship cards with click handlers    │
└────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

1. **Progressive Enhancement** - Page works without JavaScript, degrades gracefully
2. **Separation of Concerns** - Data fetching separate from rendering
3. **Reuse Existing Functions** - Use existing `displayShipDetails()` for expanded view
4. **Consistent Error Handling** - All API calls use try/catch with toast notifications
5. **Loading States** - All async operations show loading spinner

### 2.3 Key Patterns

#### Pattern 1: Auto-Load on Page Init
```javascript
export function loadShipsUI(container) {
  container.innerHTML = `...`; // Render HTML
  setupShipForms();            // Attach event listeners
  loadShipsList();             // NEW: Auto-load ships
}

async function loadShipsList() {
  setLoading(true, 'Loading ships...');
  try {
    const adminAddress = document.getElementById('adminAddress').textContent;
    const ships = await listShips(adminAddress);
    displayShipsList(ships);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}
```

#### Pattern 2: Card Grid with Click-to-Expand
```javascript
function displayShipsList(ships) {
  const container = document.getElementById('shipsList');

  if (ships.length === 0) {
    container.innerHTML = '<p class="text-muted">No ships minted yet.</p>';
    return;
  }

  const cardsHTML = ships.map(ship => `
    <div class="data-card clickable" data-token-id="${ship.tokenId}">
      <div class="data-card-title">SHIP #${ship.tokenId}</div>
      <div class="data-card-value">${ship.stats.className}</div>
      <div class="data-card-meta">
        Mass: ${formatNumber(ship.stats.mass)} kg
      </div>
    </div>
  `).join('');

  container.innerHTML = `<div class="data-grid">${cardsHTML}</div>`;

  // Attach click handlers
  container.querySelectorAll('.data-card').forEach(card => {
    card.addEventListener('click', async () => {
      const tokenId = card.dataset.tokenId;
      await loadShipDetails(tokenId);
    });
  });
}
```

---

## 3. Units of Work

### Unit 1: Ships List Display
**Team:** Frontend/UI (Team B)
**Description:** Add ship list section to ships page with auto-load on page init
**Files:** `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/ships.js`

**Changes:**
1. Add "MINTED SHIPS" section HTML to `loadShipsUI()` (after inspect form panel)
2. Create `loadShipsList()` async function to fetch and display ships
3. Create `displayShipsList(ships)` function to render ship cards
4. Call `loadShipsList()` at end of `loadShipsUI()`
5. Add refresh button with click handler to reload list

**Acceptance Criteria:**
- [ ] Ships list section appears below inspect form
- [ ] Ships auto-load when page loads
- [ ] Empty state shows "No ships minted yet" message
- [ ] Ship cards display token ID, className, mass
- [ ] Cards use existing `.data-card` CSS classes
- [ ] Loading spinner shows during fetch
- [ ] Error toast displays if fetch fails
- [ ] Refresh button reloads list

**Test Method:**
1. Navigate to Ships tab in backoffice
2. Verify ships list appears automatically
3. Mint a new ship
4. Click refresh button
5. Verify new ship appears in list

---

### Unit 2: Ship Card Click-to-Expand
**Team:** Frontend/UI (Team B)
**Description:** Make ship cards clickable to load full details + TBA balances
**Files:** `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/ships.js`

**Changes:**
1. Add click event listeners to ship cards in `displayShipsList()`
2. Create `loadShipDetails(tokenId)` helper function
3. Reuse existing `displayShipDetails()` function for rendering
4. Add CSS class `.clickable` to cards for cursor pointer

**Acceptance Criteria:**
- [ ] Clicking ship card loads full stats
- [ ] Ship details display in existing `#shipDetails` div
- [ ] Loading spinner shows during fetch
- [ ] Error handling works if ship doesn't exist
- [ ] Cursor changes to pointer on hover

**Test Method:**
1. Click on ship card in list
2. Verify full stats load below
3. Verify TBA balances display
4. Click different ship card
5. Verify details update

---

### Unit 3: Resources Metadata Display
**Team:** Frontend/UI (Team B)
**Description:** Add resource token reference section to resources page
**Files:** `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/resources.js`

**Changes:**
1. Add "RESOURCE TOKENS" section HTML to `loadResourcesUI()` (at top)
2. Hard-code resource metadata (CH4, O2, H2O, CO2, N2)
3. Create `displayResourceMetadata()` function
4. Render table with symbol, name, decimals, contract address

**Acceptance Criteria:**
- [ ] Resource tokens section appears at top of page
- [ ] All 5 resources listed (CH4, O2, H2O, CO2, N2)
- [ ] Table shows symbol, name, decimals (18), contract address
- [ ] Contract addresses are truncated with `formatAddress()`
- [ ] Uses existing `.data-table` CSS class

**Test Method:**
1. Navigate to Resources tab
2. Verify resource tokens section displays
3. Verify all 5 resources shown
4. Verify contract addresses are clickable/copyable

**Data Source:**
```javascript
const RESOURCE_METADATA = [
  { symbol: 'CH4', name: 'Methane', decimals: 18 },
  { symbol: 'O2', name: 'Oxygen', decimals: 18 },
  { symbol: 'H2O', name: 'Water', decimals: 18 },
  { symbol: 'CO2', name: 'Carbon Dioxide', decimals: 18 },
  { symbol: 'N2', name: 'Nitrogen', decimals: 18 }
];
```

---

### Unit 4: Celestial Bodies Auto-Load
**Team:** Frontend/UI (Team B)
**Description:** Auto-load celestial bodies list on page load instead of requiring button click
**Files:** `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/celestialBodies.js`

**Changes:**
1. Extract body loading logic from refresh button handler into `loadBodiesList()` function
2. Call `loadBodiesList()` at end of `loadCelestialBodiesUI()`
3. Keep refresh button for manual reload

**Acceptance Criteria:**
- [ ] Celestial bodies list loads automatically on page open
- [ ] Empty state shows "No celestial bodies created yet"
- [ ] Loading spinner displays during fetch
- [ ] Refresh button still works for manual reload
- [ ] Error handling with toast notification

**Test Method:**
1. Navigate to Celestial tab
2. Verify bodies list loads automatically
3. Verify empty state if no bodies exist
4. Create a new body
5. Click refresh
6. Verify new body appears

---

### Unit 5: Enhanced Celestial Bodies Display
**Team:** Frontend/UI (Team B)
**Description:** Show resource emission profiles for each celestial body
**Files:** `/Users/mattcameron/Projects/sailship/backoffice/public/js/ui/celestialBodies.js`

**Changes:**
1. Modify `displayBodiesList()` to fetch resource profiles for each body
2. Display emission rates under each body row
3. Add expandable sections for resource details

**Acceptance Criteria:**
- [ ] Each body shows count of configured resources
- [ ] Expandable row shows resource emission rates
- [ ] Emission rates formatted with units (tokens/second)
- [ ] Uses existing table expansion pattern

**Test Method:**
1. View celestial bodies list
2. Verify resource count shows for each body
3. Click to expand body details
4. Verify emission rates display correctly

**Note:** This unit may be deferred if API doesn't return resource profiles in list endpoint.

---

### Unit 6: Integration Testing
**Team:** Integration/Testing (Team C)
**Description:** End-to-end verification of all Phase 2 features
**Files:** N/A (testing only)

**Test Cases:**
1. **Ships List Display**
   - Load ships page → Verify auto-load
   - Mint new ship → Verify appears in list
   - Transfer ship to different owner → Verify list updates on refresh
   - Test with 0, 1, 10 ships

2. **Ship Card Interaction**
   - Click ship card → Verify details load
   - Verify TBA balances display
   - Mint resources to TBA → Refresh details → Verify balance updated

3. **Resources Display**
   - Load resources page → Verify metadata table
   - Verify contract addresses match .env
   - Copy address → Verify correct format

4. **Celestial Bodies Auto-Load**
   - Load celestial page → Verify auto-load
   - Create body → Refresh → Verify appears
   - Add resource to body → Verify profile updates

5. **Error Handling**
   - Disconnect Hardhat → Verify error toasts
   - Invalid owner address → Verify graceful failure
   - Network timeout → Verify loading state clears

6. **Cross-Browser**
   - Test in Chrome, Firefox, Safari
   - Verify responsive layout
   - Verify no console errors

**Acceptance Criteria:**
- [ ] All test cases pass
- [ ] No console errors or warnings
- [ ] All toast notifications display correctly
- [ ] All loading states work properly
- [ ] Data matches blockchain state

**Test Method:**
Run manual test suite in each browser, document results in verification report.

---

### Unit 7: Documentation Update
**Team:** Integration/Testing (Team C)
**Description:** Update PHASE2_VERIFICATION_REPORT.md with test results
**Files:** `/Users/mattcameron/Projects/sailship/PHASE2_VERIFICATION_REPORT.md` (create)

**Changes:**
1. Create verification report following template from PHASE1_VERIFICATION_REPORT.md
2. Document all test results with screenshots/output
3. Record any issues found
4. Provide sign-off

**Acceptance Criteria:**
- [ ] Verification report created
- [ ] All features documented as tested
- [ ] Screenshots included for visual features
- [ ] Issues section filled out (or "None")
- [ ] Coordinator sign-off provided

**Test Method:**
Review report for completeness and accuracy.

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| RPC timeout on large ship lists | Medium | Medium | Add pagination or limit to first N ships |
| Admin address not in DOM when page loads | Low | High | Add null check, fallback to empty state with instruction |
| Contract addresses not in config | Low | High | Hard-code fallback addresses, add config validation |
| CSS classes don't exist | Low | Medium | Reference existing ships.js for class names |
| Click event memory leak | Low | Low | Use event delegation or cleanup on re-render |
| Resource profiles API doesn't exist | Medium | Low | Defer Unit 5, mark as future enhancement |

---

## 5. Team Assignments

### Team A: Backend/API
**Status:** ✅ NO WORK REQUIRED

All necessary APIs already exist from Phase 1:
- `GET /api/ships` (line 153, ships.js)
- `GET /api/celestial-bodies` (line 85, api.js)

### Team B: Frontend/UI
**Assigned Units:** 1, 2, 3, 4, 5
**Estimated Time:** 3-4 hours
**Dependencies:** None

**Deliverables:**
- Updated `ui/ships.js` with ship list display
- Updated `ui/resources.js` with metadata display
- Updated `ui/celestialBodies.js` with auto-load
- All units passing acceptance criteria

### Team C: Integration/Testing
**Assigned Units:** 6, 7
**Estimated Time:** 2 hours
**Dependencies:** All Team B units complete

**Deliverables:**
- Complete test suite execution
- `PHASE2_VERIFICATION_REPORT.md`
- Bug reports (if any)
- Final sign-off

---

## 6. Implementation Order

```
Unit 1 (Ships List)
  ↓
Unit 2 (Ship Click)
  ↓
Unit 3 (Resources)
  ↓
Unit 4 (Bodies Auto-Load)
  ↓
Unit 5 (Bodies Profiles) [OPTIONAL]
  ↓
Unit 6 (Integration Tests)
  ↓
Unit 7 (Documentation)
```

**Total Estimated Time:** 5-6 hours
**Parallelization:** Units 3-4 can be done in parallel with Units 1-2

---

## 7. Testing Strategy

### 7.1 Unit Testing
Each unit has specific acceptance criteria with manual verification steps.

### 7.2 Integration Testing
Full end-to-end testing in Unit 6 covers:
- Page load sequences
- Cross-feature interactions
- Error scenarios
- Performance under load

### 7.3 Manual Verification
Admin must verify:
1. Hardhat node running
2. Contracts deployed
3. At least 1 ship minted
4. At least 1 celestial body created

---

## 8. Rollback Plan

If Phase 2 introduces breaking changes:
1. Revert commits to `crypto/framing` branch
2. Cherry-pick working units
3. Leave broken units for Phase 2.1 iteration

**Safe Rollback:** Each unit is independent and can be reverted individually.

---

## 9. Success Criteria

Phase 2 is **COMPLETE** when:

- [ ] All 7 units pass acceptance criteria
- [ ] Integration tests pass (Unit 6)
- [ ] Verification report signed off (Unit 7)
- [ ] No regression in existing functionality
- [ ] User can manage ships, resources, bodies without entering token IDs manually

---

**Plan Prepared By:** Lead Coordinator (Claude Sonnet 4.5)
**Next Step:** Spawn Team B (Frontend/UI) to begin implementation
**Review Status:** Ready for implementation (no backend changes needed)
