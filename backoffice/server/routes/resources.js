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

/**
 * POST /api/resources/:symbol/register-tank
 * Register a storage tank for a resource token (admin only)
 */
router.post('/:symbol/register-tank', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { tankAddress, status } = req.body;

    if (!isValidAddress(tankAddress)) {
      return res.status(400).json({ error: 'Invalid tank address' });
    }

    const token = getResourceToken(symbol);
    const tx = await token.registerTank(tankAddress, status !== false);
    const receipt = await tx.wait();

    res.json({
      symbol,
      tankAddress,
      registered: status !== false,
      txHash: receipt.hash
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/resources/:symbol/player-ship
 * Associate a player wallet with a ship for a resource token (admin only)
 */
router.post('/:symbol/player-ship', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { player, shipId } = req.body;

    if (!isValidAddress(player)) {
      return res.status(400).json({ error: 'Invalid player address' });
    }
    if (shipId === undefined || shipId < 0) {
      return res.status(400).json({ error: 'shipId must be a non-negative integer' });
    }

    const token = getResourceToken(symbol);
    const tx = await token.setPlayerShip(player, shipId);
    const receipt = await tx.wait();

    res.json({
      symbol,
      player,
      shipId,
      txHash: receipt.hash
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/resources/:symbol/burn
 * Burn resources from a tank (admin only — resource consumption)
 */
router.post('/:symbol/burn', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { tankAddress, amount } = req.body;

    if (!isValidAddress(tankAddress)) {
      return res.status(400).json({ error: 'Invalid tank address' });
    }
    if (!amount || typeof amount !== 'string') {
      return res.status(400).json({ error: 'amount must be a string (in wei)' });
    }

    const token = getResourceToken(symbol);
    const tx = await token.burnFrom(tankAddress, amount);
    const receipt = await tx.wait();

    res.json({
      symbol,
      tankAddress,
      amount,
      txHash: receipt.hash
    });
  } catch (error) {
    next(error);
  }
});

export default router;
