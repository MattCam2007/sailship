// js/ui/celestialBodies.js
// Celestial body management UI

import { createCelestialBody, addResourceToBody, harvestFromBody, listCelestialBodies } from '../api.js';
import { showToast, setLoading, formatAddress, parseTokenAmount } from '../utils.js';

export function loadCelestialBodiesUI(container) {
  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">CELESTIAL BODY MANAGEMENT</h1>
      <p class="section-description">
        Create celestial bodies (planets, moons, asteroids), configure their resource emission profiles,
        and harvest resources to ship TBAs.
      </p>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          CREATE CELESTIAL BODY
        </h2>

        <form id="createBodyForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Name (e.g., TITAN, EUROPA)</label>
              <input type="text" class="form-input" name="name"
                     placeholder="TITAN" required>
            </div>

            <div class="form-group">
              <label class="form-label">Body Type</label>
              <select class="form-select" name="bodyType" required>
                <option value="">Select type...</option>
                <option value="planet">Planet</option>
                <option value="moon">Moon</option>
                <option value="asteroid">Asteroid</option>
              </select>
            </div>
          </div>

          <button type="submit" class="btn btn-primary">
            🪐 CREATE BODY
          </button>
        </form>
      </div>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          ADD RESOURCE TO BODY
        </h2>

        <form id="addResourceForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Celestial Body Name</label>
              <input type="text" class="form-input" name="bodyName"
                     placeholder="TITAN" required>
            </div>

            <div class="form-group">
              <label class="form-label">Resource Type</label>
              <select class="form-select" name="resourceSymbol" required>
                <option value="">Select resource...</option>
                <option value="CH4">CH4 - Methane</option>
                <option value="O2">O2 - Oxygen</option>
                <option value="H2O">H2O - Water</option>
                <option value="CO2">CO2 - Carbon Dioxide</option>
                <option value="N2">N2 - Nitrogen</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Emission Rate (tokens per second, will be converted to wei)</label>
            <input type="number" class="form-input" name="ratePerSecond"
                   placeholder="100" min="0" step="0.000000000000000001" required>
            <small class="text-muted">Example: 100 = 100 tokens per second</small>
          </div>

          <button type="submit" class="btn btn-primary">
            ➕ ADD RESOURCE
          </button>
        </form>
      </div>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          HARVEST RESOURCES
        </h2>

        <form id="harvestForm">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Celestial Body Name</label>
              <input type="text" class="form-input" name="bodyName"
                     placeholder="TITAN" required>
            </div>

            <div class="form-group">
              <label class="form-label">Ship Token ID</label>
              <input type="number" class="form-input" name="shipTokenId"
                     placeholder="1" min="0" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Resource Type</label>
              <select class="form-select" name="resourceSymbol" required>
                <option value="">Select resource...</option>
                <option value="CH4">CH4 - Methane</option>
                <option value="O2">O2 - Oxygen</option>
                <option value="H2O">H2O - Water</option>
                <option value="CO2">CO2 - Carbon Dioxide</option>
                <option value="N2">N2 - Nitrogen</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Amount (in tokens)</label>
              <input type="number" class="form-input" name="amount"
                     placeholder="5000" min="0" step="0.000000000000000001" required>
            </div>
          </div>

          <button type="submit" class="btn btn-primary">
            🌾 HARVEST
          </button>
        </form>
      </div>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          ALL CELESTIAL BODIES
        </h2>

        <button id="refreshBodiesBtn" class="btn btn-primary mb-2">
          🔄 REFRESH LIST
        </button>

        <div id="bodiesList"></div>
      </div>
    </div>
  `;

  setupCelestialBodyForms();
  // Auto-load celestial bodies list
  loadBodiesList();
}

function setupCelestialBodyForms() {
  // Create body form
  const createForm = document.getElementById('createBodyForm');
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true, 'Creating celestial body...');

    try {
      const formData = new FormData(createForm);
      const params = {
        name: formData.get('name'),
        bodyType: formData.get('bodyType')
      };

      const result = await createCelestialBody(params);

      showToast(\`Created \${result.bodyType} '\${result.name}' at \${formatAddress(result.address)}\`, 'success', 'BODY CREATED');
      createForm.reset();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  });

  // Add resource form
  const addResourceForm = document.getElementById('addResourceForm');
  addResourceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true, 'Adding resource...');

    try {
      const formData = new FormData(addResourceForm);
      const bodyName = formData.get('bodyName');
      const params = {
        resourceSymbol: formData.get('resourceSymbol'),
        ratePerSecond: parseTokenAmount(formData.get('ratePerSecond'), 18)
      };

      const result = await addResourceToBody(bodyName, params);

      showToast(\`Added \${result.resourceSymbol} to \${bodyName} at \${formData.get('ratePerSecond')}/s\`, 'success', 'RESOURCE ADDED');
      addResourceForm.reset();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  });

  // Harvest form
  const harvestForm = document.getElementById('harvestForm');
  harvestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true, 'Harvesting resources...');

    try {
      const formData = new FormData(harvestForm);
      const bodyName = formData.get('bodyName');
      const params = {
        shipTokenId: formData.get('shipTokenId'),
        resourceSymbol: formData.get('resourceSymbol'),
        amount: parseTokenAmount(formData.get('amount'), 18)
      };

      const result = await harvestFromBody(bodyName, params);

      showToast(\`Harvested \${formData.get('amount')} \${result.resourceSymbol} from \${bodyName} to Ship #\${result.shipTokenId}\`, 'success', 'HARVEST COMPLETE');
      harvestForm.reset();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  });

  // Refresh bodies list
  const refreshBtn = document.getElementById('refreshBodiesBtn');
  refreshBtn.addEventListener('click', () => {
    loadBodiesList();
  });
}

async function loadBodiesList() {
  setLoading(true, 'Fetching celestial bodies...');

  try {
    const bodies = await listCelestialBodies();
    displayBodiesList(bodies);
  } catch (error) {
    showToast(error.message, 'error');
    document.getElementById('bodiesList').innerHTML =
      '<p class="text-muted">Failed to load celestial bodies. Check console for details.</p>';
  } finally {
    setLoading(false);
  }
}

function displayBodiesList(bodies) {
  const container = document.getElementById('bodiesList');

  if (bodies.length === 0) {
    container.innerHTML = '<p class="text-muted">No celestial bodies created yet.</p>';
    return;
  }

  const bodiesHTML = bodies.map(b => \`
    <tr>
      <td><strong>\${b.name}</strong></td>
      <td>\${b.bodyType}</td>
      <td class="mono text-muted">\${formatAddress(b.address)}</td>
    </tr>
  \`).join('');

  container.innerHTML = \`
    <table class="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Contract Address</th>
        </tr>
      </thead>
      <tbody>
        \${bodiesHTML}
      </tbody>
    </table>
  \`;
}
