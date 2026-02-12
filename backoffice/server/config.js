// server/config.js
import dotenv from 'dotenv';

dotenv.config();

const config = {
  chainUrl: process.env.CHAIN_URL || 'http://localhost:8545',
  chainId: parseInt(process.env.CHAIN_ID || '1337'),
  adminPrivateKey: process.env.ADMIN_PRIVATE_KEY,
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  contracts: {
    gameRegistry: process.env.GAME_REGISTRY_ADDRESS || '',
    shipNFT: process.env.SHIP_NFT_ADDRESS || '',
    celestialBodyRegistry: process.env.CELESTIAL_BODY_REGISTRY_ADDRESS || '',
    resources: {
      CH4: process.env.CH4_TOKEN_ADDRESS || '',
      O2: process.env.O2_TOKEN_ADDRESS || '',
      H2O: process.env.H2O_TOKEN_ADDRESS || '',
      CO2: process.env.CO2_TOKEN_ADDRESS || '',
      N2: process.env.N2_TOKEN_ADDRESS || ''
    }
  }
};

// Validation
if (!config.adminPrivateKey && config.nodeEnv !== 'test') {
  console.warn('Warning: ADMIN_PRIVATE_KEY not set. Deployment and transactions will fail.');
}

export default config;
