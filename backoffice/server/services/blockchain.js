// server/services/blockchain.js
import { ethers } from 'ethers';
import config from '../config.js';

let provider = null;
let signer = null;

/**
 * Initialize provider and signer
 * Call this before using getProvider() or getSigner()
 */
export function initializeBlockchain() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.chainUrl);
  }

  if (!signer && config.adminPrivateKey) {
    signer = new ethers.Wallet(config.adminPrivateKey, provider);
  }

  return { provider, signer };
}

/**
 * Get the JSON-RPC provider
 */
export function getProvider() {
  if (!provider) {
    initializeBlockchain();
  }
  return provider;
}

/**
 * Get the admin signer
 */
export function getSigner() {
  if (!signer) {
    initializeBlockchain();
  }
  return signer;
}

/**
 * Reset connections (for testing)
 */
export function resetBlockchain() {
  provider = null;
  signer = null;
}
