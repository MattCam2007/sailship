# Phase 4: Celestial Bodies UI - Agent Proposals

**Date:** 2026-02-12
**Status:** Brainstorming Complete
**Lead Coordinator:** Claude Sonnet 4.5

---

## Overview

This document contains proposals from 4 specialized agents who analyzed the Phase 4 requirements independently. Each agent brings unique expertise to the problem of building a Celestial Bodies resource management UI.

---

## Agent 1: UX Designer

**Agent ID:** `ux-designer-01`
**Focus:** User experience, visual design, interaction patterns

### Proposal: Progressive Disclosure with Card-Based Navigation

**Philosophy:** Celestial body management is complex - creating bodies, configuring emissions, harvesting resources. The UI should guide users through a logical workflow without overwhelming them.

#### Layout Strategy

**Top-Level View: Body Overview Cards**
```
┌────────────────────────────────────────────────────────────┐
│ CELESTIAL BODIES                                          │
│                                                            │
│ [+ CREATE NEW BODY]                                       │
│                                                            │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│ │ TITAN    │ │ EUROPA   │ │ MARS     │ │ VENUS    │    │
│ │ 🌙 Moon  │ │ 🌙 Moon  │ │ 🌍 Planet│ │ 🌍 Planet│    │
│ │ 0xABC... │ │ 0xDEF... │ │ 0xGHI... │ │ 0xJKL... │    │
│ │────────── │ │────────── │ │────────── │ │────────── │ │
│ │EMISSIONS:│ │EMISSIONS:│ │EMISSIONS:│ │EMISSIONS:│    │
│ │CH4       │ │H2O       │ │CO2       │ │CO2       │    │
│ │  86.4kg/d│ │  43.2kg/d│ │  21.6kg/d│ │  10.8kg/d│    │
│ │          │ │O2        │ │          │ │N2        │    │
│ │          │ │  21.6kg/d│ │          │ │  5.4kg/d │    │
│ │          │ │          │ │          │ │          │    │
│ │[📝 EDIT] │ │[📝 EDIT] │ │[📝 EDIT] │ │[📝 EDIT] │    │
│ │[⛽HARVEST]│ │[⛽HARVEST]│ │[⛽HARVEST]│ │[⛽HARVEST]│    │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘    │
└────────────────────────────────────────────────────────────┘
```

**Click "EDIT" → Expand inline editor:**
```
┌──────────────────────────────────────────┐
│ TITAN (Moon) - 0xABC...123              │
│                                          │
│ EMISSION PROFILE                        │
│ ┌────────────────────────────────────┐  │
│ │ CH4 (Methane)    86.4 kg/day       │  │
│ │ [❌ Remove]                         │  │
│ └────────────────────────────────────┘  │
│                                          │
│ ADD NEW RESOURCE                        │
│ Resource: [CH4 ▼]  Rate: [1.0] kg/s   │
│ [+ ADD RESOURCE]                        │
│                                          │
│ [← BACK]                                │
└──────────────────────────────────────────┘
```

**Click "HARVEST" → Modal dialog:**
```
┌──────────────────────────────────────────┐
│           HARVEST FROM TITAN            │
│                                          │
│ Resource:  [CH4 (Methane) ▼]           │
│ Amount:    [100] kg                     │
│ Ship:      [#1 HELIOS-CLASS ▼]         │
│                                          │
│ Target: 0xShipTBA...456                 │
│                                          │
│ [CANCEL]              [⛽ HARVEST NOW] │
└──────────────────────────────────────────┘
```

#### Visual Hierarchy Recommendations

1. **Color Coding by Body Type:**
   - Moons: Teal accent (`var(--accent-teal)`)
   - Planets: Blue accent
   - Asteroids: Gray accent

2. **Emission Rate Visualization:**
   - Use progress bars showing relative production rates
   - Highest-producing resource has full bar
   - Others scale proportionally

3. **Empty State:**
   ```
   ┌────────────────────────────────────────┐
   │  No celestial bodies registered yet   │
   │                                        │
   │       [🌍 CREATE FIRST BODY]          │
   │                                        │
   │  Bodies are resource faucets that     │
   │  generate CH4, O2, H2O, CO2, and N2.  │
   └────────────────────────────────────────┘
   ```

#### Interaction Patterns

**Pattern 1: Inline Editing**
- Click "EDIT" button → Card expands to show emission editor
- Avoids navigation to separate page
- Maintains context

**Pattern 2: Modal for Actions**
- "HARVEST" opens modal for focused task
- Prevents accidental harvests
- Clear call-to-action

**Pattern 3: Progressive Disclosure**
- Only show "Add Resource" form when editing a body
- Only show "Harvest" when body has emissions configured

#### Accessibility

- Keyboard navigation: Tab through cards, Enter to edit
- Screen reader labels: "TITAN, Moon type, 1 emission profile configured"
- Focus indicators on all interactive elements

#### Mobile Considerations

- Cards stack vertically on narrow screens
- "EDIT" and "HARVEST" buttons expand to full width
- Modal dialogs slide up from bottom on mobile

---

## Agent 2: Backend Integration Specialist

**Agent ID:** `backend-integration-01`
**Focus:** API usage, data flow, error handling

### Proposal: API-First Architecture with Client-Side State Management

**Philosophy:** The backend API is fully implemented. The frontend should leverage it efficiently while handling the emission profile data gap pragmatically.

#### API Integration Strategy

**1. Data Fetching on Page Load**

```javascript
async function loadCelestialBodiesUI(container) {
  setLoading(true, 'Loading celestial bodies...');

  try {
    // Fetch all bodies
    const bodies = await listCelestialBodies();

    // If no bodies, show empty state
    if (bodies.length === 0) {
      renderEmptyState(container);
      return;
    }

    // Fetch ship list for harvest dropdown
    const ships = await listShips();

    // Render UI
    renderBodiesUI(container, bodies, ships);

  } catch (error) {
    showToast('Failed to load celestial bodies', 'error');
    container.innerHTML = `<div class="error-state">Error: ${error.message}</div>`;
  } finally {
    setLoading(false);
  }
}
```

**2. Emission Profile State Management**

Since the backend doesn't expose emission profiles in GET requests, we maintain client-side state:

```javascript
// Global state for emission profiles
const emissionProfiles = new Map(); // key: bodyName, value: { emissions: [...] }

// When adding a resource:
async function addEmissionResource(bodyName, resourceSymbol, ratePerSecond) {
  // Call API
  const result = await fetchAPI(`/api/celestial-bodies/${bodyName}/add-resource`, {
    method: 'POST',
    body: JSON.stringify({ resourceSymbol, ratePerSecond })
  });

  // Update client state
  if (!emissionProfiles.has(bodyName)) {
    emissionProfiles.set(bodyName, { emissions: [] });
  }

  emissionProfiles.get(bodyName).emissions.push({
    resourceSymbol,
    ratePerSecond,
    isActive: true
  });

  return result;
}

// Retrieve emissions for display:
function getEmissions(bodyName) {
  return emissionProfiles.get(bodyName)?.emissions || [];
}
```

**3. Error Handling Strategy**

```javascript
// Centralized error handler
function handleAPIError(error, context) {
  console.error(`${context} error:`, error);

  let message = error.message;
  let title = 'ERROR';

  // Parse common errors
  if (message.includes('not found')) {
    title = 'NOT FOUND';
    message = `${context} not found. It may have been deleted.`;
  } else if (message.includes('already exists')) {
    title = 'DUPLICATE';
    message = 'A body with this name already exists.';
  } else if (message.includes('gas')) {
    title = 'GAS ERROR';
    message = 'Transaction failed: insufficient gas or gas price too low.';
  } else if (message.includes('revert')) {
    title = 'TRANSACTION REVERTED';
    message = 'Check admin wallet permissions and contract state.';
  } else if (message.includes('Invalid')) {
    title = 'VALIDATION ERROR';
  }

  showToast(message, 'error', title);
}
```

**4. Optimistic Updates**

For better UX, update UI immediately and rollback on error:

```javascript
async function createCelestialBody(name, bodyType) {
  // Optimistic: Add to UI immediately
  const tempBody = { name, bodyType, address: '0x...' };
  addBodyToUI(tempBody);

  try {
    const result = await fetchAPI('/api/celestial-bodies/create', {
      method: 'POST',
      body: JSON.stringify({ name, bodyType })
    });

    // Update with real address
    updateBodyInUI(name, result.address);
    showToast(`Created ${name}`, 'success', 'BODY CREATED');

  } catch (error) {
    // Rollback optimistic update
    removeBodyFromUI(name);
    handleAPIError(error, 'Create celestial body');
  }
}
```

#### API Call Wrappers

**Add missing wrappers to app.js:**

```javascript
// Create celestial body
async function createCelestialBody(params) {
  return fetchAPI(`${API_BASE}/celestial-bodies/create`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

// Get body details
async function getCelestialBody(name) {
  return fetchAPI(`${API_BASE}/celestial-bodies/${name}`);
}

// Add resource to emission profile
async function addResourceToBody(name, resourceSymbol, ratePerSecond) {
  return fetchAPI(`${API_BASE}/celestial-bodies/${name}/add-resource`, {
    method: 'POST',
    body: JSON.stringify({ resourceSymbol, ratePerSecond })
  });
}

// Harvest resources
async function harvestFromBody(name, shipTokenId, resourceSymbol, amount) {
  return fetchAPI(`${API_BASE}/celestial-bodies/${name}/harvest`, {
    method: 'POST',
    body: JSON.stringify({ shipTokenId, resourceSymbol, amount })
  });
}
```

#### Data Validation

**Pre-flight validation before API calls:**

```javascript
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

function validateEmissionRate(ratePerSecond) {
  const rate = parseFloat(ratePerSecond);

  if (isNaN(rate) || rate <= 0) {
    return ['Emission rate must be greater than 0'];
  }

  // Max: 1000 kg/s (reasonable limit)
  if (rate > 1000) {
    return ['Emission rate must be 1000 kg/s or less'];
  }

  return [];
}
```

#### Cache Invalidation

When bodies are created, lists should refresh:

```javascript
// After creating body:
await createCelestialBody({ name, bodyType });

// Refresh list
const updatedBodies = await listCelestialBodies();
renderBodiesUI(container, updatedBodies);
```

---

## Agent 3: Frontend Developer

**Agent ID:** `frontend-dev-01`
**Focus:** Code structure, reusability, maintainability

### Proposal: Modular Component Architecture

**Philosophy:** Break the UI into reusable, testable functions. Follow existing patterns from Phase 2/3 but extend with new capabilities.

#### Component Breakdown

**1. Main Controller Function**

```javascript
/**
 * Load Celestial Bodies UI
 * Entry point for the Celestial Bodies page
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
    handleAPIError(error, 'Load celestial bodies');
  } finally {
    setLoading(false);
  }
}
```

**2. Render Functions (Pure)**

```javascript
/**
 * Render full page
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

/**
 * Render create body form section
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
 * Render bodies grid
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

/**
 * Render individual body card
 */
function renderBodyCard(body) {
  const emissions = getEmissions(body.name);
  const emissionsHTML = emissions.length > 0
    ? emissions.map(e => `
        <div style="font-size: 11px; margin-top: 4px;">
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
 * Render add emission section
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
```

**3. Event Handler Setup**

```javascript
function setupCelestialBodiesEventHandlers() {
  // Create body form
  const createForm = document.getElementById('createBodyForm');
  if (createForm) {
    createForm.addEventListener('submit', handleCreateBody);
  }

  // Add emission form
  const emissionForm = document.getElementById('addEmissionForm');
  if (emissionForm) {
    emissionForm.addEventListener('submit', handleAddEmission);
  }

  // Harvest form
  const harvestForm = document.getElementById('harvestForm');
  if (harvestForm) {
    harvestForm.addEventListener('submit', handleHarvest);
  }
}

async function handleCreateBody(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const name = formData.get('name').toUpperCase();
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
    handleAPIError(error, 'Create celestial body');
  } finally {
    setLoading(false);
  }
}

async function handleAddEmission(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const bodyName = formData.get('bodyName');
  const resourceSymbol = formData.get('resourceSymbol');
  const rate = formData.get('rate');

  // Convert rate to wei
  const ratePerSecond = parseResourceAmount(rate);

  // Validate
  const errors = validateEmissionRate(rate);
  if (errors.length > 0) {
    showToast(errors.join('; '), 'error', 'VALIDATION ERROR');
    return;
  }

  setLoading(true, 'Adding resource to emission profile...');

  try {
    await addResourceToBody(bodyName, resourceSymbol, ratePerSecond);

    // Update client state
    if (!emissionProfiles.has(bodyName)) {
      emissionProfiles.set(bodyName, { emissions: [] });
    }
    emissionProfiles.get(bodyName).emissions.push({
      resourceSymbol,
      ratePerSecond,
      isActive: true
    });

    showToast(`Added ${resourceSymbol} to ${bodyName}`, 'success', 'EMISSION ADDED');

    // Refresh UI
    const container = document.getElementById('content');
    await loadCelestialBodiesUI(container);

  } catch (error) {
    handleAPIError(error, 'Add emission resource');
  } finally {
    setLoading(false);
  }
}

async function handleHarvest(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const bodyName = formData.get('bodyName');
  const shipTokenId = formData.get('shipTokenId');
  const resourceSymbol = formData.get('resourceSymbol');
  const amount = formData.get('amount');

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
    handleAPIError(error, 'Harvest resources');
  } finally {
    setLoading(false);
  }
}
```

**4. Helper Functions**

```javascript
/**
 * Format emission rate for display
 * @param {string} ratePerSecond - Rate in wei per second
 * @returns {string} Human-readable rate (kg/day)
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
 * Validate body creation params
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

// Global emission profiles state
const emissionProfiles = new Map();

function getEmissions(bodyName) {
  return emissionProfiles.get(bodyName)?.emissions || [];
}
```

#### Code Organization

**Estimated line counts:**
- Main controller: ~30 lines
- Render functions: ~200 lines
- Event handlers: ~120 lines
- Helper functions: ~80 lines
- API wrappers: ~40 lines

**Total:** ~470 lines (replaces 10-line placeholder)

---

## Agent 4: Solar System Expert

**Agent ID:** `solar-system-expert-01`
**Focus:** Scientific accuracy, realistic resource profiles, celestial body characteristics

### Proposal: Science-Based Resource Emission Profiles

**Philosophy:** Celestial bodies should produce resources that match their real-world composition. This adds educational value and gameplay depth.

#### Recommended Body/Resource Profiles

**1. TITAN (Saturn's Moon)**
- **Body Type:** `moon`
- **Primary Resource:** CH4 (Methane)
- **Rationale:** Titan has lakes and seas of liquid methane on its surface
- **Suggested Rate:** 10 kg/day (abundant but finite)
- **Secondary Resources:** N2 (atmosphere is 95% nitrogen)

**2. EUROPA (Jupiter's Moon)**
- **Body Type:** `moon`
- **Primary Resource:** H2O (Water)
- **Rationale:** Subsurface ocean beneath ice crust
- **Suggested Rate:** 50 kg/day (vast reserves)
- **Secondary Resources:** O2 (electrolysis of water ice)

**3. MARS**
- **Body Type:** `planet`
- **Primary Resource:** CO2 (Carbon Dioxide)
- **Rationale:** Atmosphere is 95% CO2
- **Suggested Rate:** 20 kg/day
- **Secondary Resources:** H2O (polar ice caps)

**4. VENUS**
- **Body Type:** `planet`
- **Primary Resource:** CO2 (Carbon Dioxide)
- **Rationale:** Dense CO2 atmosphere (96.5%)
- **Suggested Rate:** 100 kg/day (extremely abundant)
- **Secondary Resources:** N2 (3.5% of atmosphere)

**5. CERES (Dwarf Planet/Asteroid)**
- **Body Type:** `dwarf-planet`
- **Primary Resource:** H2O (Water ice)
- **Rationale:** 25% water ice by mass
- **Suggested Rate:** 5 kg/day (limited surface area)

**6. ENCELADUS (Saturn's Moon)**
- **Body Type:** `moon`
- **Primary Resource:** H2O (Water)
- **Rationale:** Water geysers from subsurface ocean
- **Suggested Rate:** 30 kg/day
- **Secondary Resources:** O2

#### Emission Rate Guidelines

**Low Production (1-10 kg/day):**
- Small bodies (asteroids, small moons)
- Scarce resources
- Example: CERES/H2O

**Medium Production (10-50 kg/day):**
- Medium bodies (large moons)
- Moderate resource availability
- Example: TITAN/CH4, MARS/CO2

**High Production (50-200 kg/day):**
- Large bodies (planets, ocean moons)
- Abundant resources
- Example: VENUS/CO2, EUROPA/H2O

**Conversion Reference:**
- 1 kg/s = 86,400 kg/day
- 0.001 kg/s = 86.4 kg/day
- 0.0001 kg/s = 8.64 kg/day

#### UI Suggestions for Scientific Context

**Add tooltips/descriptions to bodies:**

```javascript
const BODY_DESCRIPTIONS = {
  'TITAN': 'Saturn\'s largest moon with methane lakes and nitrogen atmosphere',
  'EUROPA': 'Jupiter\'s ice-covered moon with subsurface ocean',
  'MARS': 'Red planet with CO2 atmosphere and polar ice caps',
  'VENUS': 'Scorching planet with dense CO2 atmosphere',
  'CERES': 'Largest asteroid with water ice deposits',
  'ENCELADUS': 'Saturn\'s moon with water geysers'
};

const RESOURCE_SOURCES = {
  'CH4': 'Methane lakes (TITAN), ice clathrates',
  'H2O': 'Subsurface oceans (EUROPA), polar ice caps (MARS)',
  'O2': 'Electrolysis of water ice',
  'CO2': 'Atmospheric extraction (MARS, VENUS)',
  'N2': 'Atmospheric extraction (TITAN, VENUS)'
};
```

**Display in UI:**
```
┌──────────────────────────────────────┐
│ TITAN                                │
│ Moon                                 │
│ 0xABC...123                          │
│                                      │
│ "Saturn's largest moon with methane  │
│  lakes and nitrogen atmosphere"      │
│                                      │
│ EMISSIONS:                           │
│ CH4 (Methane)       86.4 kg/day      │
│ N2 (Nitrogen)       43.2 kg/day      │
└──────────────────────────────────────┘
```

#### Validation Rules

**Body Type Validation:**
```javascript
const VALID_BODY_TYPES = [
  'planet',         // Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune
  'moon',           // Luna, Titan, Europa, Enceladus, etc.
  'asteroid',       // Vesta, Pallas, etc.
  'dwarf-planet'    // Ceres, Pluto, Eris, etc.
];
```

**Resource Compatibility Matrix:**
```javascript
const RESOURCE_COMPATIBILITY = {
  'planet': ['CH4', 'O2', 'H2O', 'CO2', 'N2'],  // All resources
  'moon': ['CH4', 'O2', 'H2O', 'N2'],           // Usually no CO2
  'asteroid': ['H2O', 'O2'],                     // Limited to ice/minerals
  'dwarf-planet': ['H2O', 'O2', 'CH4']          // Ice-rich
};

// Validation function
function isResourceCompatible(bodyType, resourceSymbol) {
  return RESOURCE_COMPATIBILITY[bodyType]?.includes(resourceSymbol) || false;
}
```

**UI Warning for Incompatible Pairings:**
```javascript
// When user selects ASTEROID + CO2:
showToast(
  'Warning: Asteroids typically do not produce CO2. Consider H2O or O2 instead.',
  'warning',
  'UNUSUAL PAIRING'
);
// Still allow (admin override), but warn
```

#### Educational Enhancements

**Optional: Add "INFO" button to body cards:**
```javascript
function renderBodyCard(body) {
  const description = BODY_DESCRIPTIONS[body.name] || 'Celestial resource source';

  return `
    <div class="data-card">
      <div class="data-card-title">${body.name} ℹ️</div>
      <div class="data-card-value">${body.bodyType}</div>
      <div style="font-size: 10px; color: var(--text-muted); margin-top: 8px;">
        ${description}
      </div>
      ...
    </div>
  `;
}
```

#### Preset Body Templates

**Quick-create common bodies:**
```javascript
const PRESET_BODIES = [
  {
    name: 'TITAN',
    bodyType: 'moon',
    emissions: [
      { resourceSymbol: 'CH4', ratePerSecond: '0.001' },  // 86.4 kg/day
      { resourceSymbol: 'N2', ratePerSecond: '0.0005' }   // 43.2 kg/day
    ]
  },
  {
    name: 'EUROPA',
    bodyType: 'moon',
    emissions: [
      { resourceSymbol: 'H2O', ratePerSecond: '0.0005' }, // 43.2 kg/day
      { resourceSymbol: 'O2', ratePerSecond: '0.00025' }  // 21.6 kg/day
    ]
  },
  // ... more presets
];

// UI: "Quick Create" section with preset buttons
```

---

## Synthesis & Next Steps

### Areas of Agreement

All 4 agents agree on:

1. **Card-based UI** for displaying bodies
2. **Three main forms:** Create body, Add emission, Harvest
3. **Client-side state management** for emission profiles (Option C approach)
4. **Validation before API calls** to prevent errors
5. **User-friendly error messages** with context

### Key Decisions to Make

1. **Emission Profile Display Strategy:**
   - UX Designer: Progressive disclosure (expand cards)
   - Backend Agent: Client-side state
   - Frontend Agent: Simple grid with inline display
   - **Recommendation:** Simple inline display (easiest to implement)

2. **Scientific Accuracy:**
   - Solar System Expert: Add body descriptions and resource compatibility warnings
   - Others: Keep UI simple
   - **Recommendation:** Add descriptions but skip compatibility warnings (v1)

3. **Ship Selector for Harvest:**
   - UX Designer: Modal dialog
   - Frontend Agent: Inline dropdown
   - **Recommendation:** Inline dropdown (consistent with Resources page)

### Proposed Implementation Plan

**Unit 1:** API wrappers and helper functions
- Add `createCelestialBody()`, `addResourceToBody()`, `harvestFromBody()`
- Add `formatEmissionRate()`, `validateBodyCreation()`, `validateEmissionRate()`
- Add `emissionProfiles` Map for state management

**Unit 2:** Render functions
- `renderCelestialBodiesPage()`
- `renderCreateBodySection()`
- `renderBodiesGrid()`, `renderBodyCard()`
- `renderAddEmissionSection()`
- `renderHarvestSection()`

**Unit 3:** Event handlers
- `handleCreateBody()`
- `handleAddEmission()`
- `handleHarvest()`

**Unit 4:** Main controller
- `loadCelestialBodiesUI()`
- `setupCelestialBodiesEventHandlers()`

**Unit 5:** Polish and edge cases
- Empty state handling
- Error messages refinement
- Loading state improvements

---

## Document Status

✅ **Brainstorming Complete**
📋 **Ready for Implementation Plan Synthesis**

**Next Step:** Create `PHASE4_IMPLEMENTATION_PLAN.md` based on these proposals.

---

**Date:** 2026-02-12
**Lead Coordinator:** Claude Sonnet 4.5
