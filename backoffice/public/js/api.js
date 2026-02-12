// js/api.js
// API client for backend routes

const API_BASE = '/api';

/**
 * Fetch wrapper with error handling
 */
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

// ==================== SHIPS ====================

export async function mintShip(params) {
  return fetchAPI(`${API_BASE}/ships/mint`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function getShip(tokenId) {
  return fetchAPI(`${API_BASE}/ships/${tokenId}`);
}

export async function getShipTBA(tokenId) {
  return fetchAPI(`${API_BASE}/ships/${tokenId}/tba`);
}

export async function listShips(owner = null) {
  // Add cache-busting parameter to prevent browser caching
  const timestamp = Date.now();
  const url = owner
    ? `${API_BASE}/ships?owner=${owner}&_t=${timestamp}`
    : `${API_BASE}/ships?_t=${timestamp}`;
  return fetchAPI(url);
}

// ==================== RESOURCES ====================

export async function mintResource(params) {
  return fetchAPI(`${API_BASE}/resources/mint`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function getResourceBalances(address) {
  return fetchAPI(`${API_BASE}/resources/balances/${address}`);
}

// ==================== CELESTIAL BODIES ====================

export async function createCelestialBody(params) {
  return fetchAPI(`${API_BASE}/celestial-bodies/create`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function addResourceToBody(name, params) {
  return fetchAPI(`${API_BASE}/celestial-bodies/${name}/add-resource`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function harvestFromBody(name, params) {
  return fetchAPI(`${API_BASE}/celestial-bodies/${name}/harvest`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export async function listCelestialBodies() {
  return fetchAPI(`${API_BASE}/celestial-bodies`);
}

export async function getCelestialBody(name) {
  return fetchAPI(`${API_BASE}/celestial-bodies/${name}`);
}

// ==================== HEALTH ====================

export async function getHealth() {
  return fetchAPI('/health');
}
