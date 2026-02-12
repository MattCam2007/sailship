// server/routes/celestialBodies.js
import express from 'express';
import { getCelestialBodyRegistry, getCelestialBody, getShipNFT } from '../services/contracts.js';
import { validateCelestialBodyParams, validateTokenId, isValidAddress } from '../services/validation.js';
import config from '../config.js';

const router = express.Router();

/**
 * POST /api/celestial-bodies/create
 * Create a new celestial body
 */
router.post('/create', async (req, res, next) => {
  try {
    const params = req.body;
    const errors = validateCelestialBodyParams(params);

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    if (!config.contracts.celestialBodyRegistry) {
      return res.status(503).json({ error: 'CelestialBodyRegistry contract not deployed yet' });
    }

    const registry = getCelestialBodyRegistry();

    const tx = await registry.createCelestialBody(params.name, params.bodyType);
    const receipt = await tx.wait();

    // Get the newly created body's address
    const bodyAddress = await registry.getCelestialBody(params.name);

    res.json({
      name: params.name,
      bodyType: params.bodyType,
      address: bodyAddress,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/celestial-bodies/:name/add-resource
 * Add a resource to a celestial body's emission profile
 */
router.post('/:name/add-resource', async (req, res, next) => {
  try {
    const name = req.params.name;
    const { resourceSymbol, ratePerSecond } = req.body;

    if (!resourceSymbol || !['CH4', 'O2', 'H2O', 'CO2', 'N2'].includes(resourceSymbol)) {
      return res.status(400).json({ error: 'Invalid resourceSymbol' });
    }

    if (typeof ratePerSecond !== 'string') {
      return res.status(400).json({ error: 'ratePerSecond must be a string (wei units)' });
    }

    if (!config.contracts.celestialBodyRegistry) {
      return res.status(503).json({ error: 'CelestialBodyRegistry not deployed yet' });
    }

    const registry = getCelestialBodyRegistry();
    const bodyAddress = await registry.getCelestialBody(name);

    if (bodyAddress === '0x0000000000000000000000000000000000000000') {
      return res.status(404).json({ error: `Celestial body '${name}' not found` });
    }

    const body = getCelestialBody(bodyAddress);
    const resourceAddress = config.contracts.resources[resourceSymbol];

    if (!resourceAddress) {
      return res.status(503).json({ error: `${resourceSymbol} token not deployed yet` });
    }

    const tx = await body.addResource(resourceAddress, ratePerSecond);
    const receipt = await tx.wait();

    res.json({
      name,
      resourceSymbol,
      resourceAddress,
      ratePerSecond,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/celestial-bodies/:name/harvest
 * Harvest resources from a celestial body to a ship's TBA
 */
router.post('/:name/harvest', async (req, res, next) => {
  try {
    const name = req.params.name;
    const { shipTokenId, resourceSymbol, amount } = req.body;

    // Validate inputs
    const tokenValidation = validateTokenId(shipTokenId);
    if (!tokenValidation.valid) {
      return res.status(400).json({ error: 'Invalid shipTokenId' });
    }

    if (!resourceSymbol || !['CH4', 'O2', 'H2O', 'CO2', 'N2'].includes(resourceSymbol)) {
      return res.status(400).json({ error: 'Invalid resourceSymbol' });
    }

    if (!amount || typeof amount !== 'string') {
      return res.status(400).json({ error: 'amount must be a string (wei units)' });
    }

    // Get celestial body
    if (!config.contracts.celestialBodyRegistry) {
      return res.status(503).json({ error: 'CelestialBodyRegistry not deployed yet' });
    }

    const registry = getCelestialBodyRegistry();
    const bodyAddress = await registry.getCelestialBody(name);

    if (bodyAddress === '0x0000000000000000000000000000000000000000') {
      return res.status(404).json({ error: `Celestial body '${name}' not found` });
    }

    // Get ship's TBA address
    const shipNFT = getShipNFT();
    const tbaAddress = await shipNFT.getShipTBA(tokenValidation.value);

    // Get resource token address
    const resourceAddress = config.contracts.resources[resourceSymbol];
    if (!resourceAddress) {
      return res.status(503).json({ error: `${resourceSymbol} token not deployed yet` });
    }

    // Harvest
    const body = getCelestialBody(bodyAddress);
    const tx = await body.harvest(tbaAddress, resourceAddress, amount);
    const receipt = await tx.wait();

    res.json({
      celestialBody: name,
      shipTokenId: tokenValidation.value,
      tbaAddress,
      resourceSymbol,
      amount,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/celestial-bodies
 * List all celestial bodies
 */
router.get('/', async (req, res, next) => {
  try {
    if (!config.contracts.celestialBodyRegistry) {
      return res.status(503).json({ error: 'CelestialBodyRegistry not deployed yet' });
    }

    const registry = getCelestialBodyRegistry();
    const addresses = await registry.getAllBodies();

    const bodies = [];
    for (const address of addresses) {
      try {
        const body = getCelestialBody(address);
        const name = await body.name();
        const bodyType = await body.bodyType();

        bodies.push({
          name,
          bodyType,
          address
        });
      } catch (error) {
        console.warn(`Failed to fetch body at ${address}:`, error.message);
      }
    }

    res.json(bodies);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/celestial-bodies/:name
 * Get details about a specific celestial body
 */
router.get('/:name', async (req, res, next) => {
  try {
    const name = req.params.name;

    if (!config.contracts.celestialBodyRegistry) {
      return res.status(503).json({ error: 'CelestialBodyRegistry not deployed yet' });
    }

    const registry = getCelestialBodyRegistry();
    const bodyAddress = await registry.getCelestialBody(name);

    if (bodyAddress === '0x0000000000000000000000000000000000000000') {
      return res.status(404).json({ error: `Celestial body '${name}' not found` });
    }

    const body = getCelestialBody(bodyAddress);
    const bodyType = await body.bodyType();

    res.json({
      name,
      bodyType,
      address: bodyAddress
    });
  } catch (error) {
    next(error);
  }
});

export default router;
