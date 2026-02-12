# Phase 3: Resource Management - Implementation Plan

**Date:** 2026-02-12
**Status:** Ready for Implementation
**Lead Coordinator:** Claude Sonnet 4.5

---

## 0. File Impact Summary

### Files to EDIT:
1. `/Users/mattcameron/Projects/sailship/backoffice/public/app.js`
   - Add constants for resource tokens (lines 1-30)
   - Add utility functions: `convertToWei()`, `isValidAddress()` (lines 76-125)
   - Modify `displayShipDetails()` to include resources form (lines 488-583)
   - Replace `loadResourcesUI()` with full implementation (lines 585-594)
   - Add new functions: `setupAddResourcesForm()`, `setupResourceForms()`, `displayBalances()`

### Files to CREATE:
- None

### Files to DELETE:
- None

---

## 1. Problem Statement

### 1.1 Description

**Current State:**
- Ship inspection shows resource balances (read-only)
- Resources page is a placeholder with no functionality
- No way to add resources to ships from the UI

**Desired State:**
- Users can mint resources directly to a ship's TBA from the ship details view
- Resources page provides full resource management (mint, check balances, view tokens)
- All operations follow existing UI patterns and handle errors gracefully

### 1.2 Root Cause

Phase 1 implemented backend APIs but left frontend UI as placeholders to focus on blockchain infrastructure first.

### 1.3 Constraints

1. **No Backend Changes** - All APIs exist from Phase 1, frontend only
2. **No Smart Contract Changes** - Work with existing ResourceToken.sol
3. **Admin Wallet Only** - Only admin can mint (0xf39Fd...92266)
4. **Vanilla JS** - No external dependencies, bundled app.js approach
5. **18 Decimal Precision** - ERC-20 standard (wei units)

---

## 2. Solution Architecture

### 2.1 High-Level Design

```
┌─────────────────────────────────────────────────────────────┐
│  FEATURE 1: Add Resources to Ships                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Ship Details View (existing)                          │  │
│  │  ├─ Stats Cards (existing) ✅                         │  │
│  │  ├─ TBA Address (existing) ✅                         │  │
│  │  ├─ Resource Balances Table (existing) ✅            │  │
│  │  └─ ADD RESOURCES Form (NEW) ➕                       │  │
│  │      ├─ Resource Dropdown                             │  │
│  │      ├─ Amount Input (auto-convert to wei)            │  │
│  │      ├─ TBA Address (read-only, pre-filled)           │  │
│  │      └─ "MINT TO SHIP" Button                         │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  Flow:                                                       │
│  User fills form → convertToWei() → mintResource() API      │
│  → Success toast → Auto-refresh ship details                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  FEATURE 2: Resources Page                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Section A: Resource Token Overview                    │  │
│  │  └─ 5 data cards (CH4, O2, H2O, CO2, N2)             │  │
│  │     - Symbol, Name, Contract Address                  │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ Section B: Mint Resources Form                        │  │
│  │  ├─ Resource Dropdown                                 │  │
│  │  ├─ Amount Input                                      │  │
│  │  ├─ Recipient Address Input                           │  │
│  │  └─ "MINT RESOURCES" Button                           │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │ Section C: Balance Checker                            │  │
│  │  ├─ Address Input                                     │  │
│  │  ├─ "CHECK" Button                                    │  │
│  │  └─ Results Table (shows all 5 balances)             │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Design Principles

1. **Consistency** - Follow existing form-panel, data-grid, button patterns
2. **Defensive** - Validate all inputs before API calls
3. **User-Friendly** - Human-readable units (not wei), clear error messages
4. **Immediate Feedback** - Loading states, toasts, auto-refresh
5. **Fail-Safe** - Graceful error handling, no silent failures

### 2.3 Key Algorithms

#### Algorithm 1: Wei Conversion (High Precision)
```javascript
/**
 * Convert human-readable amount to wei (18 decimals)
 * Uses string operations to avoid JavaScript Number precision limits
 *
 * Examples:
 *   convertToWei("100") → "100000000000000000000"
 *   convertToWei("0.5") → "500000000000000000"
 *   convertToWei("1000.1234") → "1000123400000000000000"
 */
function convertToWei(amount, decimals = 18) {
  // Validate input
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) {
    throw new Error('Invalid amount: must be a positive number');
  }

  // Split into integer and decimal parts
  const [intPart, decPart = ''] = amount.toString().split('.');

  // Pad or truncate decimal part to exactly 18 digits
  const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals);

  // Concatenate integer + decimal (this is the wei amount)
  const weiStr = intPart + paddedDec;

  // Remove leading zeros (except single zero)
  return weiStr.replace(/^0+/, '') || '0';
}
```

#### Algorithm 2: Address Validation
```javascript
/**
 * Validate Ethereum address format
 * Accepts both checksummed and non-checksummed addresses
 */
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}
```

#### Algorithm 3: Resource Dropdown Generation
```javascript
/**
 * Generate resource <option> elements from constant array
 * Single source of truth for resource metadata
 */
function generateResourceOptions() {
  return RESOURCE_TOKENS.map(token =>
    `<option value="${token.symbol}">${token.symbol} (${token.name})</option>`
  ).join('');
}
```

---

## 3. Units of Work

### Unit 1: Add Constants and Utility Functions

**Description:** Add resource token constants and utility functions (`convertToWei`, `isValidAddress`, `generateResourceOptions`)

**Files:**
- `/Users/mattcameron/Projects/sailship/backoffice/public/app.js`

**Changes:**
1. Add `RESOURCE_TOKENS` constant array at top of file (after line 5)
2. Add `MIN_RESOURCE_AMOUNT` constant
3. Add `convertToWei()` utility function (after line 89)
4. Add `isValidAddress()` utility function
5. Add `generateResourceOptions()` utility function

**Acceptance Criteria:**
- [ ] `RESOURCE_TOKENS` array contains 5 resources with symbol, name, address
- [ ] `convertToWei("100")` returns `"100000000000000000000"`
- [ ] `convertToWei("0.5")` returns `"500000000000000000"`
- [ ] `convertToWei("1000.123456789012345678")` returns correct wei (full precision)
- [ ] `isValidAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")` returns `true`
- [ ] `isValidAddress("invalid")` returns `false`
- [ ] `generateResourceOptions()` returns 5 `<option>` elements

**Test Method:** Browser console
```javascript
console.log(RESOURCE_TOKENS); // Should show 5 resources
console.log(convertToWei("100")); // Should be "100000000000000000000"
console.log(convertToWei("0.5")); // Should be "500000000000000000"
console.log(isValidAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")); // true
console.log(generateResourceOptions()); // HTML string with 5 options
```

---

### Unit 2: Extract Resources Form HTML Function

**Description:** Create helper function to generate "Add Resources" form HTML (to be used in `displayShipDetails`)

**Files:**
- `/Users/mattcameron/Projects/sailship/backoffice/public/app.js`

**Changes:**
1. Add `generateAddResourcesFormHTML(tokenId, tbaAddress)` function

**Function Signature:**
```javascript
/**
 * Generate HTML for "Add Resources to Ship" form
 * @param {string} tokenId - Ship token ID
 * @param {string} tbaAddress - Ship's TBA address
 * @returns {string} HTML string
 */
function generateAddResourcesFormHTML(tokenId, tbaAddress) {
  return `
    <div class="form-panel" style="margin-top: 20px; background: rgba(78, 232, 196, 0.03);">
      <h3 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 16px;">
        ADD RESOURCES TO SHIP
      </h3>
      <form id="addResourcesForm" data-token-id="${tokenId}" data-tba="${tbaAddress}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Resource Type</label>
            <select class="form-input" name="resourceSymbol" required>
              <option value="">-- Select Resource --</option>
              ${generateResourceOptions()}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Amount (kg)</label>
            <input type="number" class="form-input" name="amount"
                   placeholder="100" min="${MIN_RESOURCE_AMOUNT}" step="0.0001" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Recipient (TBA)</label>
          <input type="text" class="form-input mono" name="to"
                 value="${tbaAddress}" readonly
                 style="background: var(--bg-dark); cursor: not-allowed; color: var(--text-muted);">
        </div>
        <button type="submit" class="btn btn-primary">
          ⚗️ MINT TO SHIP
        </button>
      </form>
    </div>
  `;
}
```

**Acceptance Criteria:**
- [ ] Function returns valid HTML string
- [ ] Form has `data-token-id` and `data-tba` attributes
- [ ] Resource dropdown uses `generateResourceOptions()`
- [ ] Amount input has min/step attributes
- [ ] TBA input is read-only and styled correctly

**Test Method:** Browser console
```javascript
const html = generateAddResourcesFormHTML("1", "0xABC...123");
console.log(html); // Should be valid HTML with form
```

---

### Unit 3: Enhance `displayShipDetails()` to Include Resources Form

**Description:** Modify `displayShipDetails()` to append resources form HTML and set up event handler

**Files:**
- `/Users/mattcameron/Projects/sailship/backoffice/public/app.js`

**Changes:**
1. Append resources form HTML after balances table (line ~582)
2. Call `setupAddResourcesForm()` after rendering

**Acceptance Criteria:**
- [ ] Ship details view includes resources form
- [ ] Form appears below balances table
- [ ] Form is styled consistently with rest of page
- [ ] No JavaScript errors on page load
- [ ] Form does not appear if ship data is invalid

**Test Method:** Manual browser test
1. Navigate to SHIPS tab
2. Inspect any ship
3. Verify "ADD RESOURCES TO SHIP" form appears
4. Verify form fields are populated correctly

---

### Unit 4: Implement `setupAddResourcesForm()` Handler

**Description:** Create event handler for "Add Resources to Ship" form submission

**Files:**
- `/Users/mattcameron/Projects/sailship/backoffice/public/app.js`

**Changes:**
1. Add `setupAddResourcesForm()` function

**Function Implementation:**
```javascript
/**
 * Set up event handler for "Add Resources to Ship" form
 * Validates input, mints resources to TBA, refreshes ship details
 */
function setupAddResourcesForm() {
  const form = document.getElementById('addResourcesForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const tokenId = form.dataset.tokenId;
    const tbaAddress = form.dataset.tba;
    const resourceSymbol = formData.get('resourceSymbol');
    const amount = formData.get('amount');

    // Validation
    if (!resourceSymbol) {
      showToast('Please select a resource type', 'error');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Amount must be greater than 0', 'error');
      return;
    }
    if (!isValidAddress(tbaAddress)) {
      showToast('Invalid TBA address', 'error');
      return;
    }

    setLoading(true, 'Minting resources to ship...');

    try {
      // Convert to wei
      const weiAmount = convertToWei(amount);

      // Call API
      const result = await mintResource({
        resourceSymbol,
        to: tbaAddress,
        amount: weiAmount
      });

      showToast(
        `Minted ${amount} kg ${resourceSymbol} to ship #${tokenId}`,
        'success',
        'RESOURCES ADDED'
      );

      // Refresh ship details
      const [shipData, tbaData] = await Promise.all([
        getShip(tokenId),
        getShipTBA(tokenId)
      ]);
      displayShipDetails(tokenId, shipData, tbaData);

    } catch (error) {
      console.error('Mint error:', error);

      // User-friendly error messages
      let message = error.message;
      if (message.includes('gas')) {
        message = 'Transaction failed: insufficient gas or gas price too low';
      } else if (message.includes('revert')) {
        message = 'Transaction reverted: check admin wallet permissions';
      }

      showToast(message, 'error', 'MINT FAILED');
    } finally {
      setLoading(false);
    }
  });
}
```

**Acceptance Criteria:**
- [ ] Form submission is intercepted (no page reload)
- [ ] Validation checks resourceSymbol, amount, address
- [ ] `convertToWei()` is called with amount
- [ ] `mintResource()` API is called with correct params
- [ ] Success toast shows amount, symbol, token ID
- [ ] Ship details auto-refresh after minting
- [ ] Error toast displays user-friendly message
- [ ] Loading overlay shows during transaction

**Test Method:** Manual browser test
1. Fill out resources form (CH4, 100 kg)
2. Submit form
3. Verify loading overlay appears
4. Verify success toast shows
5. Verify balances table updates with new CH4 balance

---

### Unit 5: Implement Full `loadResourcesUI()` Function

**Description:** Replace placeholder `loadResourcesUI()` with full 3-section implementation

**Files:**
- `/Users/mattcameron/Projects/sailship/backoffice/public/app.js`

**Changes:**
1. Replace lines 585-594 with full implementation
2. Include 3 sections: Token Overview, Mint Form, Balance Checker

**Acceptance Criteria:**
- [ ] Section A: 5 resource token cards display correctly
- [ ] Section B: Mint resources form with resource dropdown, amount, recipient
- [ ] Section C: Balance checker form with address input
- [ ] All forms use consistent styling
- [ ] Resource dropdown generated from `RESOURCE_TOKENS` constant
- [ ] No hardcoded addresses (all from `RESOURCE_TOKENS`)

**Test Method:** Manual browser test
1. Navigate to RESOURCES tab
2. Verify 3 sections appear
3. Verify 5 resource cards in overview
4. Verify mint form has all fields
5. Verify balance checker form appears

---

### Unit 6: Implement `setupResourceForms()` Handler

**Description:** Create event handlers for mint resources form and balance checker form

**Files:**
- `/Users/mattcameron/Projects/sailship/backoffice/public/app.js`

**Changes:**
1. Add `setupResourceForms()` function
2. Handle mint form submission
3. Handle balance checker form submission

**Function Implementation:**
```javascript
/**
 * Set up event handlers for Resources page forms
 */
function setupResourceForms() {
  // Mint resource form
  const mintForm = document.getElementById('mintResourceForm');
  mintForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(mintForm);
    const resourceSymbol = formData.get('resourceSymbol');
    const amount = formData.get('amount');
    const to = formData.get('to');

    // Validation
    if (!resourceSymbol) {
      showToast('Please select a resource type', 'error');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Amount must be greater than 0', 'error');
      return;
    }
    if (!isValidAddress(to)) {
      showToast('Invalid recipient address format', 'error');
      return;
    }

    setLoading(true, 'Minting resources...');

    try {
      const weiAmount = convertToWei(amount);

      const result = await mintResource({
        resourceSymbol,
        to,
        amount: weiAmount
      });

      showToast(
        `Minted ${amount} kg ${resourceSymbol} to ${formatAddress(to)}`,
        'success',
        'RESOURCES MINTED'
      );

      mintForm.reset();
    } catch (error) {
      console.error('Mint error:', error);

      let message = error.message;
      if (message.includes('gas')) {
        message = 'Transaction failed: insufficient gas';
      } else if (message.includes('revert')) {
        message = 'Transaction reverted: check permissions';
      }

      showToast(message, 'error', 'MINT FAILED');
    } finally {
      setLoading(false);
    }
  });

  // Check balance form
  const balanceForm = document.getElementById('checkBalanceForm');
  balanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(balanceForm);
    const address = formData.get('address');

    // Validation
    if (!isValidAddress(address)) {
      showToast('Invalid address format', 'error');
      return;
    }

    setLoading(true, 'Fetching balances...');

    try {
      const data = await getResourceBalances(address);
      displayBalances(data);
    } catch (error) {
      console.error('Balance fetch error:', error);
      showToast(error.message, 'error', 'FETCH FAILED');
      document.getElementById('balanceResults').innerHTML = '';
    } finally {
      setLoading(false);
    }
  });
}
```

**Acceptance Criteria:**
- [ ] Mint form validates all inputs
- [ ] Mint form calls `convertToWei()` and `mintResource()`
- [ ] Mint form shows success toast and resets
- [ ] Balance form validates address format
- [ ] Balance form calls `getResourceBalances()` API
- [ ] Balance form calls `displayBalances()` to render results
- [ ] Both forms handle errors gracefully

**Test Method:** Manual browser test
1. **Mint Form:**
   - Fill form (O2, 500 kg, 0xf39Fd...)
   - Submit → verify success toast
   - Verify form resets
2. **Balance Form:**
   - Enter address (0xf39Fd...)
   - Submit → verify balances display

---

### Unit 7: Implement `displayBalances()` Function

**Description:** Create function to display resource balances in a formatted table

**Files:**
- `/Users/mattcameron/Projects/sailship/backoffice/public/app.js`

**Changes:**
1. Add `displayBalances(data)` function

**Function Implementation:**
```javascript
/**
 * Display resource balances in formatted table
 * @param {object} data - { address, balances: [...] }
 */
function displayBalances(data) {
  const container = document.getElementById('balanceResults');

  if (!data || !data.balances || data.balances.length === 0) {
    container.innerHTML = '<p class="text-muted">No balances found</p>';
    return;
  }

  const balancesHTML = data.balances.map(b => `
    <tr>
      <td><strong>${b.symbol}</strong></td>
      <td>${b.name}</td>
      <td class="mono">${formatTokenAmount(b.balance, 18, 4)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div style="background: rgba(78, 232, 196, 0.05); border: 1px solid var(--accent-teal); padding: 20px; margin-top: 20px;">
      <h4 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 12px;">
        BALANCES FOR: <span class="mono text-primary">${formatAddress(data.address)}</span>
      </h4>
      <table class="data-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Balance (kg)</th>
          </tr>
        </thead>
        <tbody>
          ${balancesHTML}
        </tbody>
      </table>
    </div>
  `;
}
```

**Acceptance Criteria:**
- [ ] Function renders balances table correctly
- [ ] Table shows symbol, name, balance (formatted)
- [ ] Address is displayed at top (formatted)
- [ ] Empty balances show "No balances found" message
- [ ] Styling matches existing data-table pattern

**Test Method:** Manual browser test
1. Navigate to RESOURCES tab
2. Enter ship TBA address in balance checker
3. Submit form
4. Verify balances table displays with all 5 resources
5. Verify amounts are formatted (4 decimals)

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Precision loss in `convertToWei()` | Low | High | Use string operations (implemented in Unit 1) |
| Invalid address causes API error | Medium | Medium | Pre-flight validation with `isValidAddress()` |
| Large amounts cause overflow | Low | Medium | Document max amount (1,000,000 kg reasonable) |
| Loading overlay gets stuck | Low | Low | Add timeout (future enhancement) |
| User enters negative amount | Low | Low | HTML `min` attribute prevents |
| API returns 503 (not deployed) | Low | Medium | Check for 503, show friendly error |
| Multiple rapid form submissions | Medium | Low | Disable button during loading (future enhancement) |

---

## 5. Testing Strategy

### 5.1 Unit Tests (Browser Console)

**After Unit 1:**
```javascript
// Test convertToWei()
console.assert(convertToWei("100") === "100000000000000000000", "100 units");
console.assert(convertToWei("0.5") === "500000000000000000", "0.5 units");
console.assert(convertToWei("1000.123456789012345678") === "1000123456789012345678", "precision");

// Test isValidAddress()
console.assert(isValidAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266") === true, "valid address");
console.assert(isValidAddress("invalid") === false, "invalid address");
console.assert(isValidAddress("0x123") === false, "short address");

// Test generateResourceOptions()
const options = generateResourceOptions();
console.assert(options.includes("CH4"), "has CH4");
console.assert(options.includes("O2"), "has O2");
console.assert(options.split("<option").length === 6, "5 options + empty"); // 1 empty + 5 resources
```

### 5.2 Integration Tests

| Test Case | Steps | Expected Result |
|-----------|-------|-----------------|
| Mint CH4 to Ship | 1. Inspect ship #1<br>2. Fill form: CH4, 100 kg<br>3. Submit | Success toast, balance updates to 100.0000 CH4 |
| Mint O2 to External Address | 1. Go to RESOURCES tab<br>2. Fill form: O2, 500 kg, 0xf39Fd...<br>3. Submit | Success toast, form resets |
| Check TBA Balances | 1. Go to RESOURCES tab<br>2. Enter ship TBA in balance checker<br>3. Submit | Table shows all 5 resources with balances |
| Invalid Amount (Negative) | 1. Try to enter -100 in amount field | HTML validation prevents |
| Invalid Amount (Zero) | 1. Enter 0 in amount<br>2. Submit | Error toast: "Amount must be greater than 0" |
| Invalid Address | 1. Enter "invalid" in recipient<br>2. Submit | Error toast: "Invalid recipient address format" |
| Very Large Amount | 1. Enter 999999999999 in amount<br>2. Submit | Success (no precision loss) |

### 5.3 Manual Verification

**Checklist:**
- [ ] All forms styled consistently
- [ ] Loading overlays appear during transactions
- [ ] Success toasts show correct information
- [ ] Error toasts show user-friendly messages
- [ ] Ship details auto-refresh after minting
- [ ] Balance checker displays correctly
- [ ] No JavaScript errors in console
- [ ] Forms reset after successful submission
- [ ] Resource dropdown shows all 5 resources
- [ ] TBA address is read-only in ship form

---

## 6. Rollback Plan

**If implementation fails:**

1. **Revert app.js changes:**
   ```bash
   git checkout HEAD -- /Users/mattcameron/Projects/sailship/backoffice/public/app.js
   ```

2. **Restore placeholder `loadResourcesUI()`:**
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

3. **No database/contract rollback needed** (no backend changes)

---

## 7. Implementation Sequence

### Day 1: Foundation (Units 1-2)
- Add constants and utilities (1 hour)
- Extract form HTML function (30 min)
- Test in console (30 min)

### Day 2: Feature 1 (Units 3-4)
- Modify `displayShipDetails()` (1 hour)
- Implement `setupAddResourcesForm()` (1 hour)
- Manual testing (1 hour)

### Day 3: Feature 2 (Units 5-7)
- Implement `loadResourcesUI()` (1 hour)
- Implement `setupResourceForms()` (1 hour)
- Implement `displayBalances()` (30 min)
- Manual testing (1 hour)

### Day 4: Polish & Verification
- Edge case testing (1 hour)
- Error handling improvements (1 hour)
- Final regression check (1 hour)
- User acceptance testing (1 hour)

**Total Estimated Time:** 12-14 hours

---

## 8. Acceptance Criteria (Overall)

### Feature 1: Add Resources to Ships
✅ **Complete when:**
- [ ] Ship details view includes "Add Resources" form
- [ ] Form has resource dropdown, amount input, read-only TBA
- [ ] User can mint CH4, O2, H2O, CO2, N2 to ship
- [ ] Amount is converted from kg to wei correctly
- [ ] Success toast displays with amount, symbol, token ID
- [ ] Ship balances auto-refresh after minting
- [ ] Error toasts show user-friendly messages
- [ ] Loading overlay appears during transaction

### Feature 2: Resources Page
✅ **Complete when:**
- [ ] Resources page shows 5 resource token cards
- [ ] Each card displays symbol, name, contract address
- [ ] Mint form allows minting to any address
- [ ] Balance checker accepts any address
- [ ] Balance checker displays all 5 balances in table
- [ ] All forms validate inputs
- [ ] All forms handle errors gracefully
- [ ] Page styling matches existing patterns

### Code Quality
✅ **Complete when:**
- [ ] No hardcoded addresses (use `RESOURCE_TOKENS` constant)
- [ ] No code duplication (use helper functions)
- [ ] All functions < 100 lines
- [ ] All API calls wrapped in try-catch
- [ ] All async operations show loading states
- [ ] JSDoc comments on complex functions
- [ ] No console errors or warnings

---

## 9. Success Metrics

| Metric | Target | Verification Method |
|--------|--------|---------------------|
| Zero JavaScript errors | 0 errors | Browser console |
| Successful minting | 100% | 10 test transactions |
| Wei conversion accuracy | 100% | Unit test suite |
| User-friendly error rate | >90% | Test error cases (gas, invalid input, network) |
| Auto-refresh success | 100% | Mint to ship, verify balance updates |
| Form validation coverage | 100% | Test all invalid inputs |

---

**Document Status:** ✅ Implementation Plan Complete
**Next Step:** Execute units sequentially, commit after each unit
**Estimated Completion:** 3-4 days (12-14 hours)
