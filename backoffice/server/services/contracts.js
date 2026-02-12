// server/services/contracts.js
import { ethers } from 'ethers';
import { getSigner } from './blockchain.js';
import config from '../config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Load ABI from public/abis directory
 */
function loadABI(contractName) {
  try {
    const abiPath = join(__dirname, '../../public/abis', `${contractName}.json`);
    const abiJSON = JSON.parse(readFileSync(abiPath, 'utf8'));
    return abiJSON.abi;
  } catch (error) {
    throw new Error(`Failed to load ABI for ${contractName}: ${error.message}`);
  }
}

/**
 * Get a contract instance
 */
export function getContract(contractName, address) {
  const abi = loadABI(contractName);
  const signer = getSigner();

  if (!address) {
    throw new Error(`No address configured for ${contractName}`);
  }

  return new ethers.Contract(address, abi, signer);
}

/**
 * Get GameRegistry contract instance
 */
export function getGameRegistry() {
  return getContract('GameRegistry', config.contracts.gameRegistry);
}

/**
 * Get ShipNFT contract instance
 */
export function getShipNFT() {
  return getContract('ShipNFT', config.contracts.shipNFT);
}

/**
 * Get CelestialBodyRegistry contract instance
 */
export function getCelestialBodyRegistry() {
  return getContract('CelestialBodyRegistry', config.contracts.celestialBodyRegistry);
}

/**
 * Get ResourceToken contract instance by symbol
 */
export function getResourceToken(symbol) {
  const address = config.contracts.resources[symbol];
  if (!address) {
    throw new Error(`No address configured for resource token ${symbol}`);
  }
  return getContract('ResourceToken', address);
}

/**
 * Get CelestialBody contract instance by address
 */
export function getCelestialBody(address) {
  return getContract('CelestialBody', address);
}
