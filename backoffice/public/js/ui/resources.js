// js/ui/resources.js
// Resource management UI

import { mintResource, getResourceBalances } from '../api.js';
import { showToast, setLoading, formatAddress, formatTokenAmount, parseTokenAmount } from '../utils.js';

const RESOURCE_METADATA = [
  { symbol: 'CH4', name: 'Methane', decimals: 18 },
  { symbol: 'O2', name: 'Oxygen', decimals: 18 },
  { symbol: 'H2O', name: 'Water', decimals: 18 },
  { symbol: 'CO2', name: 'Carbon Dioxide', decimals: 18 },
  { symbol: 'N2', name: 'Nitrogen', decimals: 18 }
];

export function loadResourcesUI(container) {
  container.innerHTML = `
    <div class="content-section">
      <h1 class="section-title">RESOURCE MANAGEMENT</h1>
      <p class="section-description">
        Mint resources (CH4, O2, H2O, CO2, N2) to Token Bound Accounts or any address.
        Resources are ERC-20 tokens with 18 decimals.
      </p>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          RESOURCE TOKENS
        </h2>

        <div id="resourceTokens"></div>
      </div>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          MINT RESOURCES
        </h2>

        <form id="mintResourceForm">
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
              <label class="form-label">Recipient Address (TBA or Wallet)</label>
              <input type="text" class="form-input" name="to"
                     placeholder="0x..." required>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Amount (in tokens, will be converted to wei)</label>
            <input type="number" class="form-input" name="amount"
                   placeholder="1000" min="0" step="0.000000000000000001" required>
            <small class="text-muted">Example: 1000 = 1000000000000000000000 wei (18 decimals)</small>
          </div>

          <button type="submit" class="btn btn-primary">
            ⚗️ MINT RESOURCES
          </button>
        </form>
      </div>

      <div class="form-panel">
        <h2 style="font-family: 'Orbitron', sans-serif; font-size: 14px; margin-bottom: 20px; color: var(--accent-teal);">
          CHECK BALANCES
        </h2>

        <form id="checkBalancesForm" style="display: flex; gap: 12px; align-items: end;">
          <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <label class="form-label">Address (TBA or Wallet)</label>
            <input type="text" class="form-input" name="address"
                   placeholder="0x..." required>
          </div>
          <button type="submit" class="btn btn-primary">
            🔍 CHECK BALANCES
          </button>
        </form>

        <div id="balanceResults" class="mt-3"></div>
      </div>
    </div>
  `;

  setupResourceForms();
  displayResourceMetadata();
}

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
        amount: parseTokenAmount(formData.get('amount'), 18)
      };

      const result = await mintResource(params);

      showToast(\`Minted \${formData.get('amount')} \${result.symbol} to \${formatAddress(result.to)}\`, 'success', 'RESOURCES MINTED');
      mintForm.reset();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  });

  // Check balances form
  const balancesForm = document.getElementById('checkBalancesForm');
  balancesForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    setLoading(true, 'Fetching balances...');

    try {
      const formData = new FormData(balancesForm);
      const address = formData.get('address');

      const result = await getResourceBalances(address);
      displayBalances(result);
    } catch (error) {
      showToast(error.message, 'error');
      document.getElementById('balanceResults').innerHTML = '';
    } finally {
      setLoading(false);
    }
  });
}

async function displayResourceMetadata() {
  const container = document.getElementById('resourceTokens');

  setLoading(true, 'Loading resource metadata...');

  try {
    // Fetch balances for a dummy address to get contract addresses
    // Use the admin address from the DOM
    const adminAddressElement = document.getElementById('adminAddress');
    const adminAddress = adminAddressElement?.dataset.fullAddress;

    if (!adminAddress) {
      container.innerHTML = '<p class="text-muted">Unable to load resource metadata. Please refresh the page.</p>';
      return;
    }

    const data = await getResourceBalances(adminAddress);

    if (!data || !data.balances || data.balances.length === 0) {
      container.innerHTML = '<p class="text-muted">No resource tokens found.</p>';
      return;
    }

    const resourcesHTML = data.balances.map(r => \`
      <tr>
        <td><strong>\${r.symbol}</strong></td>
        <td>\${r.name}</td>
        <td>\${r.decimals}</td>
        <td class="mono text-muted">\${formatAddress(r.address)}</td>
      </tr>
    \`).join('');

    container.innerHTML = \`
      <table class="data-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Decimals</th>
            <th>Contract Address</th>
          </tr>
        </thead>
        <tbody>
          \${resourcesHTML}
        </tbody>
      </table>
    \`;
  } catch (error) {
    console.error('Failed to load resource metadata:', error);
    container.innerHTML = '<p class="text-muted">Failed to load resource metadata. Check console for details.</p>';
    showToast(error.message, 'error');
  } finally {
    setLoading(false);
  }
}

function displayBalances(data) {
  const container = document.getElementById('balanceResults');

  const balancesHTML = data.balances.map(b => \`
    <tr>
      <td><strong>\${b.symbol}</strong></td>
      <td>\${b.name}</td>
      <td class="mono">\${formatTokenAmount(b.balance, b.decimals, 4)}</td>
      <td class="mono text-muted">\${formatAddress(b.address)}</td>
    </tr>
  \`).join('');

  container.innerHTML = \`
    <div style="background: rgba(78, 232, 196, 0.05); border: 1px solid var(--accent-teal); padding: 20px; margin-top: 20px;">
      <h3 style="font-family: 'Orbitron', sans-serif; font-size: 14px; color: var(--text-secondary); margin-bottom: 12px;">
        ADDRESS: <span class="mono text-primary">\${formatAddress(data.address)}</span>
      </h3>

      <table class="data-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Name</th>
            <th>Balance</th>
            <th>Token Address</th>
          </tr>
        </thead>
        <tbody>
          \${balancesHTML || '<tr><td colspan="4" class="text-muted">No balances</td></tr>'}
        </tbody>
      </table>
    </div>
  \`;
}
