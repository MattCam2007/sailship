// server/services/validation.js

/**
 * Validate Ethereum address
 */
export function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate ship minting parameters
 */
export function validateShipParams(params) {
  const errors = [];

  if (!params.to || !isValidAddress(params.to)) {
    errors.push('Invalid recipient address');
  }

  if (!params.className || typeof params.className !== 'string' || params.className.trim() === '') {
    errors.push('className is required');
  }

  if (typeof params.mass !== 'number' || params.mass <= 0) {
    errors.push('mass must be a positive number');
  }

  if (typeof params.sailArea !== 'number' || params.sailArea <= 0) {
    errors.push('sailArea must be a positive number');
  }

  if (typeof params.sailReflectivity !== 'number' || params.sailReflectivity < 0 || params.sailReflectivity > 10000) {
    errors.push('sailReflectivity must be between 0 and 10000 (basis points)');
  }

  if (typeof params.maxSailCount !== 'number' || params.maxSailCount <= 0 || !Number.isInteger(params.maxSailCount)) {
    errors.push('maxSailCount must be a positive integer');
  }

  if (typeof params.cargoCapacity !== 'number' || params.cargoCapacity < 0) {
    errors.push('cargoCapacity must be a non-negative number');
  }

  return errors;
}

/**
 * Validate token ID
 */
export function validateTokenId(tokenId) {
  const parsed = parseInt(tokenId);
  if (isNaN(parsed) || parsed < 0) {
    return { valid: false, error: 'tokenId must be a non-negative integer' };
  }
  return { valid: true, value: parsed };
}

/**
 * Validate resource minting parameters
 */
export function validateResourceMintParams(params) {
  const errors = [];
  const validSymbols = ['CH4', 'O2', 'H2O', 'CO2', 'N2'];

  if (!params.resourceSymbol || !validSymbols.includes(params.resourceSymbol)) {
    errors.push(`resourceSymbol must be one of: ${validSymbols.join(', ')}`);
  }

  if (!params.to || !isValidAddress(params.to)) {
    errors.push('Invalid recipient address');
  }

  if (!params.amount || typeof params.amount !== 'string') {
    errors.push('amount must be a string (in wei units with 18 decimals)');
  }

  return errors;
}

/**
 * Validate celestial body creation parameters
 */
export function validateCelestialBodyParams(params) {
  const errors = [];
  const validTypes = ['planet', 'moon', 'asteroid'];

  if (!params.name || typeof params.name !== 'string' || params.name.trim() === '') {
    errors.push('name is required');
  }

  if (!params.bodyType || !validTypes.includes(params.bodyType)) {
    errors.push(`bodyType must be one of: ${validTypes.join(', ')}`);
  }

  return errors;
}
