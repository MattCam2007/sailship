// server/routes/ships.js
import express from 'express';
import { getShipNFT, getResourceToken } from '../services/contracts.js';
import { validateShipParams, validateTokenId } from '../services/validation.js';
import config from '../config.js';

const router = express.Router();

/**
 * POST /api/ships/mint
 * Mint a new ship NFT
 */
router.post('/mint', async (req, res, next) => {
  try {
    const params = req.body;
    const errors = validateShipParams(params);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    // Check if ShipNFT contract is configured
    if (!config.contracts.shipNFT) {
      return res.status(503).json({ error: 'ShipNFT contract not deployed yet' });
    }

    const shipNFT = getShipNFT();

    console.log('[DEBUG] Minting ship for:', params.to);

    // Send the transaction
    const tx = await shipNFT.mintShip(
      params.to,
      params.className,
      params.mass,
      params.sailArea,
      params.sailReflectivity,
      params.maxSailCount,
      params.cargoCapacity
    );

    console.log('[DEBUG] Transaction sent:', tx.hash);

    const receipt = await tx.wait();
    console.log('[DEBUG] Transaction mined in block:', receipt.blockNumber);

    // Extract tokenId from ShipMinted event
    let tokenId = null;
    for (const log of receipt.logs) {
      try {
        // Parse the log using the contract interface (ethers.js v6 syntax)
        const parsed = shipNFT.interface.parseLog(log);

        if (parsed && parsed.name === 'ShipMinted') {
          // Extract tokenId from the event args
          tokenId = parsed.args.tokenId.toString();
          break;
        }
      } catch (error) {
        // Skip logs that aren't from our contract
        continue;
      }
    }

    if (!tokenId) {
      throw new Error('ShipMinted event not found in transaction receipt');
    }

    res.json({
      tokenId,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ships/:tokenId
 * Get ship stats by token ID
 */
router.get('/:tokenId', async (req, res, next) => {
  try {
    const validation = validateTokenId(req.params.tokenId);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    if (!config.contracts.shipNFT) {
      return res.status(503).json({ error: 'ShipNFT contract not deployed yet' });
    }

    const shipNFT = getShipNFT();
    const stats = await shipNFT.getShipStats(validation.value);

    res.json({
      tokenId: validation.value,
      stats: {
        mass: stats.mass.toString(),
        sailArea: stats.sailArea.toString(),
        sailReflectivity: stats.sailReflectivity.toString(),
        maxSailCount: stats.maxSailCount.toString(),
        cargoCapacity: stats.cargoCapacity.toString(),
        className: stats.className,
        condition: stats.condition.toString()
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ships/:tokenId/tba
 * Get Token Bound Account address and balances
 */
router.get('/:tokenId/tba', async (req, res, next) => {
  try {
    const validation = validateTokenId(req.params.tokenId);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    if (!config.contracts.shipNFT) {
      return res.status(503).json({ error: 'ShipNFT contract not deployed yet' });
    }

    const shipNFT = getShipNFT();
    const tbaAddress = await shipNFT.getShipTBA(validation.value);

    // Get balances for all resource tokens
    const resourceSymbols = ['CH4', 'O2', 'H2O', 'CO2', 'N2'];
    const balances = [];

    for (const symbol of resourceSymbols) {
      try {
        if (config.contracts.resources[symbol]) {
          const token = getResourceToken(symbol);
          const balance = await token.balanceOf(tbaAddress);
          balances.push({
            symbol,
            balance: balance.toString(),
            address: config.contracts.resources[symbol]
          });
        }
      } catch (error) {
        console.warn(`Failed to fetch balance for ${symbol}:`, error.message);
      }
    }

    res.json({
      tbaAddress,
      balances
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ships
 * List all ships (for a given owner, or all if no owner specified)
 */
router.get('/', async (req, res, next) => {
  try {
    if (!config.contracts.shipNFT) {
      return res.status(503).json({ error: 'ShipNFT contract not deployed yet' });
    }

    const shipNFT = getShipNFT();
    const owner = req.query.owner;

    if (owner) {
      // Get ships for specific owner
      console.log('[DEBUG] Fetching ships for owner:', owner);

      const balance = await shipNFT.balanceOf(owner);
      console.log('[DEBUG] Owner balance:', balance.toString());

      const ships = [];

      for (let i = 0; i < Number(balance); i++) {
        console.log('[DEBUG] Fetching token at index:', i);
        const tokenId = await shipNFT.tokenOfOwnerByIndex(owner, i);
        console.log('[DEBUG] Token ID:', tokenId.toString());

        const stats = await shipNFT.getShipStats(tokenId);
        ships.push({
          tokenId: tokenId.toString(),
          stats: {
            mass: stats.mass.toString(),
            sailArea: stats.sailArea.toString(),
            sailReflectivity: stats.sailReflectivity.toString(),
            maxSailCount: stats.maxSailCount.toString(),
            cargoCapacity: stats.cargoCapacity.toString(),
            className: stats.className,
            condition: stats.condition.toString()
          }
        });
      }

      console.log('[DEBUG] Total ships fetched:', ships.length);
      console.log('[DEBUG] Ship token IDs:', ships.map(s => s.tokenId).join(', '));

      // Prevent caching of ship list data
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');

      return res.json(ships);
    }

    // If no owner specified, return empty array for now
    // (In production, you'd implement enumeration or use The Graph)
    res.json([]);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ships/:tokenId/zone
 * Set a ship's zone (admin only)
 */
router.post('/:tokenId/zone', async (req, res, next) => {
  try {
    const validation = validateTokenId(req.params.tokenId);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const { zone } = req.body;
    if (zone === undefined || zone < 0) {
      return res.status(400).json({ error: 'zone must be a non-negative integer' });
    }

    const shipNFT = getShipNFT();
    const tx = await shipNFT.setShipZone(validation.value, zone);
    const receipt = await tx.wait();

    res.json({
      tokenId: validation.value,
      zone,
      txHash: receipt.hash
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ships/zones/batch
 * Batch update ship zones (admin only)
 */
router.post('/zones/batch', async (req, res, next) => {
  try {
    const { shipIds, zones } = req.body;

    if (!Array.isArray(shipIds) || !Array.isArray(zones)) {
      return res.status(400).json({ error: 'shipIds and zones must be arrays' });
    }
    if (shipIds.length !== zones.length) {
      return res.status(400).json({ error: 'shipIds and zones must have the same length' });
    }

    const shipNFT = getShipNFT();
    const tx = await shipNFT.setShipZoneBatch(shipIds, zones);
    const receipt = await tx.wait();

    res.json({
      updated: shipIds.length,
      txHash: receipt.hash
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/ships/nearby
 * Set proximity between two ships (admin only)
 */
router.post('/nearby', async (req, res, next) => {
  try {
    const { shipA, shipB, nearby } = req.body;

    if (!shipA || !shipB) {
      return res.status(400).json({ error: 'shipA and shipB are required' });
    }
    if (typeof nearby !== 'boolean') {
      return res.status(400).json({ error: 'nearby must be a boolean' });
    }

    const shipNFT = getShipNFT();
    const tx = await shipNFT.setNearby(shipA, shipB, nearby);
    const receipt = await tx.wait();

    res.json({
      shipA,
      shipB,
      nearby,
      txHash: receipt.hash
    });
  } catch (error) {
    next(error);
  }
});

export default router;
