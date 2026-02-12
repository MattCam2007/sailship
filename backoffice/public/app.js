// Bundled app without ES6 modules - Updated with all bug fixes
console.log('APP: Loading...');

// === Constants ===
const RESOURCE_METADATA = [
  { symbol: 'CH4', name: 'Methane', address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' },
  { symbol: 'O2', name: 'Oxygen', address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' },
  { symbol: 'H2O', name: 'Water', address: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' },
  { symbol: 'CO2', name: 'Carbon Dioxide', address: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853' },
  { symbol: 'N2', name: 'Nitrogen', address: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318' }
];

const MIN_RESOURCE_AMOUNT = 0.0001;

// === API Layer ===
const API_BASE = '/api';

async function fetchAPI(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

async function getHealth() {
  return fetchAPI('/health');
}

async function mintShip(params) {
  return fetchAPI(`${API_BASE}/ships/mint`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

async function getShip(tokenId) {
  return fetchAPI(`${API_BASE}/ships/${tokenId}`);
}

async function getShipTBA(tokenId) {
  return fetchAPI(`${API_BASE}/ships/${tokenId}/tba`);
}

async function listShips(owner = null) {
  // FIX: Add cache-busting parameter to prevent browser caching
  const timestamp = Date.now();
  const url = owner
    ? `${API_BASE}/ships?owner=${owner}&_t=${timestamp}`
    : `${API_BASE}/ships?_t=${timestamp}`;
  return fetchAPI(url);
}

async function mintResource(params) {
  return fetchAPI(`${API_BASE}/resources/mint`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

async function getResourceBalances(address) {
  return fetchAPI(`${API_BASE}/resources/balances/${address}`);
}

async function createCelestialBody(params) {
  return fetchAPI(`${API_BASE}/celestial-bodies/create`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

async function listCelestialBodies() {
  return fetchAPI(`${API_BASE}/celestial-bodies`);
}

// === Utils ===
function formatAddress(addr) {
  if (!addr) return '0x...';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatTokenAmount(wei, decimals = 18, displayDecimals = 2) {
  const divisor = Math.pow(10, decimals);
  const ether = parseFloat(wei) / divisor;
  return ether.toFixed(displayDecimals);
}

/**
 * Format human-readable resource amount (e.g., "100.5 kg" → display format)
 * @param {string|number} amount - Amount in human-readable units
 * @param {number} decimals - Number of decimal places to display
 * @returns {string} Formatted amount
 */
function formatResourceAmount(amount, decimals = 4) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '0';
  return num.toFixed(decimals);
}

/**
 * Parse human-readable amount to wei (18 decimals)
 * Uses string operations to avoid JavaScript Number precision limits
 * @param {string|number} amount - Amount in human-readable units (e.g., "100", "0.5")
 * @returns {string} Amount in wei as string
 */
function parseResourceAmount(amount) {
  const num = parseFloat(amount);
  if (isNaN(num) || num < 0) {
    throw new Error('Invalid amount: must be a positive number');
  }

  // Split into integer and decimal parts
  const [intPart, decPart = ''] = amount.toString().split('.');

  // Pad or truncate decimal part to exactly 18 digits
  const paddedDec = decPart.padEnd(18, '0').slice(0, 18);

  // Concatenate integer + decimal (this is the wei amount)
  const weiStr = intPart + paddedDec;

  // Remove leading zeros (except single zero)
  return weiStr.replace(/^0+/, '') || '0';
}

/**
 * Validate Ethereum address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid Ethereum address
 */
function validateEthereumAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Generate HTML for resource dropdown options
 * @returns {string} HTML option elements
 */
function createResourcesFormHTML(tokenId, tbaAddress) {
  const resourceOptions = RESOURCE_METADATA.map(token =>
    `<option value="${token.symbol}">${token.symbol} (${token.name})</option>`
  ).join('');

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
              ${resourceOptions}
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

function showToast(message, type = 'success', title = null) {
  const container = document.getElementById('toastContainer');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = title || (type === 'success' ? 'SUCCESS' : type === 'error' ? 'ERROR' : 'WARNING');

  const messageEl = document.createElement('div');
  messageEl.className = 'toast-message';
  messageEl.textContent = message;

  toast.appendChild(titleEl);
  toast.appendChild(messageEl);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function setLoading(isLoading, text = 'Processing transaction...') {
  const overlay = document.getElementById('loadingOverlay');
  const textEl = overlay.querySelector('.loading-text');

  if (isLoading) {
    textEl.textContent = text;
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

// === UI Loaders ===
function loadDeployUI(container) {
  const addresses = {
    gameRegistry: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    shipNFT: '0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e',
    celestialBodyRegistry: '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82',
    ch4: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    o2: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    h2o: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
    co2: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    n2: '0x8A791620dd6260079BF849Dc5567aDC3F2FdC318'
  };

  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">CONTRACT DEPLOYMENT</h1>
      <p class="section-description">
        ✅ Phase 2 contracts successfully deployed to local Hardhat network.
      </p>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--success);">
          ✅ CONTRACTS DEPLOYED
        </h2>

        <p style="color: var(--text-secondary); margin-bottom: 20px; line-height: 1.6;">
          All contracts were deployed successfully by Team A. Use the tabs below to interact with ships, resources, and celestial bodies.
        </p>

        <div class="data-grid">
          <div class="data-card">
            <div class="data-card-title">GAME REGISTRY</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.gameRegistry}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">SHIP NFT</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.shipNFT}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">CELESTIAL BODY REGISTRY</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.celestialBodyRegistry}</div>
          </div>
        </div>

        <h3 style="font-family: 'Orbitron', sans-serif; font-size: 12px; margin: 24px 0 12px; color: var(--text-secondary); letter-spacing: 1px;">
          RESOURCE TOKENS
        </h3>

        <div class="data-grid">
          <div class="data-card">
            <div class="data-card-title">CH4 (METHANE)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.ch4}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">O2 (OXYGEN)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.o2}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">H2O (WATER)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.h2o}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">CO2 (CARBON DIOXIDE)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.co2}</div>
          </div>
          <div class="data-card">
            <div class="data-card-title">N2 (NITROGEN)</div>
            <div class="data-card-value mono" style="font-size: 11px;">${addresses.n2}</div>
          </div>
        </div>

        <div style="margin-top: 24px; padding: 16px; background: var(--bg-input); border-left: 4px solid var(--success); border-radius: 4px;">
          <strong style="color: var(--success);">✅ Ready to use!</strong>
          <p style="color: var(--text-secondary); margin-top: 8px; line-height: 1.6;">
            Click the <strong>SHIPS</strong>, <strong>RESOURCES</strong>, or <strong>CELESTIAL</strong> tabs to start managing the blockchain.
          </p>
        </div>
      </div>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 16px; color: var(--accent-teal);">
          DEPLOYMENT INFO
        </h2>

        <div style="color: var(--text-secondary); line-height: 1.8;">
          <div style="margin-bottom: 8px;">
            <strong>Network:</strong> Hardhat Local (localhost:8545)
          </div>
          <div style="margin-bottom: 8px;">
            <strong>Chain ID:</strong> 1337
          </div>
          <div style="margin-bottom: 8px;">
            <strong>Admin Wallet:</strong> <span class="mono">0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266</span>
          </div>
          <div>
            <strong>Celestial Bodies:</strong> TITAN, EUROPA, MARS, VENUS (deployed and configured)
          </div>
        </div>
      </div>
    </div>
  `;
}

function loadShipsUI(container) {
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
                   value="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" required>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Ship Class Name</label>
              <input type="text" class="form-input" name="className"
                     value="HELIOS-CLASS" required>
            </div>

            <div class="form-group">
              <label class="form-label">Mass (kg)</label>
              <input type="number" class="form-input" name="mass"
                     value="10000" min="1" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Sail Area (m²)</label>
              <input type="number" class="form-input" name="sailArea"
                     value="3000000" min="1" required>
            </div>

            <div class="form-group">
              <label class="form-label">Sail Reflectivity (basis points, 0-10000)</label>
              <input type="number" class="form-input" name="sailReflectivity"
                     value="9000" min="0" max="10000" required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Max Sail Count</label>
              <input type="number" class="form-input" name="maxSailCount"
                     value="5" min="1" max="20" required>
            </div>

            <div class="form-group">
              <label class="form-label">Cargo Capacity (resource units)</label>
              <input type="number" class="form-input" name="cargoCapacity"
                     value="1000000" min="0" required>
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

  setupShipForms();
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

      showToast(`Ship minted! Token ID: ${result.tokenId}`, 'success', 'SHIP CREATED');
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
    return `
      <div class="data-card clickable" data-token-id="${ship.tokenId}" style="cursor: pointer;">
        <div class="data-card-title">SHIP #${ship.tokenId}</div>
        <div class="data-card-value">${ship.stats.className}</div>
        <div class="data-card-meta">
          Mass: ${formatNumber(ship.stats.mass)} kg
        </div>
      </div>
    `;
  }).join('');

  console.log('[DEBUG] Generated HTML length:', cardsHTML.length);

  container.innerHTML = `<div class="data-grid">${cardsHTML}</div>`;

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

  // FIX: Defensive coding - check if shipData exists and has required structure
  if (!shipData || !shipData.stats) {
    container.innerHTML = `
      <div style="background: rgba(255, 78, 78, 0.1); border: 1px solid rgba(255, 78, 78, 0.3); padding: 20px; margin-top: 20px;">
        <p class="text-muted">Unable to load ship data</p>
      </div>
    `;
    return;
  }

  // FIX: Check if tbaData exists
  if (!tbaData) {
    container.innerHTML = `
      <div style="background: rgba(255, 78, 78, 0.1); border: 1px solid rgba(255, 78, 78, 0.3); padding: 20px; margin-top: 20px;">
        <p class="text-muted">Unable to load Token Bound Account data</p>
      </div>
    `;
    return;
  }

  // FIX: Check if balances exists and is an array
  let balancesHTML;
  if (tbaData.balances && Array.isArray(tbaData.balances)) {
    if (tbaData.balances.length === 0) {
      balancesHTML = '<tr><td colspan="3" class="text-muted">No resource balances (TBA is empty)</td></tr>';
    } else {
      balancesHTML = tbaData.balances.map(b => `
        <tr>
          <td>${b.symbol || 'Unknown'}</td>
          <td class="mono">${formatTokenAmount(b.balance, 18, 4)}</td>
          <td class="mono text-muted">${formatAddress(b.address)}</td>
        </tr>
      `).join('');
    }
  } else {
    balancesHTML = '<tr><td colspan="3" class="text-muted">Balance data unavailable</td></tr>';
  }

  // FIX: Safely get TBA address with fallback
  const tbaAddress = tbaData.tbaAddress || 'Unknown';

  container.innerHTML = `
    <div style="background: rgba(78, 232, 196, 0.05); border: 1px solid var(--accent-teal); padding: 20px; margin-top: 20px;">
      <h3 style="font-family: 'Orbitron', sans-serif; font-size: 16px; color: var(--accent-teal); margin-bottom: 16px;">
        SHIP #${tokenId} - ${shipData.stats.className}
      </h3>

      <div class="data-grid">
        <div class="data-card">
          <div class="data-card-title">MASS</div>
          <div class="data-card-value">${parseInt(shipData.stats.mass).toLocaleString()} kg</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">SAIL AREA</div>
          <div class="data-card-value">${parseInt(shipData.stats.sailArea).toLocaleString()} m²</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">REFLECTIVITY</div>
          <div class="data-card-value">${(parseInt(shipData.stats.sailReflectivity) / 100).toFixed(1)}%</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">MAX SAILS</div>
          <div class="data-card-value">${shipData.stats.maxSailCount}</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">CARGO CAPACITY</div>
          <div class="data-card-value">${parseInt(shipData.stats.cargoCapacity).toLocaleString()}</div>
        </div>
        <div class="data-card">
          <div class="data-card-title">CONDITION</div>
          <div class="data-card-value">${(parseInt(shipData.stats.condition) / 100).toFixed(1)}%</div>
        </div>
      </div>

      <h4 style="font-family: 'Orbitron', sans-serif; font-size: 12px; color: var(--text-secondary); margin: 24px 0 12px; letter-spacing: 1px;">
        TOKEN BOUND ACCOUNT (TBA): <span class="mono text-primary">${formatAddress(tbaAddress)}</span>
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
          ${balancesHTML}
        </tbody>
      </table>
    </div>
    ${createResourcesFormHTML(tokenId, tbaAddress)}
  `;

  // Set up the add resources form handler
  setupAddResourcesForm();
}

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
    if (!validateEthereumAddress(tbaAddress)) {
      showToast('Invalid TBA address', 'error');
      return;
    }

    setLoading(true, 'Minting resources to ship...');

    try {
      // Convert to wei
      const weiAmount = parseResourceAmount(amount);

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

function loadResourcesUI(container) {
  const resourceOptions = RESOURCE_METADATA.map(token =>
    `<option value="${token.symbol}">${token.symbol} (${token.name})</option>`
  ).join('');

  const resourceCards = RESOURCE_METADATA.map(token => `
    <div class="data-card">
      <div class="data-card-title">${token.symbol}</div>
      <div class="data-card-value">${token.name}</div>
      <div class="data-card-meta mono" style="font-size: 10px;">${formatAddress(token.address)}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">RESOURCE MANAGEMENT</h1>
      <p class="section-description">
        Manage resource tokens (CH4, O2, H2O, CO2, N2). Mint resources to any address or check balances.
      </p>

      <!-- Section A: Resource Token Overview -->
      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          RESOURCE TOKENS
        </h2>
        <div class="data-grid">
          ${resourceCards}
        </div>
      </div>

      <!-- Section B: Mint Resources Form -->
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
                ${resourceOptions}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Amount (kg)</label>
              <input type="number" class="form-input" name="amount"
                     placeholder="100" min="${MIN_RESOURCE_AMOUNT}" step="0.0001" required>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Recipient Address</label>
            <input type="text" class="form-input mono" name="to"
                   placeholder="0x..." required>
          </div>
          <button type="submit" class="btn btn-primary">
            ⚗️ MINT RESOURCES
          </button>
        </form>
      </div>

      <!-- Section C: Balance Checker -->
      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          CHECK BALANCES
        </h2>

        <form id="checkBalanceForm" style="display: flex; gap: 12px; align-items: end;">
          <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <label class="form-label">Address (Ship TBA or Wallet)</label>
            <input type="text" class="form-input mono" name="address"
                   placeholder="0x..." required>
          </div>
          <button type="submit" class="btn btn-primary">
            🔍 CHECK
          </button>
        </form>

        <div id="balanceResults"></div>
      </div>
    </div>
  `;

  setupResourceForms();
}

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
    if (!validateEthereumAddress(to)) {
      showToast('Invalid recipient address format', 'error');
      return;
    }

    setLoading(true, 'Minting resources...');

    try {
      const weiAmount = parseResourceAmount(amount);

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
    if (!validateEthereumAddress(address)) {
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

// === Celestial Bodies Implementation ===

// ABI cache for ethers.js contract interaction
const abiCache = new Map();

// Celestial body metadata with scientific descriptions and auto-suggest presets
const CELESTIAL_BODY_METADATA = {
  'TITAN': {
    bodyType: 'moon',
    description: "Saturn's largest moon with methane lakes and nitrogen atmosphere",
    imageUrl: 'https://via.placeholder.com/300x200/FF8C00/FFFFFF?text=TITAN',
    scientificFacts: 'Surface temperature: -179°C, Diameter: 5,150 km',
    suggestedEmissions: [
      { resourceSymbol: 'CH4', ratePerSecond: '1.0', reason: 'Methane-rich atmosphere and liquid methane lakes' },
      { resourceSymbol: 'N2', ratePerSecond: '0.5', reason: 'Nitrogen-rich atmosphere (95% N2)' }
    ]
  },
  'EUROPA': {
    bodyType: 'moon',
    description: "Jupiter's ice-covered moon with vast subsurface ocean",
    imageUrl: 'https://via.placeholder.com/300x200/4169E1/FFFFFF?text=EUROPA',
    scientificFacts: 'Subsurface ocean depth: ~100 km, Ice crust: 15-25 km',
    suggestedEmissions: [
      { resourceSymbol: 'H2O', ratePerSecond: '0.5', reason: 'Vast subsurface ocean beneath ice crust' },
      { resourceSymbol: 'O2', ratePerSecond: '0.25', reason: 'Oxygen from water ice electrolysis' }
    ]
  },
  'MARS': {
    bodyType: 'planet',
    description: "The Red Planet with polar ice caps and ancient riverbeds",
    imageUrl: 'https://via.placeholder.com/300x200/CD5C5C/FFFFFF?text=MARS',
    scientificFacts: 'Atmosphere: 95% CO2, Gravity: 0.38g, Distance from Sun: 228M km',
    suggestedEmissions: [
      { resourceSymbol: 'CO2', ratePerSecond: '2.0', reason: 'Thin CO2-rich atmosphere' },
      { resourceSymbol: 'H2O', ratePerSecond: '0.1', reason: 'Polar ice caps and subsurface ice' }
    ]
  },
  'VENUS': {
    bodyType: 'planet',
    description: "Scorching planet with thick CO2 atmosphere and sulfuric acid clouds",
    imageUrl: 'https://via.placeholder.com/300x200/FFA500/FFFFFF?text=VENUS',
    scientificFacts: 'Surface temp: 464°C, Pressure: 92 bar, Atmosphere: 96.5% CO2',
    suggestedEmissions: [
      { resourceSymbol: 'CO2', ratePerSecond: '5.0', reason: 'Extremely dense CO2 atmosphere' },
      { resourceSymbol: 'N2', ratePerSecond: '0.1', reason: 'Trace nitrogen in atmosphere (3.5%)' }
    ]
  },
  'ENCELADUS': {
    bodyType: 'moon',
    description: "Saturn's moon with active water geysers from subsurface ocean",
    imageUrl: 'https://via.placeholder.com/300x200/87CEEB/FFFFFF?text=ENCELADUS',
    scientificFacts: 'Geyser plumes: 250 kg/s, Ocean depth: ~10 km',
    suggestedEmissions: [
      { resourceSymbol: 'H2O', ratePerSecond: '0.3', reason: 'Active water geysers from south pole' }
    ]
  },
  'CERES': {
    bodyType: 'dwarf-planet',
    description: "Largest asteroid belt object with water ice deposits",
    imageUrl: 'https://via.placeholder.com/300x200/808080/FFFFFF?text=CERES',
    scientificFacts: 'Diameter: 940 km, Water ice: ~25% by mass',
    suggestedEmissions: [
      { resourceSymbol: 'H2O', ratePerSecond: '0.05', reason: 'Water ice deposits (25% by mass)' }
    ]
  }
};

/**
 * Get contract ABI from backend (with caching)
 * @param {string} contractName - Contract name (e.g., 'CelestialBody')
 * @returns {Promise<Array>} Contract ABI
 */
async function getContractABI(contractName) {
  if (abiCache.has(contractName)) {
    return abiCache.get(contractName);
  }

  const response = await fetch(`${API_BASE}/abis/${contractName}`);
  if (!response.ok) {
    throw new Error(`Failed to load ABI for ${contractName}`);
  }

  const abiJSON = await response.json();
  abiCache.set(contractName, abiJSON.abi);
  return abiJSON.abi;
}

/**
 * Get celestial body emissions from blockchain
 * @param {string} bodyAddress - Celestial body contract address
 * @returns {Promise<Array>} Emission profiles
 */
async function getCelestialBodyEmissions(bodyAddress) {
  try {
    const abi = await getContractABI('CelestialBody');
    const provider = new ethers.providers.JsonRpcProvider(window.location.origin.replace(/:\d+/, ':8545'));
    const contract = new ethers.Contract(bodyAddress, abi, provider);

    const data = await contract.getCelestialBodyData();

    // Convert emissions to readable format with resource symbols
    const emissions = [];
    for (const emission of data.emissions) {
      // Find resource symbol from address
      const resource = RESOURCE_METADATA.find(r => r.address.toLowerCase() === emission.resourceToken.toLowerCase());
      if (resource && emission.isActive) {
        emissions.push({
          resourceSymbol: resource.symbol,
          resourceAddress: emission.resourceToken,
          ratePerSecond: emission.ratePerSecond.toString(),
          isActive: emission.isActive
        });
      }
    }

    return emissions;
  } catch (error) {
    console.error('Failed to load emissions:', error);
    return [];
  }
}

/**
 * Add resource to celestial body emission profile
 * @param {string} name - Body name
 * @param {string} resourceSymbol - Resource symbol
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

/**
 * Format emission rate for display
 * @param {string} ratePerSecond - Rate in wei per second
 * @returns {string} Human-readable rate
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
 * @param {Object} body - Body object
 * @param {Array} emissions - Emission profiles
 * @returns {string} HTML for body card
 */
function renderBodyCard(body, emissions) {
  const metadata = CELESTIAL_BODY_METADATA[body.name] || {};
  const description = metadata.description || `${body.bodyType} body`;
  const imageUrl = metadata.imageUrl || 'https://via.placeholder.com/300x200/4A5568/FFFFFF?text=' + body.name;

  const emissionsHTML = emissions && emissions.length > 0
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
      <div style="margin-bottom: 12px;">
        <img src="${imageUrl}" alt="${body.name}"
             style="width: 100%; height: 120px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;"
             onerror="this.style.display='none'">
      </div>
      <div class="data-card-title">${body.name}</div>
      <div class="data-card-value">${typeEmoji} ${body.bodyType}</div>
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; line-height: 1.4;">
        ${description}
      </div>
      <div class="data-card-meta mono" style="font-size: 10px; margin-top: 8px;">${formatAddress(body.address)}</div>
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
 * @param {Map} emissionsMap - Map of body name to emissions
 * @returns {string} HTML for bodies grid
 */
function renderBodiesGrid(bodies, emissionsMap) {
  if (bodies.length === 0) {
    return `
      <div class="form-panel" style="text-align: center; padding: 40px;">
        <p style="color: var(--text-muted); margin-bottom: 20px;">
          No celestial bodies registered yet. Create your first body above.
        </p>
      </div>
    `;
  }

  const bodyCards = bodies.map(body => {
    const emissions = emissionsMap.get(body.name) || [];
    return renderBodyCard(body, emissions);
  }).join('');

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
            <select class="form-input" name="bodyName" id="emissionBodySelect" required>
              <option value="">-- Select Body --</option>
              ${bodyOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Resource</label>
            <select class="form-input" name="resourceSymbol" id="emissionResourceSelect" required>
              <option value="">-- Select Resource --</option>
              ${resourceOptions}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Rate (kg/second)</label>
            <input type="number" class="form-input" name="rate" id="emissionRateInput"
                   placeholder="1.0" min="0.0001" max="1000" step="0.0001" required>
            <small class="form-help">1.0 kg/s = 86,400 kg/day</small>
          </div>
        </div>
        <div id="autoSuggestHint" style="display: none; margin-bottom: 16px; padding: 12px; background: rgba(78, 232, 196, 0.1); border-left: 3px solid var(--accent-teal); font-size: 12px;">
          <strong>💡 Suggestion:</strong> <span id="autoSuggestText"></span>
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

  if (ships.length === 0) {
    return `
      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          HARVEST RESOURCES TO SHIP
        </h2>
        <p style="color: var(--text-muted); text-align: center; padding: 20px;">
          No ships available. Create ships in the SHIPS tab first.
        </p>
      </div>
    `;
  }

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
 * @param {Map} emissionsMap - Map of body name to emissions
 */
function renderCelestialBodiesPage(container, bodies, ships, emissionsMap) {
  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">CELESTIAL BODIES</h1>
      <p class="section-description">
        Manage celestial bodies as resource faucets. Create bodies, configure emission profiles, and harvest resources to ships.
      </p>

      ${renderCreateBodySection()}
      ${renderBodiesGrid(bodies, emissionsMap)}
      ${renderAddEmissionSection(bodies)}
      ${renderHarvestSection(bodies, ships)}
    </div>
  `;
}

/**
 * Handle create body form submission
 * @param {Event} e - Form submit event
 */
async function handleCreateBody(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const name = formData.get('name').toUpperCase().trim();
  const bodyType = formData.get('bodyType');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  // Validate
  const errors = validateBodyCreation(name, bodyType);
  if (errors.length > 0) {
    showToast(errors.join('; '), 'error', 'VALIDATION ERROR');
    return;
  }

  // Disable button
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'CREATING...';

  setLoading(true, 'Creating celestial body...');

  try {
    const result = await createCelestialBody({ name, bodyType });
    showToast(`Created ${name}`, 'success', 'BODY CREATED');

    // Reset form
    e.target.reset();

    // Refresh UI
    const container = document.getElementById('mainContent');
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
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
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
  const submitBtn = e.target.querySelector('button[type="submit"]');

  // Validate
  const errors = validateEmissionRate(rate);
  if (errors.length > 0) {
    showToast(errors.join('; '), 'error', 'VALIDATION ERROR');
    return;
  }

  // Convert rate to wei
  const ratePerSecond = parseResourceAmount(rate);

  // Disable button
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'ADDING...';

  setLoading(true, 'Adding resource to emission profile...');

  try {
    await addResourceToBody(bodyName, resourceSymbol, ratePerSecond);

    showToast(
      `Added ${resourceSymbol} to ${bodyName} (${formatEmissionRate(ratePerSecond)})`,
      'success',
      'EMISSION ADDED'
    );

    // Reset form
    e.target.reset();
    document.getElementById('autoSuggestHint').style.display = 'none';

    // Refresh UI
    const container = document.getElementById('mainContent');
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
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
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
  const submitBtn = e.target.querySelector('button[type="submit"]');

  // Validate amount
  if (!amount || parseFloat(amount) <= 0) {
    showToast('Amount must be greater than 0', 'error', 'VALIDATION ERROR');
    return;
  }

  // Convert to wei
  const weiAmount = parseResourceAmount(amount);

  // Disable button
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'HARVESTING...';

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
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}

/**
 * Setup auto-suggest for emission form
 */
function setupAutoSuggest() {
  const bodySelect = document.getElementById('emissionBodySelect');
  const resourceSelect = document.getElementById('emissionResourceSelect');
  const rateInput = document.getElementById('emissionRateInput');
  const hint = document.getElementById('autoSuggestHint');
  const hintText = document.getElementById('autoSuggestText');

  if (!bodySelect || !resourceSelect || !rateInput || !hint || !hintText) {
    return;
  }

  function updateSuggestion() {
    const bodyName = bodySelect.value;
    const resourceSymbol = resourceSelect.value;

    if (!bodyName || !resourceSymbol) {
      hint.style.display = 'none';
      return;
    }

    const metadata = CELESTIAL_BODY_METADATA[bodyName];
    if (!metadata || !metadata.suggestedEmissions) {
      hint.style.display = 'none';
      return;
    }

    const suggestion = metadata.suggestedEmissions.find(e => e.resourceSymbol === resourceSymbol);
    if (suggestion) {
      hintText.textContent = `${suggestion.reason}. Suggested rate: ${suggestion.ratePerSecond} kg/s (${formatEmissionRate(parseResourceAmount(suggestion.ratePerSecond))})`;
      hint.style.display = 'block';

      // Auto-fill if empty
      if (!rateInput.value) {
        rateInput.value = suggestion.ratePerSecond;
      }
    } else {
      hint.style.display = 'none';
    }
  }

  bodySelect.addEventListener('change', updateSuggestion);
  resourceSelect.addEventListener('change', updateSuggestion);
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

  setupAutoSuggest();
}

/**
 * Load Celestial Bodies UI
 * Entry point for the Celestial Bodies page
 * @param {HTMLElement} container - Container element
 */
async function loadCelestialBodiesUI(container) {
  setLoading(true, 'Loading celestial bodies...');

  try {
    // Fetch bodies and ships in parallel
    const [bodiesResult, shipsResult] = await Promise.allSettled([
      listCelestialBodies(),
      listShips()
    ]);

    const bodies = bodiesResult.status === 'fulfilled' ? bodiesResult.value : [];
    const ships = shipsResult.status === 'fulfilled' ? shipsResult.value : [];

    // Show warnings for failures
    if (bodiesResult.status === 'rejected') {
      showToast('Failed to load celestial bodies', 'error');
    }
    if (shipsResult.status === 'rejected') {
      showToast('Failed to load ships list', 'warning');
    }

    // Load emissions from blockchain for each body
    const emissionsMap = new Map();
    for (const body of bodies) {
      try {
        const emissions = await getCelestialBodyEmissions(body.address);
        emissionsMap.set(body.name, emissions);
      } catch (error) {
        console.error(`Failed to load emissions for ${body.name}:`, error);
        emissionsMap.set(body.name, []);
      }
    }

    renderCelestialBodiesPage(container, bodies, ships, emissionsMap);
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

// === Init ===
async function init() {
  console.log('APP: Initializing...');

  try {
    const health = await getHealth();
    document.getElementById('chainStatus').textContent = `${health.chainUrl} (ID: ${health.chainId})`;

    // FIX: Store full address in data attribute for API calls
    const adminAddressElement = document.getElementById('adminAddress');
    const fullAdminAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    adminAddressElement.textContent = formatAddress(fullAdminAddress);
    adminAddressElement.dataset.fullAddress = fullAdminAddress;
  } catch (error) {
    console.error('Health check failed:', error);
    document.getElementById('chainStatus').textContent = 'Connection failed';
  }

  // Tab navigation
  const tabs = document.querySelectorAll('.sidebar-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTabContent(tab.dataset.tab);
    });
  });

  loadTabContent('deploy');
  console.log('APP: Ready!');
}

function loadTabContent(tabName) {
  const content = document.getElementById('mainContent');

  switch (tabName) {
    case 'deploy':
      loadDeployUI(content);
      break;
    case 'ships':
      loadShipsUI(content);
      break;
    case 'resources':
      loadResourcesUI(content);
      break;
    case 'bodies':
      loadCelestialBodiesUI(content);
      break;
  }
}

document.addEventListener('DOMContentLoaded', init);
