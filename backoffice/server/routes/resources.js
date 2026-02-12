// server/routes/resources.js
import express from 'express';
import { getResourceToken } from '../services/contracts.js';
import { validateResourceMintParams, isValidAddress } from '../services/validation.js';
import config from '../config.js';

const router = express.Router();

/**
 * POST /api/resources/mint
 * Mint resources to an address (typically a TBA)
 */
router.post('/mint', async (req, res, next) => {
  try {
    const params = req.body;
    const errors = validateResourceMintParams(params);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    const tokenAddress = config.contracts.resources[params.resourceSymbol];
    if (!tokenAddress) {
      return res.status(503).json({ error: `${params.resourceSymbol} token not deployed yet` });
    }

    const token = getResourceToken(params.resourceSymbol);

    const tx = await token.mint(params.to, params.amount);
    const receipt = await tx.wait();

    res.json({
      symbol: params.resourceSymbol,
      to: params.to,
      amount: params.amount,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/resources/balances/:address
 * Get all resource token balances for an address
 */
router.get('/balances/:address', async (req, res, next) => {
  try {
    const address = req.params.address;

    if (!isValidAddress(address)) {
      return res.status(400).json({ error: 'Invalid Ethereum address' });
    }

    const resourceSymbols = ['CH4', 'O2', 'H2O', 'CO2', 'N2'];
    const balances = [];

    for (const symbol of resourceSymbols) {
      try {
        if (config.contracts.resources[symbol]) {
          const token = getResourceToken(symbol);
          const balance = await token.balanceOf(address);
          const name = await token.name();
          const decimals = await token.decimals();

          balances.push({
            symbol,
            name,
            balance: balance.toString(),
            decimals: decimals.toString(),
            address: config.contracts.resources[symbol]
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch balance for ${symbol}:`, error.message);
      }
    }

    res.json({
      address,
      balances
    });
  } catch (error) {
    next(error);
  }
});

export default router;
