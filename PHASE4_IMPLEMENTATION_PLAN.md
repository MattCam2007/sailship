# Phase 4: Celestial Bodies UI - Implementation Plan

**Date:** 2026-02-12
**Status:** Draft - Pending Review
**Lead Coordinator:** Claude Sonnet 4.5

---

## Executive Summary

Transform the Celestial Bodies page from a 10-line placeholder into a complete resource management UI. This phase enables admins to create celestial bodies, configure emission profiles, and harvest resources to ship TBAs.

**Scope:** Frontend-only changes to `/Users/mattcameron/Projects/sailship/backoffice/public/app.js`

**Estimated Time:** 10-12 hours development + 2-3 hours testing = 12-15 hours total

---

## 0. File Impact Summary

### Files to EDIT

| File | Current Lines | New Lines | Change |
|------|--------------|-----------|--------|
| `/Users/mattcameron/Projects/sailship/backoffice/public/app.js` | Lines 983-992 (10 lines) | ~480 lines | Replace `loadCelestialBodiesUI()` |

### Files to CREATE

**None** - All changes within existing `app.js`

### Files to DELETE

**None**

---

## 1. Problem Statement

### 1.1 Description

The Celestial Bodies page is currently a placeholder stub. Admins cannot manage celestial bodies through the UI, forcing them to use API tools directly (Postman, curl). This is inefficient and error-prone.

**Current State:**
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

**Required State:**
- List all registered celestial bodies
- Create new bodies (name + type)
- Add resources to emission profiles
- Harvest resources from bodies to ships
- Display emission rates in human-readable format

### 1.2 Root Cause

Phase 1 (blockchain contracts) and backend API were completed first. Frontend UI was deferred to Phase 4.

### 1.3 Constraints

- ✅ **Frontend-Only:** No backend or smart contract changes allowed
- ✅ **Vanilla JavaScript:** No build tools, no npm dependencies
- ✅ **Emission Profile Gap:** Backend doesn't expose emission profiles in GET requests
  - **Solution:** Track emission profiles in client-side state (Map)
  - **Tradeoff:** Page refresh clears emission data (acceptable for admin tool)
- ✅ **Existing Patterns:** Follow form-panel, data-grid, data-card styling from Phase 2/3

---

## 2. Solution Architecture

### 2.1 High-Level Design

**Component Structure:**
```
loadCelestialBodiesUI() [Main Controller]
├── Fetch data (bodies, ships)
├── renderCelestialBodiesPage()
│   ├── renderCreateBodySection()
│   ├── renderBodiesGrid()
│   │   └── renderBodyCard() (for each body)
│   ├── renderAddEmissionSection()
│   └── renderHarvestSection()
└── setupCelestialBodiesEventHandlers()
    ├── handleCreateBody()
    ├── handleAddEmission()
    └── handleHarvest()
```

**State Management:**
```javascript
// Global state for emission profiles (survives within session)
const emissionProfiles = new Map();
// Key: bodyName, Value: { emissions: [{ resourceSymbol, ratePerSecond }] }
```

**Data Flow:**
```
User Input → Validation → API Call → Backend → Blockchain
                                          ↓
                                    Response
                                          ↓
              Client State Update ← Parse Result
                        ↓
                   Refresh UI
                        ↓
                 Success Toast
```

### 2.2 Design Principles

1. **Separation of Concerns:** Render functions are pure (no side effects)
2. **Defensive Coding:** Validate before API calls, try-catch all async operations
3. **User Feedback:** Loading overlays, success toasts, error messages
4. **Code Reuse:** Use existing utilities (`formatAddress`, `parseResourceAmount`, etc.)
5. **Maintainability:** Clear function names, JSDoc comments, modular structure

### 2.3 UI Layout (Wireframe)

```
┌─────────────────────────────────────────────────────────────┐
│ CELESTIAL BODIES                                            │
│ Manage celestial bodies as resource faucets...              │
│                                                              │
│ CREATE CELESTIAL BODY                                       │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Name: [TITAN    ]  Type: [moon ▼]                   │   │
│ │ [🌍 CREATE BODY]                                     │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ REGISTERED BODIES (4)                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ TITAN    │ │ EUROPA   │ │ MARS     │ │ VENUS    │       │
│ │ 🌙 moon  │ │ 🌙 moon  │ │ 🌍 planet│ │ 🌍 planet│       │
│ │ 0xABC... │ │ 0xDEF... │ │ 0xGHI... │ │ 0xJKL... │       │
│ │──────────│ │──────────│ │──────────│ │──────────│       │
│ │EMISSIONS │ │EMISSIONS │ │EMISSIONS │ │EMISSIONS │       │
│ │CH4       │ │H2O       │ │CO2       │ │CO2       │       │
│ │ 86.4kg/d │ │ 43.2kg/d │ │ 21.6kg/d │ │100.0kg/d │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│ ADD RESOURCE TO EMISSION PROFILE                            │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Body: [TITAN ▼]  Resource: [CH4 ▼]                  │   │
│ │ Rate (kg/second): [1.0    ]                          │   │
│ │ [⚗️ ADD RESOURCE]                                     │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                              │
│ HARVEST RESOURCES TO SHIP                                   │
│ ┌──────────────────────────────────────────────────────┐   │
│ │ Body: [TITAN ▼]  Ship: [#1 HELIOS ▼]                │   │
│ │ Resource: [CH4 ▼]  Amount (kg): [100    ]           │   │
│ │ [⛽ HARVEST TO SHIP]                                  │   │
│ └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.4 Key Algorithms

**Emission Rate Formatting:**
```javascript
// Convert wei/second to human-readable kg/day
function formatEmissionRate(ratePerSecond) {
  const kgPerSecond = parseFloat(ratePerSecond) / 1e18;
  const kgPerDay = kgPerSecond * 86400;

  if (kgPerDay < 0.01) {
    return `${(kgPerDay * 1000).toFixed(2)} g/day`;
  } else if (kgPerDay >= 1000) {
    return `${(kgPerDay / 1000).toFixed(2)} tons/day`;
  } else {
    return `${kgPerDay.toFixed(2)} kg/day`;
  }
}
```

**Emission Profile State Management:**
```javascript
const emissionProfiles = new Map();

function addEmissionToState(bodyName, resourceSymbol, ratePerSecond) {
  if (!emissionProfiles.has(bodyName)) {
    emissionProfiles.set(bodyName, { emissions: [] });
  }
  emissionProfiles.get(bodyName).emissions.push({
    resourceSymbol,
    ratePerSecond,
    isActive: true
  });
}

function getEmissions(bodyName) {
  return emissionProfiles.get(bodyName)?.emissions || [];
}
```

---

## 3. Units of Work

### Unit 1: API Wrappers and Constants

**Description:** Add missing API wrapper functions to interact with celestial bodies endpoints.

**Files:** `app.js`

**Changes:**
```javascript
// Add after existing API functions (~line 84)

/**
 * Create a new celestial body
 * @param {Object} params - { name: string, bodyType: string }
 * @returns {Promise<Object>} Created body details
 */
async function createCelestialBody(params) {
  return fetchAPI(`${API_BASE}/celestial-bodies/create`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

/**
 * Get celestial body details by name
 * @param {string} name - Body name
 * @returns {Promise<Object>} Body details
 */
async function getCelestialBody(name) {
  return fetchAPI(`${API_BASE}/celestial-bodies/${name}`);
}

/**
 * Add resource to celestial body emission profile
 * @param {string} name - Body name
 * @param {string} resourceSymbol - Resource symbol (CH4, O2, H2O, CO2, N2)
 * @param {string} ratePerSecond - Rate in wei per second
 * @returns {Promise<Object>} Transaction result
 */
async function addResourceToBody(name, resourceSymbol, ratePerSecond) {
  return fetchAPI(`${API_BASE}/celestial-bodies/${name}/add-resource`, {
    method: 'POST',
    body: JSON.stringify({ resourceSymbol, ratePerSecond })
  });
}

/**
 * Harvest resources from celestial body to ship TBA
 * @param {string} name - Body name
 * @param {string} shipTokenId - Ship token ID
 * @param {string} resourceSymbol - Resource symbol
 * @param {string} amount - Amount in wei
 * @returns {Promise<Object>} Transaction result
 */
async function harvestFromBody(name, shipTokenId, resourceSymbol, amount) {
  return fetchAPI(`${API_BASE}/celestial-bodies/${name}/harvest`, {
    method: 'POST',
    body: JSON.stringify({ shipTokenId, resourceSymbol, amount })
  });
}
```

**Acceptance Criteria:**
- [ ] All 4 API wrapper functions added
- [ ] JSDoc comments complete
- [ ] Functions use existing `fetchAPI()` pattern
- [ ] No console errors when calling functions

**Test Method:** Console test
```javascript
// Should succeed (if body exists)
await createCelestialBody({ name: 'TEST-BODY', bodyType: 'moon' });

// Should return body details
await getCelestialBody('TEST-BODY');
```

**Estimated Time:** 30 minutes

---

### Unit 2: Helper Functions and State Management

**Description:** Add utility functions for formatting emission rates, validating inputs, and managing emission profile state.

**Files:** `app.js`

**Changes:**
```javascript
// Add after existing utility functions (~line 146)

/**
 * Format emission rate for display
 * @param {string} ratePerSecond - Rate in wei per second
 * @returns {string} Human-readable rate (kg/day, g/day, or tons/day)
 */
function formatEmissionRate(ratePerSecond) {
  const kgPerSecond = parseFloat(ratePerSecond) / 1e18;
  const kgPerDay = kgPerSecond * 86400;

  if (kgPerDay < 0.01) {
    return `${(kgPerDay * 1000).toFixed(2)} g/day`;
  } else if (kgPerDay >= 1000) {
    return `${(kgPerDay / 1000).toFixed(2)} tons/day`;
  } else {
    return `${kgPerDay.toFixed(2)} kg/day`;
  }
}

/**
 * Validate celestial body creation parameters
 * @param {string} name - Body name
 * @param {string} bodyType - Body type
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validateBodyCreation(name, bodyType) {
  const errors = [];

  if (!name || name.trim().length === 0) {
    errors.push('Body name is required');
  }

  if (name.length > 50) {
    errors.push('Body name must be 50 characters or less');
  }

  if (!/^[A-Z0-9-]+$/.test(name)) {
    errors.push('Body name must be uppercase letters, numbers, and hyphens only');
  }

  const validTypes = ['planet', 'moon', 'asteroid', 'dwarf-planet'];
  if (!validTypes.includes(bodyType)) {
    errors.push('Invalid body type');
  }

  return errors;
}

/**
 * Validate emission rate
 * @param {string|number} rate - Rate in kg/second
 * @returns {string[]} Array of error messages (empty if valid)
 */
function validateEmissionRate(rate) {
  const errors = [];
  const rateNum = parseFloat(rate);

  if (isNaN(rateNum) || rateNum <= 0) {
    errors.push('Emission rate must be greater than 0');
  }

  if (rateNum > 1000) {
    errors.push('Emission rate must be 1000 kg/s or less');
  }

  return errors;
}

// Global state for emission profiles
const emissionProfiles = new Map();

/**
 * Add emission to client-side state
 * @param {string} bodyName - Body name
 * @param {string} resourceSymbol - Resource symbol
 * @param {string} ratePerSecond - Rate in wei per second
 */
function addEmissionToState(bodyName, resourceSymbol, ratePerSecond) {
  if (!emissionProfiles.has(bodyName)) {
    emissionProfiles.set(bodyName, { emissions: [] });
  }
  emissionProfiles.get(bodyName).emissions.push({
    resourceSymbol,
    ratePerSecond,
    isActive: true
  });
}

/**
 * Get emissions for a celestial body
 * @param {string} bodyName - Body name
 * @returns {Array} Emission profiles
 */
function getEmissions(bodyName) {
  return emissionProfiles.get(bodyName)?.emissions || [];
}
```

**Acceptance Criteria:**
- [ ] `formatEmissionRate()` correctly formats rates (g/day, kg/day, tons/day)
- [ ] `validateBodyCreation()` rejects invalid names (lowercase, special chars, too long)
- [ ] `validateEmissionRate()` rejects negative and excessive rates
- [ ] `emissionProfiles` Map works correctly (add/get)
- [ ] No console errors

**Test Method:** Console test
```javascript
// Should return "86.40 kg/day"
formatEmissionRate('1000000000000000000'); // 1 kg/s in wei

// Should return ["Body name must be uppercase..."]
validateBodyCreation('titan', 'moon');

// Should return []
validateBodyCreation('TITAN', 'moon');

// Should return ["Emission rate must be greater than 0"]
validateEmissionRate(-5);

// Should work
addEmissionToState('TITAN', 'CH4', '1000000000000000000');
getEmissions('TITAN'); // [{ resourceSymbol: 'CH4', ratePerSecond: '...', isActive: true }]
```

**Estimated Time:** 1 hour

---

### Unit 3: Render Functions (Part 1: Create Body & Bodies Grid)

**Description:** Implement render functions for the Create Body form and Bodies Grid sections.

**Files:** `app.js`

**Changes:**
```javascript
// Add after helper functions

/**
 * Render create body form section
 * @returns {string} HTML for create body form
 */
function renderCreateBodySection() {
  return `
    <div class="form-panel">
      <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
        CREATE CELESTIAL BODY
      </h2>
      <form id="createBodyForm">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Name</label>
            <input type="text" class="form-input" name="name"
                   placeholder="TITAN" pattern="[A-Z0-9-]+" maxlength="50"
                   style="text-transform: uppercase;" required>
            <small class="form-help">Uppercase letters, numbers, hyphens only</small>
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-input" name="bodyType" required>
              <option value="">-- Select Type --</option>
              <option value="planet">Planet</option>
              <option value="moon">Moon</option>
              <option value="asteroid">Asteroid</option>
              <option value="dwarf-planet">Dwarf Planet</option>
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">
          🌍 CREATE BODY
        </button>
      </form>
    </div>
  `;
}

/**
 * Render individual body card
 * @param {Object} body - Body object { name, bodyType, address }
 * @returns {string} HTML for body card
 */
function renderBodyCard(body) {
  const emissions = getEmissions(body.name);
  const emissionsHTML = emissions.length > 0
    ? emissions.map(e => `
        <div style="font-size: 11px; margin-top: 4px; font-family: 'Courier New', monospace;">
          ${e.resourceSymbol}: ${formatEmissionRate(e.ratePerSecond)}
        </div>
      `).join('')
    : '<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">No emissions configured</div>';

  const typeEmoji = body.bodyType === 'moon' ? '🌙' :
                    body.bodyType === 'planet' ? '🌍' :
                    body.bodyType === 'asteroid' ? '☄️' : '🪐';

  return `
    <div class="data-card">
      <div class="data-card-title">${body.name}</div>
      <div class="data-card-value">${typeEmoji} ${body.bodyType}</div>
      <div class="data-card-meta mono" style="font-size: 10px;">${formatAddress(body.address)}</div>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
        <div style="font-size: 10px; font-weight: 600; color: var(--accent-teal); margin-bottom: 4px;">EMISSIONS</div>
        ${emissionsHTML}
      </div>
    </div>
  `;
}

/**
 * Render bodies grid section
 * @param {Array} bodies - Array of body objects
 * @returns {string} HTML for bodies grid
 */
function renderBodiesGrid(bodies) {
  if (bodies.length === 0) {
    return `
      <div class="form-panel" style="text-align: center; padding: 40px;">
        <p style="color: var(--text-muted); margin-bottom: 20px;">
          No celestial bodies registered yet. Create your first body above.
        </p>
      </div>
    `;
  }

  const bodyCards = bodies.map(body => renderBodyCard(body)).join('');

  return `
    <div class="form-panel">
      <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
        REGISTERED BODIES (${bodies.length})
      </h2>
      <div class="data-grid">
        ${bodyCards}
      </div>
    </div>
  `;
}
```

**Acceptance Criteria:**
- [ ] Create Body form renders with name input and type dropdown
- [ ] Name input enforces uppercase pattern
- [ ] Empty state shows when no bodies exist
- [ ] Body cards display name, type, address, and emissions
- [ ] Emissions display in kg/day format
- [ ] Cards use data-card styling

**Test Method:** Manual (render in browser)
```javascript
// Test empty state
renderBodiesGrid([]);

// Test with bodies
renderBodiesGrid([
  { name: 'TITAN', bodyType: 'moon', address: '0xABC...123' }
]);
```

**Estimated Time:** 1.5 hours

---

### Unit 4: Render Functions (Part 2: Add Emission & Harvest Forms)

**Description:** Implement render functions for Add Emission and Harvest sections.

**Files:** `app.js`

**Changes:**
```javascript
/**
 * Render add emission section
 * @param {Array} bodies - Array of body objects
 * @returns {string} HTML for add emission form
 */
function renderAddEmissionSection(bodies) {
  const bodyOptions = bodies.map(b =>
    `<option value="${b.name}">${b.name} (${b.bodyType})</option>`
  ).join('');

  const resourceOptions = RESOURCE_METADATA.map(r =>
    `<option value="${r.symbol}">${r.symbol} (${r.name})</option>`
  ).join('');

  return `
    <div class="form-panel">
      <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
        ADD RESOURCE TO EMISSION PROFILE
      </h2>
      <form id="addEmissionForm">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Celestial Body</label>
            <select class="form-input" name="bodyName" required>
              <option value="">-- Select Body --</option>
              ${bodyOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Resource</label>
            <select class="form-input" name="resourceSymbol" required>
              <option value="">-- Select Resource --</option>
              ${resourceOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Rate (kg/second)</label>
            <input type="number" class="form-input" name="rate"
                   placeholder="1.0" min="0.0001" max="1000" step="0.0001" required>
            <small class="form-help">1.0 kg/s = 86,400 kg/day</small>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">
          ⚗️ ADD RESOURCE
        </button>
      </form>
    </div>
  `;
}

/**
 * Render harvest section
 * @param {Array} bodies - Array of body objects
 * @param {Array} ships - Array of ship objects
 * @returns {string} HTML for harvest form
 */
function renderHarvestSection(bodies, ships) {
  const bodyOptions = bodies.map(b =>
    `<option value="${b.name}">${b.name}</option>`
  ).join('');

  const shipOptions = ships.map(s =>
    `<option value="${s.tokenId}">Ship #${s.tokenId} - ${s.metadata.shipClass || 'Unknown'}</option>`
  ).join('');

  const resourceOptions = RESOURCE_METADATA.map(r =>
    `<option value="${r.symbol}">${r.symbol} (${r.name})</option>`
  ).join('');

  return `
    <div class="form-panel">
      <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
        HARVEST RESOURCES TO SHIP
      </h2>
      <form id="harvestForm">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Celestial Body</label>
            <select class="form-input" name="bodyName" required>
              <option value="">-- Select Body --</option>
              ${bodyOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Ship</label>
            <select class="form-input" name="shipTokenId" required>
              <option value="">-- Select Ship --</option>
              ${shipOptions}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Resource</label>
            <select class="form-input" name="resourceSymbol" required>
              <option value="">-- Select Resource --</option>
              ${resourceOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Amount (kg)</label>
            <input type="number" class="form-input" name="amount"
                   placeholder="100" min="${MIN_RESOURCE_AMOUNT}" step="0.0001" required>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">
          ⛽ HARVEST TO SHIP
        </button>
      </form>
    </div>
  `;
}

/**
 * Render full celestial bodies page
 * @param {HTMLElement} container - Container element
 * @param {Array} bodies - Array of body objects
 * @param {Array} ships - Array of ship objects
 */
function renderCelestialBodiesPage(container, bodies, ships) {
  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">CELESTIAL BODIES</h1>
      <p class="section-description">
        Manage celestial bodies as resource faucets. Create bodies, configure emission profiles, and harvest resources to ships.
      </p>

      ${renderCreateBodySection()}
      ${renderBodiesGrid(bodies)}
      ${renderAddEmissionSection(bodies)}
      ${renderHarvestSection(bodies, ships)}
    </div>
  `;
}
```

**Acceptance Criteria:**
- [ ] Add Emission form renders with body dropdown, resource dropdown, rate input
- [ ] Harvest form renders with body dropdown, ship dropdown, resource dropdown, amount input
- [ ] Dropdowns populate from bodies and ships arrays
- [ ] Helper text shows "1.0 kg/s = 86,400 kg/day"
- [ ] Full page renders all 4 sections in order

**Test Method:** Manual (render in browser)
```javascript
renderAddEmissionSection([{ name: 'TITAN', bodyType: 'moon' }]);
renderHarvestSection(
  [{ name: 'TITAN', bodyType: 'moon' }],
  [{ tokenId: '1', metadata: { shipClass: 'HELIOS-CLASS' } }]
);
```

**Estimated Time:** 1.5 hours

---

### Unit 5: Event Handlers

**Description:** Implement event handlers for Create Body, Add Emission, and Harvest forms.

**Files:** `app.js`

**Changes:**
```javascript
/**
 * Handle create body form submission
 * @param {Event} e - Form submit event
 */
async function handleCreateBody(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const name = formData.get('name').toUpperCase().trim();
  const bodyType = formData.get('bodyType');

  // Validate
  const errors = validateBodyCreation(name, bodyType);
  if (errors.length > 0) {
    showToast(errors.join('; '), 'error', 'VALIDATION ERROR');
    return;
  }

  setLoading(true, 'Creating celestial body...');

  try {
    const result = await createCelestialBody({ name, bodyType });
    showToast(`Created ${name}`, 'success', 'BODY CREATED');

    // Refresh UI
    const container = document.getElementById('content');
    await loadCelestialBodiesUI(container);

  } catch (error) {
    console.error('Create body error:', error);

    let message = error.message;
    if (message.includes('already exists')) {
      message = `Body "${name}" already exists. Choose a different name.`;
    } else if (message.includes('gas')) {
      message = 'Transaction failed: insufficient gas or gas price too low';
    } else if (message.includes('revert')) {
      message = 'Transaction reverted: check admin wallet permissions';
    }

    showToast(message, 'error', 'CREATE FAILED');
  } finally {
    setLoading(false);
  }
}

/**
 * Handle add emission form submission
 * @param {Event} e - Form submit event
 */
async function handleAddEmission(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const bodyName = formData.get('bodyName');
  const resourceSymbol = formData.get('resourceSymbol');
  const rate = formData.get('rate');

  // Validate
  const errors = validateEmissionRate(rate);
  if (errors.length > 0) {
    showToast(errors.join('; '), 'error', 'VALIDATION ERROR');
    return;
  }

  // Convert rate to wei
  const ratePerSecond = parseResourceAmount(rate);

  setLoading(true, 'Adding resource to emission profile...');

  try {
    await addResourceToBody(bodyName, resourceSymbol, ratePerSecond);

    // Update client state
    addEmissionToState(bodyName, resourceSymbol, ratePerSecond);

    showToast(
      `Added ${resourceSymbol} to ${bodyName} (${formatEmissionRate(ratePerSecond)})`,
      'success',
      'EMISSION ADDED'
    );

    // Refresh UI
    const container = document.getElementById('content');
    await loadCelestialBodiesUI(container);

  } catch (error) {
    console.error('Add emission error:', error);

    let message = error.message;
    if (message.includes('not found')) {
      message = `Celestial body "${bodyName}" not found.`;
    } else if (message.includes('already exists') || message.includes('Resource already')) {
      message = `${resourceSymbol} is already in ${bodyName}'s emission profile.`;
    } else if (message.includes('gas')) {
      message = 'Transaction failed: insufficient gas or gas price too low';
    } else if (message.includes('revert')) {
      message = 'Transaction reverted: check admin wallet permissions';
    }

    showToast(message, 'error', 'ADD FAILED');
  } finally {
    setLoading(false);
  }
}

/**
 * Handle harvest form submission
 * @param {Event} e - Form submit event
 */
async function handleHarvest(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const bodyName = formData.get('bodyName');
  const shipTokenId = formData.get('shipTokenId');
  const resourceSymbol = formData.get('resourceSymbol');
  const amount = formData.get('amount');

  // Validate amount
  if (!amount || parseFloat(amount) <= 0) {
    showToast('Amount must be greater than 0', 'error', 'VALIDATION ERROR');
    return;
  }

  // Convert to wei
  const weiAmount = parseResourceAmount(amount);

  setLoading(true, 'Harvesting resources...');

  try {
    await harvestFromBody(bodyName, shipTokenId, resourceSymbol, weiAmount);

    showToast(
      `Harvested ${amount} kg ${resourceSymbol} from ${bodyName} to Ship #${shipTokenId}`,
      'success',
      'HARVEST COMPLETE'
    );

    // Reset form
    e.target.reset();

  } catch (error) {
    console.error('Harvest error:', error);

    let message = error.message;
    if (message.includes('not found')) {
      message = `Celestial body "${bodyName}" not found.`;
    } else if (message.includes('not active') || message.includes('Resource not')) {
      message = `${resourceSymbol} is not available on ${bodyName}.`;
    } else if (message.includes('gas')) {
      message = 'Transaction failed: insufficient gas or gas price too low';
    } else if (message.includes('revert')) {
      message = 'Transaction reverted: check admin wallet permissions and body balance';
    }

    showToast(message, 'error', 'HARVEST FAILED');
  } finally {
    setLoading(false);
  }
}

/**
 * Setup event handlers for celestial bodies page
 */
function setupCelestialBodiesEventHandlers() {
  const createForm = document.getElementById('createBodyForm');
  if (createForm) {
    createForm.addEventListener('submit', handleCreateBody);
  }

  const emissionForm = document.getElementById('addEmissionForm');
  if (emissionForm) {
    emissionForm.addEventListener('submit', handleAddEmission);
  }

  const harvestForm = document.getElementById('harvestForm');
  if (harvestForm) {
    harvestForm.addEventListener('submit', handleHarvest);
  }
}
```

**Acceptance Criteria:**
- [ ] Create body form validates and submits
- [ ] Success creates body and refreshes UI
- [ ] Duplicate name shows user-friendly error
- [ ] Add emission form validates rate
- [ ] Success adds emission to state and refreshes UI
- [ ] Harvest form validates amount
- [ ] Success harvests resources to ship
- [ ] All errors show user-friendly messages
- [ ] Loading overlays appear during transactions

**Test Method:** Manual (submit forms in browser)
- Create body with valid name → Success
- Create body with duplicate name → Error "already exists"
- Add emission with valid rate → Success, card updates
- Harvest 100 kg CH4 to Ship #1 → Success

**Estimated Time:** 2 hours

---

### Unit 6: Main Controller Function

**Description:** Replace the placeholder `loadCelestialBodiesUI()` function with full implementation.

**Files:** `app.js`

**Changes:**
```javascript
// REPLACE lines 983-992 with:

/**
 * Load Celestial Bodies UI
 * Entry point for the Celestial Bodies page
 * @param {HTMLElement} container - Container element
 */
async function loadCelestialBodiesUI(container) {
  setLoading(true, 'Loading celestial bodies...');

  try {
    const [bodies, ships] = await Promise.all([
      listCelestialBodies(),
      listShips()
    ]);

    renderCelestialBodiesPage(container, bodies, ships);
    setupCelestialBodiesEventHandlers();

  } catch (error) {
    console.error('Load celestial bodies error:', error);

    let message = error.message;
    if (message.includes('503') || message.includes('not deployed')) {
      message = 'CelestialBodyRegistry contract not deployed yet. Deploy contracts first.';
    }

    showToast(message, 'error', 'LOAD FAILED');
    container.innerHTML = `
      <div class="content-section">
        <h1 class="section-title">CELESTIAL BODIES</h1>
        <div class="form-panel" style="text-align: center; padding: 40px;">
          <p style="color: var(--error); margin-bottom: 20px;">
            Failed to load celestial bodies: ${message}
          </p>
          <button class="btn btn-secondary" onclick="location.reload()">
            🔄 RETRY
          </button>
        </div>
      </div>
    `;
  } finally {
    setLoading(false);
  }
}
```

**Acceptance Criteria:**
- [ ] Function fetches bodies and ships in parallel
- [ ] Renders full page with all sections
- [ ] Sets up event handlers
- [ ] Shows loading overlay during fetch
- [ ] Handles errors gracefully (contract not deployed, network errors)
- [ ] Error state includes retry button

**Test Method:** Manual (navigate to Celestial Bodies tab)
- Tab loads successfully
- All 4 sections visible
- Forms are interactive
- No console errors

**Estimated Time:** 30 minutes

---

### Unit 7: Polish and Edge Cases

**Description:** Add final touches, edge case handling, and user experience improvements.

**Files:** `app.js`

**Changes:**
- Add empty state handling (no bodies, no ships)
- Improve error messages
- Add form reset after successful submission
- Add loading states to buttons
- Test all edge cases

**Specific Enhancements:**

1. **No Ships Available:**
```javascript
function renderHarvestSection(bodies, ships) {
  if (ships.length === 0) {
    return `
      <div class="form-panel">
        <h2>HARVEST RESOURCES TO SHIP</h2>
        <p style="color: var(--text-muted); text-align: center; padding: 20px;">
          No ships available. Create ships in the SHIPS tab first.
        </p>
      </div>
    `;
  }
  // ... rest of function
}
```

2. **Form Reset After Success:**
```javascript
// In handleCreateBody:
e.target.reset(); // Reset form after successful creation
```

3. **Button Loading States:**
```javascript
// Add disabled state during submission
button.disabled = true;
button.textContent = 'CREATING...';
// ... API call
button.disabled = false;
button.textContent = '🌍 CREATE BODY';
```

**Acceptance Criteria:**
- [ ] Empty state for no ships shows helpful message
- [ ] Forms reset after successful submission
- [ ] All edge cases handled (no bodies, no ships, no emissions)
- [ ] Error messages are clear and actionable
- [ ] UI feels polished and complete

**Test Method:** Manual testing
- Load page with no bodies → Empty state
- Load page with no ships → Harvest section disabled
- Submit forms multiple times → Forms reset
- Test all error scenarios

**Estimated Time:** 1.5 hours

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Emission profile data not persisting | High | Medium | Use client-side Map (Option C) - acceptable for admin tool |
| Duplicate body names | Low | Low | Backend validates uniqueness, show clear error |
| Harvest to non-existent ship | Medium | Low | Validate ship exists in dropdown |
| Large emission rates cause overflow | Low | Low | Validate max 1000 kg/s, use string-based wei conversion |
| Page refresh loses emission data | High | Low | Document behavior, consider adding backend endpoint in Phase 5 |
| No ships available for harvest | Medium | Medium | Show empty state with helpful message |
| Contract not deployed | Low | High | Show clear error with retry button |

**Overall Risk:** **LOW** - Main limitation is emission profile data loss on refresh (documented tradeoff).

---

## 5. Testing Strategy

### 5.1 Unit Tests (Console)

After Unit 1 & 2:
```javascript
// Test API wrappers
await createCelestialBody({ name: 'TEST', bodyType: 'moon' });

// Test formatters
formatEmissionRate('1000000000000000000'); // "86.40 kg/day"

// Test validators
validateBodyCreation('TITAN', 'moon'); // []
validateBodyCreation('titan', 'moon'); // ["Body name must be uppercase..."]
```

### 5.2 Integration Tests (Manual)

| Test | Expected Result |
|------|-----------------|
| Navigate to Celestial Bodies tab | Page loads with 4 sections |
| Create body "TITAN" (moon) | Success toast, card appears |
| Create duplicate "TITAN" | Error: "Body already exists" |
| Add CH4 to TITAN (1.0 kg/s) | Success toast, emission shows "86.40 kg/day" |
| Add duplicate CH4 to TITAN | Error: "Resource already exists" |
| Harvest 100 kg CH4 to Ship #1 | Success toast, form resets |
| Submit with empty fields | HTML validation prevents submit |
| Load page with no bodies | Empty state message |
| Load page with no ships | Harvest section shows "No ships available" |

### 5.3 Regression Tests

| Feature | Test |
|---------|------|
| Ships page | Still loads and works |
| Resources page | Still loads and works |
| Deploy page | Still loads and works |
| Ship details | Still shows balances |
| Resource minting | Still works from Ships page |

---

## 6. Success Criteria

### Feature Complete When:

- [ ] Celestial Bodies page loads without errors
- [ ] Can create celestial bodies via form
- [ ] Can add resources to emission profiles
- [ ] Can harvest resources to ship TBAs
- [ ] Body cards display emissions in kg/day format
- [ ] All forms validate inputs before submission
- [ ] All forms provide loading overlays during transactions
- [ ] All forms show success/error toasts
- [ ] Empty states handled gracefully (no bodies, no ships)
- [ ] Error messages are user-friendly and actionable
- [ ] UI matches existing design patterns (Phase 2/3)
- [ ] No regressions to existing pages
- [ ] No console errors or warnings

### Code Quality When:

- [ ] All functions have JSDoc comments
- [ ] All async operations wrapped in try-catch
- [ ] All API calls use existing `fetchAPI()` pattern
- [ ] All validations use helper functions
- [ ] All rendering uses pure functions
- [ ] No code duplication
- [ ] Follows existing naming conventions (camelCase, UPPER_SNAKE)

---

## 7. Timeline

### Day 1: Foundation (4 hours)
- **Morning:** Units 1-2 (API wrappers, helpers)
- **Afternoon:** Unit 3 (Create Body & Bodies Grid)
- **Milestone:** Can create bodies and see cards

### Day 2: Forms (4 hours)
- **Morning:** Unit 4 (Add Emission & Harvest forms)
- **Afternoon:** Unit 5 (Event handlers)
- **Milestone:** All 3 forms working

### Day 3: Integration & Polish (4 hours)
- **Morning:** Unit 6 (Main controller)
- **Afternoon:** Unit 7 (Edge cases, polish)
- **Milestone:** Feature complete

### Day 4: Testing & Verification (3 hours)
- Manual testing
- Regression testing
- Bug fixes
- **Milestone:** Ready for production

**Total:** 15 hours over 4 days

---

## 8. Open Questions

### For User Decision:

1. **Emission Profile Persistence:** Confirm that losing emission data on page refresh is acceptable for an admin tool.
   - ✅ Pros: Frontend-only, no backend changes
   - ❌ Cons: Can't see emissions after refresh
   - Alternative: Add backend endpoint (requires backend work)

2. **Body Type Options:** Confirm body types: planet, moon, asteroid, dwarf-planet
   - Any others needed? (comet, station, etc.)

3. **Default Emission Rates:** Should we suggest default rates?
   - Example: TITAN/CH4 → 1.0 kg/s (86.4 kg/day)
   - Or: Always manual input?

4. **Scientific Tooltips:** Add body descriptions?
   - Example: "TITAN - Saturn's largest moon with methane lakes"
   - Or: Keep UI minimal?

---

## 9. Next Steps

1. ✅ **Planning Complete** (this document)
2. **Run 7-Perspective Review** → Create `PHASE4_REVIEW.md`
3. **Synthesize Final Plan** → Create `PHASE4_FINAL_PLAN.md`
4. **Get User Approval**
5. **Begin Implementation** (Unit 1)

---

## Document Status

✅ **Implementation Plan Complete**
📋 **Ready for Review Phase**

**Confidence Level:** 8/10

**Estimated LOC:** ~480 lines (replaces 10-line placeholder)

---

**Date:** 2026-02-12
**Lead Coordinator:** Claude Sonnet 4.5
