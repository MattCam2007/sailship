# Phase 3: Resource Management - Agent Proposals

**Date:** 2026-02-12
**Status:** Brainstorming Complete
**Lead Coordinator:** Claude Sonnet 4.5

---

## Agent Team A: UX/UI Designer Proposal

### Feature 1: Add Resources to Ships

**User Workflow:**
```
1. User navigates to SHIPS tab
2. User clicks on a ship card OR uses Inspect Ship form
3. Ship details expand showing:
   - Stats cards (existing)
   - TBA address (existing)
   - Resource balances table (existing)
   - ➕ NEW: "ADD RESOURCES" button below balances
4. Click "ADD RESOURCES" → inline form appears:
   - Resource dropdown (CH4, O2, H2O, CO2, N2)
   - Amount input with unit helper (e.g., "100" → "100.0000 units")
   - TBA address shown (read-only, greyed out)
   - "MINT TO SHIP" button
5. User fills form → clicks MINT
6. Loading spinner → Success toast
7. Balances table auto-refreshes
```

**UI Mockup (pseudo-HTML):**
```html
<div id="shipDetails">
  <!-- Existing ship stats cards -->
  <h4>TOKEN BOUND ACCOUNT (TBA): 0xABC...123</h4>

  <!-- Existing balances table -->
  <table class="data-table">
    <thead>
      <tr>
        <th>Resource</th>
        <th>Balance</th>
        <th>Token Address</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>CH4</td>
        <td class="mono">0.0000</td>
        <td class="mono text-muted">0xe7f...512</td>
      </tr>
      <!-- ... -->
    </tbody>
  </table>

  <!-- NEW: Add Resources Section -->
  <div class="form-panel" style="margin-top: 20px;">
    <h3>ADD RESOURCES TO SHIP</h3>
    <form id="addResourcesForm">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Resource Type</label>
          <select class="form-input" name="resourceSymbol" required>
            <option value="">-- Select Resource --</option>
            <option value="CH4">CH4 (Methane)</option>
            <option value="O2">O2 (Oxygen)</option>
            <option value="H2O">H2O (Water)</option>
            <option value="CO2">CO2 (Carbon Dioxide)</option>
            <option value="N2">N2 (Nitrogen)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Amount (units)</label>
          <input type="number" class="form-input" name="amount"
                 placeholder="100" min="0.0001" step="0.0001" required>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Recipient (TBA Address)</label>
        <input type="text" class="form-input mono" name="to"
               readonly style="background: var(--bg-dark); cursor: not-allowed;">
      </div>

      <button type="submit" class="btn btn-primary">
        ⚗️ MINT TO SHIP
      </button>
    </form>
  </div>
</div>
```

**Design Decisions:**
1. **Inline form** - Keeps user in context (no navigation away)
2. **Dropdown** - Compact, familiar pattern
3. **Unit converter** - User enters "100", backend gets "100000000000000000000"
4. **Read-only TBA** - User can't change recipient (prevents errors)
5. **Visual hierarchy** - Minting form is clearly separate from read-only data

### Feature 2: Resources Page

**User Workflow:**
```
1. User clicks RESOURCES tab
2. Page loads with 3 sections:
   A. Resource Token Overview (top)
   B. Mint Resources Form (middle)
   C. Balance Checker (bottom)
```

**Section A: Resource Token Overview**
```html
<div class="content-section">
  <h1 class="section-title">RESOURCE MANAGEMENT</h1>
  <p class="section-description">
    Manage in-game resource tokens (ERC-20). Mint resources to ships or check balances.
  </p>

  <div class="form-panel">
    <h2>DEPLOYED RESOURCE TOKENS</h2>
    <div class="data-grid">
      <div class="data-card">
        <div class="data-card-title">CH4</div>
        <div class="data-card-value">METHANE</div>
        <div class="data-card-meta mono" style="font-size: 10px;">
          0xe7f1...0512
          <button class="copy-btn" data-address="0xe7f...">📋</button>
        </div>
      </div>
      <!-- Repeat for O2, H2O, CO2, N2 -->
    </div>
  </div>
</div>
```

**Section B: Mint Resources Form**
```html
<div class="form-panel">
  <h2>MINT RESOURCES</h2>
  <form id="mintResourceForm">
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Resource Type</label>
        <select class="form-input" name="resourceSymbol" required>
          <option value="">-- Select Resource --</option>
          <option value="CH4">CH4 (Methane)</option>
          <option value="O2">O2 (Oxygen)</option>
          <option value="H2O">H2O (Water)</option>
          <option value="CO2">CO2 (Carbon Dioxide)</option>
          <option value="N2">N2 (Nitrogen)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Amount (units)</label>
        <input type="number" class="form-input" name="amount"
               placeholder="1000" min="0.0001" step="0.0001" required>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Recipient Address (EOA or TBA)</label>
      <input type="text" class="form-input mono" name="to"
             placeholder="0x..." required>
      <small style="color: var(--text-muted);">
        💡 Tip: Mint to a ship's TBA address to add cargo
      </small>
    </div>

    <button type="submit" class="btn btn-primary">
      ⚗️ MINT RESOURCES
    </button>
  </form>
</div>
```

**Section C: Balance Checker**
```html
<div class="form-panel">
  <h2>CHECK BALANCES</h2>
  <form id="checkBalanceForm" style="display: flex; gap: 12px; align-items: end;">
    <div class="form-group" style="flex: 1; margin-bottom: 0;">
      <label class="form-label">Address (EOA or TBA)</label>
      <input type="text" class="form-input mono" name="address"
             placeholder="0x..." required>
    </div>
    <button type="submit" class="btn btn-primary">
      🔍 CHECK
    </button>
  </form>

  <div id="balanceResults" class="mt-3"></div>
</div>
```

**Design Decisions:**
1. **3-panel layout** - Clear separation of concerns
2. **Token overview first** - Shows what's available before minting
3. **Copy buttons** - Easy to copy contract addresses
4. **Mint form flexibility** - Can mint to any address (not just TBAs)
5. **Balance checker** - Quick utility for any address

---

## Agent Team B: Backend Architect Proposal

### API Integration Pattern

**Current State:**
- ✅ All APIs exist and work
- ✅ No new endpoints needed
- ✅ API client functions already defined

**Validation Strategy:**
```javascript
// Wei conversion helper (add to app.js)
function convertToWei(amount, decimals = 18) {
  if (isNaN(amount) || amount < 0) {
    throw new Error('Invalid amount');
  }
  const multiplier = Math.pow(10, decimals);
  // Use string to avoid precision issues
  const weiAmount = BigInt(Math.floor(amount * Math.pow(10, 6))) * BigInt(Math.pow(10, 12));
  return weiAmount.toString();
}

// Address validation
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Resource symbol validation
function isValidResourceSymbol(symbol) {
  return ['CH4', 'O2', 'H2O', 'CO2', 'N2'].includes(symbol);
}
```

**Error Handling Strategy:**
```javascript
async function mintResourceToShip(tbaAddress, resourceSymbol, amount) {
  try {
    // Pre-flight validation
    if (!isValidAddress(tbaAddress)) {
      throw new Error('Invalid TBA address');
    }
    if (!isValidResourceSymbol(resourceSymbol)) {
      throw new Error('Invalid resource symbol');
    }
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Convert to wei
    const weiAmount = convertToWei(amount);

    // Call API
    setLoading(true, 'Minting resources...');
    const result = await mintResource({
      resourceSymbol,
      to: tbaAddress,
      amount: weiAmount
    });

    showToast(`Minted ${amount} ${resourceSymbol} to ship`, 'success', 'RESOURCES ADDED');
    return result;

  } catch (error) {
    console.error('Mint error:', error);

    // User-friendly error messages
    let message = error.message;
    if (message.includes('execution reverted')) {
      message = 'Transaction failed. Check admin wallet permissions.';
    } else if (message.includes('invalid address')) {
      message = 'Invalid recipient address format.';
    }

    showToast(message, 'error', 'MINT FAILED');
    throw error;

  } finally {
    setLoading(false);
  }
}
```

**Data Flow Optimization:**
```javascript
// After minting, refresh only the affected ship's balances
async function refreshShipBalances(tokenId) {
  const tbaData = await getShipTBA(tokenId);

  // Update only the balances table in the DOM
  const balancesHTML = tbaData.balances.map(b => `
    <tr>
      <td>${b.symbol}</td>
      <td class="mono">${formatTokenAmount(b.balance, 18, 4)}</td>
      <td class="mono text-muted">${formatAddress(b.address)}</td>
    </tr>
  `).join('');

  document.querySelector('#shipDetails table tbody').innerHTML = balancesHTML;
}
```

**Technical Decisions:**
1. **BigInt for precision** - Avoid JavaScript Number limitations
2. **Pre-flight validation** - Catch errors before API call
3. **User-friendly errors** - Translate blockchain errors to plain English
4. **Selective refresh** - Only update changed data (performance)
5. **Loading states** - Always show progress for async operations

---

## Agent Team C: Frontend Developer Proposal

### Implementation Approach

**Architecture:**
```
app.js
├── Utility Functions (lines 76-125)
│   ├── formatAddress() ✅
│   ├── formatNumber() ✅
│   ├── formatTokenAmount() ✅
│   └── convertToWei() ➕ NEW
├── UI Loaders (lines 128-605)
│   ├── loadShipsUI() → modify to call setupShipForms()
│   ├── loadResourcesUI() → ➕ IMPLEMENT FULLY
│   └── loadCelestialBodiesUI() ✅
├── Form Setup Functions
│   ├── setupShipForms() → ➕ ADD addResourcesForm handler
│   └── setupResourceForms() ➕ NEW
└── Display Functions
    ├── displayShipDetails() → ➕ ADD resources form
    └── displayBalances() ➕ NEW
```

**Component Structure:**

**1. Enhanced `displayShipDetails()` function:**
```javascript
function displayShipDetails(tokenId, shipData, tbaData) {
  const container = document.getElementById('shipDetails');

  // Existing ship stats HTML...

  // NEW: Add resources form
  container.innerHTML += `
    <div class="form-panel" style="margin-top: 20px; background: rgba(78, 232, 196, 0.03);">
      <h3 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 16px;">
        ADD RESOURCES TO SHIP
      </h3>
      <form id="addResourcesForm" data-token-id="${tokenId}" data-tba="${tbaData.tbaAddress}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Resource Type</label>
            <select class="form-input" name="resourceSymbol" required>
              <option value="">-- Select Resource --</option>
              <option value="CH4">CH4 (Methane)</option>
              <option value="O2">O2 (Oxygen)</option>
              <option value="H2O">H2O (Water)</option>
              <option value="CO2">CO2 (Carbon Dioxide)</option>
              <option value="N2">N2 (Nitrogen)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Amount (units)</label>
            <input type="number" class="form-input" name="amount"
                   placeholder="100" min="0.0001" step="0.0001" required>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Recipient (TBA)</label>
          <input type="text" class="form-input mono" name="to"
                 value="${tbaData.tbaAddress}" readonly
                 style="background: var(--bg-dark); cursor: not-allowed; color: var(--text-muted);">
        </div>
        <button type="submit" class="btn btn-primary">
          ⚗️ MINT TO SHIP
        </button>
      </form>
    </div>
  `;

  // Attach event listener
  setupAddResourcesForm();
}
```

**2. New `setupAddResourcesForm()` function:**
```javascript
function setupAddResourcesForm() {
  const form = document.getElementById('addResourcesForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true, 'Minting resources to ship...');

    try {
      const formData = new FormData(form);
      const tokenId = form.dataset.tokenId;
      const tbaAddress = form.dataset.tba;

      const params = {
        resourceSymbol: formData.get('resourceSymbol'),
        to: tbaAddress,
        amount: convertToWei(formData.get('amount'))
      };

      await mintResource(params);

      showToast(
        `Minted ${formData.get('amount')} ${params.resourceSymbol} to ship #${tokenId}`,
        'success',
        'RESOURCES ADDED'
      );

      // Refresh ship details to show updated balances
      const [shipData, tbaData] = await Promise.all([
        getShip(tokenId),
        getShipTBA(tokenId)
      ]);
      displayShipDetails(tokenId, shipData, tbaData);

    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  });
}
```

**3. New `loadResourcesUI()` implementation:**
```javascript
function loadResourcesUI(container) {
  const resourceTokens = [
    { symbol: 'CH4', name: 'Methane', address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' },
    { symbol: 'O2', name: 'Oxygen', address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' },
    { symbol: 'H2O', name: 'Water', address: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' },
    { symbol: 'CO2', name: 'Carbon Dioxide', address: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853' },
    { symbol: 'N2', name: 'Nitrogen', address: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318' }
  ];

  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">RESOURCE MANAGEMENT</h1>
      <p class="section-description">
        Manage in-game resource tokens (ERC-20). Mint resources to any address or check balances.
      </p>

      <!-- Resource Token Overview -->
      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          DEPLOYED RESOURCE TOKENS
        </h2>
        <div class="data-grid">
          ${resourceTokens.map(token => `
            <div class="data-card">
              <div class="data-card-title">${token.symbol}</div>
              <div class="data-card-value">${token.name}</div>
              <div class="data-card-meta mono" style="font-size: 10px; word-break: break-all;">
                ${formatAddress(token.address)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Mint Resources Form -->
      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          MINT RESOURCES
        </h2>
        <form id="mintResourceForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Resource Type</label>
              <select class="form-input" name="resourceSymbol" required>
                <option value="">-- Select Resource --</option>
                ${resourceTokens.map(t => `
                  <option value="${t.symbol}">${t.symbol} (${t.name})</option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Amount (units)</label>
              <input type="number" class="form-input" name="amount"
                     placeholder="1000" min="0.0001" step="0.0001" required>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Recipient Address (EOA or TBA)</label>
            <input type="text" class="form-input mono" name="to"
                   placeholder="0x..." required>
            <small style="color: var(--text-muted); display: block; margin-top: 4px;">
              💡 Tip: Mint to a ship's TBA address to add cargo
            </small>
          </div>

          <button type="submit" class="btn btn-primary">
            ⚗️ MINT RESOURCES
          </button>
        </form>
      </div>

      <!-- Balance Checker -->
      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          CHECK BALANCES
        </h2>
        <form id="checkBalanceForm" style="display: flex; gap: 12px; align-items: end;">
          <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <label class="form-label">Address (EOA or TBA)</label>
            <input type="text" class="form-input mono" name="address"
                   placeholder="0x..." required>
          </div>
          <button type="submit" class="btn btn-primary">
            🔍 CHECK
          </button>
        </form>

        <div id="balanceResults" class="mt-3"></div>
      </div>
    </div>
  `;

  setupResourceForms();
}
```

**4. New `setupResourceForms()` function:**
```javascript
function setupResourceForms() {
  // Mint resource form
  const mintForm = document.getElementById('mintResourceForm');
  mintForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true, 'Minting resources...');

    try {
      const formData = new FormData(mintForm);
      const params = {
        resourceSymbol: formData.get('resourceSymbol'),
        to: formData.get('to'),
        amount: convertToWei(formData.get('amount'))
      };

      const result = await mintResource(params);

      showToast(
        `Minted ${formData.get('amount')} ${params.resourceSymbol} to ${formatAddress(params.to)}`,
        'success',
        'RESOURCES MINTED'
      );

      mintForm.reset();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  });

  // Check balance form
  const balanceForm = document.getElementById('checkBalanceForm');
  balanceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true, 'Fetching balances...');

    try {
      const formData = new FormData(balanceForm);
      const address = formData.get('address');

      const data = await getResourceBalances(address);
      displayBalances(data);

    } catch (error) {
      showToast(error.message, 'error');
      document.getElementById('balanceResults').innerHTML = '';
    } finally {
      setLoading(false);
    }
  });
}
```

**5. New `displayBalances()` function:**
```javascript
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
            <th>Balance (units)</th>
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

**6. New `convertToWei()` utility:**
```javascript
function convertToWei(amount, decimals = 18) {
  if (isNaN(amount) || amount < 0) {
    throw new Error('Invalid amount: must be a positive number');
  }

  const multiplier = Math.pow(10, decimals);
  const weiAmount = Math.floor(parseFloat(amount) * multiplier);

  return weiAmount.toString();
}
```

**Technical Decisions:**
1. **Inline handlers** - Keep all logic in app.js (no external modules)
2. **Data attributes** - Store tokenId and TBA address in form dataset
3. **Immediate refresh** - Re-fetch and re-render after minting
4. **Defensive coding** - Check for null/undefined before rendering
5. **Consistent styling** - Follow existing form-panel patterns

---

## Agent Team D: Solar System Expert Proposal

### Resource Quantities & Game Design

**Realistic Cargo Amounts:**

Based on solar sailing physics and realistic ship designs:

| Resource | Typical Amount | Use Case | Rationale |
|----------|----------------|----------|-----------|
| **H2O** | 1,000 - 10,000 kg | Life support, radiation shielding | Water is dense (1000 kg/m³), multi-purpose |
| **O2** | 100 - 1,000 kg | Life support, chemical propulsion oxidizer | Critical but consumed slowly |
| **CH4** | 500 - 5,000 kg | Fuel for chemical rockets (ISRU) | Methane is less dense (424 kg/m³), but high energy |
| **CO2** | 50 - 500 kg | Greenhouse feedstock, ISRU | Waste product or raw material |
| **N2** | 100 - 1,000 kg | Pressurization, inert atmosphere | Nitrogen is less dense but essential for habitats |

**Resource Density Reference:**
- H2O: 1000 kg/m³
- CH4 (liquid): 424 kg/m³ @ 111 K
- O2 (liquid): 1141 kg/m³ @ 90 K
- CO2 (solid, dry ice): 1560 kg/m³ @ 195 K
- N2 (liquid): 808 kg/m³ @ 77 K

**Suggested UI Presets:**
```javascript
const RESOURCE_PRESETS = {
  CH4: [100, 500, 1000, 5000],
  O2: [100, 500, 1000],
  H2O: [1000, 5000, 10000],
  CO2: [50, 100, 500],
  N2: [100, 500, 1000]
};
```

**Future Game Mechanics (Context for Users):**

1. **Life Support Consumption**
   - O2: ~0.84 kg/day per crew member
   - H2O: ~4 kg/day per crew member (drinking + hygiene)
   - N2: Minimal consumption (pressurization losses only)

2. **ISRU (In-Situ Resource Utilization)**
   - Mars: CO2 → CH4 + O2 (Sabatier reaction)
   - Europa: H2O ice → H2O liquid → O2 + H2
   - Titan: CH4/N2 atmosphere harvesting

3. **Propulsion**
   - Solar sail: No fuel required (primary mode)
   - Chemical backup: CH4 + O2 → thrust (emergency maneuvers)

4. **Trade & Economy**
   - Rare resources worth more at distant locations
   - Inner planets: H2O scarce, high value
   - Outer moons: CH4/N2 abundant, low value

**UI Suggestions:**
1. Add "Suggested Amount" helper text per resource
2. Show cargo capacity utilization (e.g., "500 / 1,000,000 units used")
3. Color-code resources by type:
   - CH4: Orange (fuel)
   - O2: Light blue (life support)
   - H2O: Blue (life support)
   - CO2: Red (industrial)
   - N2: Gray (industrial)

---

## Synthesis: Recommended Approach

### Combined Best Practices

**Feature 1: Add Resources to Ships**
✅ **Adopt:**
- UX Team's inline form approach (keeps user in context)
- Frontend Team's implementation structure (data attributes, immediate refresh)
- Backend Team's validation strategy (pre-flight checks, user-friendly errors)
- Solar Team's suggested amounts (show typical ranges)

**Feature 2: Resources Page**
✅ **Adopt:**
- UX Team's 3-panel layout (overview, mint, balance checker)
- Frontend Team's component structure (modular functions)
- Backend Team's error handling (translate blockchain errors)
- Solar Team's color-coding suggestion (visual hierarchy)

### Tradeoffs & Decisions

| Decision | Option A | Option B | Choice | Rationale |
|----------|----------|----------|--------|-----------|
| **Amount presets** | Dropdown with presets | Manual input only | **Manual + helper text** | Flexibility without clutter |
| **Copy buttons** | On every address | Tooltip on hover | **Tooltip on hover** | Cleaner UI, less visual noise |
| **Refresh strategy** | Full page reload | Selective update | **Selective update** | Better UX, faster response |
| **Wei conversion** | Show both units + wei | Show units only | **Units only** | Less confusing for users |
| **TBA in Resources page** | Pre-fill if ship inspected | Manual entry only | **Manual entry** | Simpler implementation |

---

## Comparison Matrix

| Aspect | UX Designer | Backend Architect | Frontend Developer | Solar Expert |
|--------|-------------|-------------------|-------------------|--------------|
| **Focus** | User workflow | Data integrity | Code structure | Realism |
| **Strength** | Clear mockups | Error handling | Implementation details | Domain knowledge |
| **Priority** | Ease of use | Reliability | Maintainability | Accuracy |
| **Key Insight** | Inline forms keep context | Pre-flight validation critical | Modular functions | Resource quantities matter |

---

## Final Recommendation

**Implementation Strategy:**
1. Start with Frontend Team's code structure (functions, event handlers)
2. Apply UX Team's layout and visual design
3. Integrate Backend Team's validation and error handling
4. Add Solar Team's helper text and context

**Unit of Work Breakdown:**
1. **Unit 1:** Add `convertToWei()` utility function
2. **Unit 2:** Enhance `displayShipDetails()` with "Add Resources" form
3. **Unit 3:** Implement `setupAddResourcesForm()` handler
4. **Unit 4:** Implement full `loadResourcesUI()` function
5. **Unit 5:** Implement `setupResourceForms()` handlers
6. **Unit 6:** Implement `displayBalances()` function
7. **Unit 7:** Integration testing and polish

**Next Step:** Review Phase (7 perspectives)

---

**Document Status:** ✅ Brainstorming Complete
**Next Document:** `PHASE3_IMPLEMENTATION_PLAN.md` (after review)
