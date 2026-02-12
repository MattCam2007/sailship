// js/main.js
// Main entry point

import { getHealth } from './api.js';
import { formatAddress } from './utils.js';
import { loadDeployUI } from './ui/deploy.js';
import { loadShipsUI } from './ui/ships.js';
import { loadResourcesUI } from './ui/resources.js';
import { loadCelestialBodiesUI } from './ui/celestialBodies.js';

console.log('[MAIN] Module loaded');

// Initialize app
async function init() {
  console.log('[MAIN] Init starting...');
  
  // Load chain status
  try {
    const health = await getHealth();
    console.log('[MAIN] Health check:', health);
    document.getElementById('chainStatus').textContent = `${health.chainUrl} (ID: ${health.chainId})`;

    // For now, show placeholder for admin address
    // In production, this would fetch from wallet
    const adminAddressElement = document.getElementById('adminAddress');
    const fullAdminAddress = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    adminAddressElement.textContent = formatAddress(fullAdminAddress);
    // Store full address in data attribute for API calls
    adminAddressElement.dataset.fullAddress = fullAdminAddress;
  } catch (error) {
    console.error('[MAIN] Failed to fetch health:', error);
    document.getElementById('chainStatus').textContent = 'Connection failed';
    document.getElementById('chainStatus').className = 'status-value text-danger';
  }

  // Set up tab navigation
  const tabs = document.querySelectorAll('.sidebar-tab');
  console.log('[MAIN] Found tabs:', tabs.length);
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      console.log('[MAIN] Tab clicked:', tab.dataset.tab);
      
      // Update active state
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Load content
      const tabName = tab.dataset.tab;
      loadTabContent(tabName);
    });
  });

  // Load default tab (deploy)
  console.log('[MAIN] Loading default tab: deploy');
  loadTabContent('deploy');
}

/**
 * Load content for a specific tab
 */
function loadTabContent(tabName) {
  console.log('[MAIN] loadTabContent called:', tabName);
  const content = document.getElementById('mainContent');
  
  if (!content) {
    console.error('[MAIN] mainContent element not found!');
    return;
  }

  console.log('[MAIN] Loading content for tab:', tabName);

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
    default:
      content.innerHTML = '<p>Unknown tab</p>';
  }
  
  console.log('[MAIN] Content loaded for:', tabName);
}

// Start app when DOM is ready
console.log('[MAIN] Setting up DOMContentLoaded listener');
document.addEventListener('DOMContentLoaded', () => {
  console.log('[MAIN] DOMContentLoaded fired!');
  init();
});

// Also try immediate init if DOM already loaded
if (document.readyState === 'loading') {
  console.log('[MAIN] Document still loading, waiting for DOMContentLoaded');
} else {
  console.log('[MAIN] Document already loaded, calling init immediately');
  init();
}
