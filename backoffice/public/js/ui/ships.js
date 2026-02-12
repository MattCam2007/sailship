// js/ui/ships.js
// Ship configurator UI

import { mintShip, getShip, getShipTBA, listShips } from '../api.js';
import { showToast, setLoading, formatAddress, formatTokenAmount, formatNumber } from '../utils.js';

export function loadShipsUI(container) {
  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">SHIP CONFIGURATOR</h1>
      <p class="section-description">
        Mint new ships with custom stats. Each ship is an ERC-721 NFT with a Token Bound Account (TBA)
        for holding cargo resources.
      </p>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          MINT NEW SHIP
        </h2>

        <form id="mintShipForm">
          <div class="form-group">
            <label class="form-label">Recipient Address (Owner)</label>
            <input type="text" class="form-input" name="to"
                   placeholder="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" required>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Ship Class Name</label>
              <input type="text" class="form-input" name="className"
                     placeholder="HELIOS-CLASS" required>
            </div>

            <div class="form-group">
              <label class="form-label">Mass (kg)</label>
              <input type="number" class="form-input" name="mass"
                     placeholder="10000" min="1" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Sail Area (m²)</label>
              <input type="number" class="form-input" name="sailArea"
                     placeholder="3000000" min="1" required>
            </div>

            <div class="form-group">
              <label class="form-label">Sail Reflectivity (basis points, 0-10000)</label>
              <input type="number" class="form-input" name="sailReflectivity"
                     placeholder="9000" min="0" max="10000" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Max Sail Count</label>
              <input type="number" class="form-input" name="maxSailCount"
                     placeholder="5" min="1" max="20" required>
            </div>

            <div class="form-group">
              <label class="form-label">Cargo Capacity (resource units)</label>
              <input type="number" class="form-input" name="cargoCapacity"
                     placeholder="1000000" min="0" required>
            </div>
          </div>

          <button type="submit" class="btn btn-primary">
            🛸 MINT SHIP
          </button>
        </form>
      </div>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          INSPECT SHIP
        </h2>

        <form id="inspectShipForm" style="display: flex; gap: 12px; align-items: end;">
          <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <label class="form-label">Token ID</label>
            <input type="number" class="form-input" name="tokenId"
                   placeholder="1" min="0" required>
          </div>
          <button type="submit" class="btn btn-primary">
            🔍 INSPECT
          </button>
        </form>

        <div id="shipDetails" class="mt-3"></div>
      </div>

      <div class="form-panel">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin: 0; color: var(--accent-teal);">
            MINTED SHIPS
          </h2>
          <button id="refreshShipsBtn" class="btn btn-primary" style="padding: 8px 16px;">
            🔄 REFRESH
          </button>
        </div>

        <div id="shipsList"></div>
      </div>
    </div>
  `;

  // Set up form handlers
  setupShipForms();
  // Auto-load ships list
  loadShipsList();
}

function setupShipForms() {
  // Mint ship form
  const mintForm = document.getElementById('mintShipForm');
  mintForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true, 'Minting ship...');

    try {
      const formData = new FormData(mintForm);
      const params = {
        to: formData.get('to'),
        className: formData.get('className'),
        mass: parseInt(formData.get('mass')),
        sailArea: parseInt(formData.get('sailArea')),
        sailReflectivity: parseInt(formData.get('sailReflectivity')),
        maxSailCount: parseInt(formData.get('maxSailCount')),
        cargoCapacity: parseInt(formData.get('cargoCapacity'))
      };

      const result = await mintShip(params);

      showToast(\`Ship minted! Token ID: \${result.tokenId}\`, 'success', 'SHIP CREATED');
      mintForm.reset();
      // Reload ships list to show the new ship
      loadShipsList();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  });

  // Inspect ship form
  const inspectForm = document.getElementById('inspectShipForm');
  inspectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true, 'Fetching ship data...');

    try {
      const formData = new FormData(inspectForm);
      const tokenId = formData.get('tokenId');

      const [shipData, tbaData] = await Promise.all([
        getShip(tokenId),
        getShipTBA(tokenId)
      ]);

      displayShipDetails(tokenId, shipData, tbaData);
    } catch (error) {
      showToast(error.message, 'error');
      document.getElementById('shipDetails').innerHTML = '';
    } finally {
      setLoading(false);
    }
  });

  // Refresh ships list button
  const refreshBtn = document.getElementById('refreshShipsBtn');
  refreshBtn.addEventListener('click', () => {
    loadShipsList();
  });
}

async function loadShipsList() {
  setLoading(true, 'Loading ships...');

  try {
    const adminAddressElement = document.getElementById('adminAddress');
    const adminAddress = adminAddressElement?.dataset.fullAddress;

    console.log('[DEBUG] Loading ships for address:', adminAddress);

    if (!adminAddress) {
      document.getElementById('shipsList').innerHTML =
        '<p class="text-muted">Admin address not available. Please refresh the page.</p>';
      return;
    }

    const ships = await listShips(adminAddress);
    console.log('[DEBUG] Ships received from API:', ships.length, ships);
    displayShipsList(ships);
  } catch (error) {
    console.error('[DEBUG] Error loading ships:', error);
    showToast(error.message, 'error');
    document.getElementById('shipsList').innerHTML =
      '<p class="text-muted">Failed to load ships. Check console for details.</p>';
  } finally {
    setLoading(false);
  }
}

function displayShipsList(ships) {
  const container = document.getElementById('shipsList');

  console.log('[DEBUG] displayShipsList called with:', ships.length, 'ships');
  console.log('[DEBUG] Ship IDs:', ships.map(s => s.tokenId).join(', '));

  if (ships.length === 0) {
    container.innerHTML = '<p class="text-muted">No ships minted yet.</p>';
    return;
  }

  const cardsHTML = ships.map(ship => {
    console.log('[DEBUG] Rendering ship:', ship.tokenId);
    return \`
      <div class="data-card clickable" data-token-id="\${ship.tokenId}" style="cursor: pointer;">
        <div class="data-card-title">SHIP #\${ship.tokenId}</div>
        <div class="data-card-value">\${ship.stats.className}</div>
        <div class="data-card-meta">
          Mass: \${formatNumber(ship.stats.mass)} kg
        </div>
      </div>
    \`;
  }).join('');

  console.log('[DEBUG] Generated HTML length:', cardsHTML.length);

  container.innerHTML = \`<div class="data-grid">\${cardsHTML}</div>\`;

  console.log('[DEBUG] Cards in DOM:', container.querySelectorAll('.data-card').length);

  // Attach click handlers to load ship details
  container.querySelectorAll('.data-card').forEach(card => {
    card.addEventListener('click', async () => {
      const tokenId = card.dataset.tokenId;
      await loadShipDetails(tokenId);
    });
  });
}

async function loadShipDetails(tokenId) {
  setLoading(true, 'Fetching ship data...');

  try {
    const [shipData, tbaData] = await Promise.all([
      getShip(tokenId),
      getShipTBA(tokenId)
    ]);

    displayShipDetails(tokenId, shipData, tbaData);

    // Scroll to ship details
    document.getElementById('shipDetails').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    showToast(error.message, 'error');
    document.getElementById('shipDetails').innerHTML = '';
  } finally {
    setLoading(false);
  }
}

function displayShipDetails(tokenId, shipData, tbaData) {
  const container = document.getElementById('shipDetails');

  // Defensive coding: check if shipData exists and has required structure
  if (!shipData || !shipData.stats) {
    container.innerHTML = \`
      <div style="background: rgba(255, 78, 78, 0.1); border: 1px solid rgba(255, 78, 78, 0.3); padding: 20px; margin-top: 20px;">
        <p class="text-muted">Unable to load ship data</p>
      </div>
    \`;
    return;
  }

  // Check if tbaData exists
  if (!tbaData) {
    container.innerHTML = \`
      <div style="background: rgba(255, 78, 78, 0.1); border: 1px solid rgba(255, 78, 78, 0.3); padding: 20px; margin-top: 20px;">
        <p class="text-muted">Unable to load Token Bound Account data</p>
      </div>
    \`;
    return;
  }

  // Check if balances exists and is an array
  let balancesHTML;
  if (tbaData.balances && Array.isArray(tbaData.balances)) {
    if (tbaData.balances.length === 0) {
      balancesHTML = '<tr><td colspan="3" class="text-muted">No resource balances (TBA is empty)</td></tr>';
    } else {
      balancesHTML = tbaData.balances.map(b => \`
        <tr>
          <td>\${b.symbol || 'Unknown'}</td>
          <td class="mono">\${formatTokenAmount(b.balance, 18, 4)}</td>
          <td class="mono text-muted">\${formatAddress(b.address)}</td>
        </tr>
      \`).join('');
    }
  } else {
    balancesHTML = '<tr><td colspan="3" class="text-muted">Balance data unavailable</td></tr>';
  }

  // Safely get TBA address with fallback
  const tbaAddress = tbaData.tbaAddress || 'Unknown';

  container.innerHTML = \`
    <div style="background: rgba(78, 232, 196, 0.05); border: 1px solid var(--accent-teal); padding: 20px; margin-top: 20px;">
      <h3 style="font-family: 'Orbitron', sans-serif; font-size: 16px; color: var(--accent-teal); margin-bottom: 16px;">
        SHIP #\${tokenId} - \${shipData.stats.className}
      </h3>

      <div class="data-grid">
        <div class="data-card">
          <div class="data-card-title">MASS</div>
          <div class="data-card-value">\${parseInt(shipData.stats.mass).toLocaleString()} kg</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">SAIL AREA</div>
          <div class="data-card-value">\${parseInt(shipData.stats.sailArea).toLocaleString()} m²</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">REFLECTIVITY</div>
          <div class="data-card-value">\${(parseInt(shipData.stats.sailReflectivity) / 100).toFixed(1)}%</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">MAX SAILS</div>
          <div class="data-card-value">\${shipData.stats.maxSailCount}</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">CARGO CAPACITY</div>
          <div class="data-card-value">\${parseInt(shipData.stats.cargoCapacity).toLocaleString()}</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">CONDITION</div>
          <div class="data-card-value">\${(parseInt(shipData.stats.condition) / 100).toFixed(1)}%</div>
        </div>
      </div>

      <h4 style="font-family: 'Orbitron', sans-serif; font-size: 12px; color: var(--text-secondary); margin: 24px 0 12px; letter-spacing: 1px;">
        TOKEN BOUND ACCOUNT (TBA): <span class="mono text-primary">\${formatAddress(tbaAddress)}</span>
      </h4>

      <table class="data-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Balance</th>
            <th>Token Address</th>
          </tr>
        </thead>
        <tbody>
          \${balancesHTML}
        </tbody>
      </table>
    </div>
  \`;
}
