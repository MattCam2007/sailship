// server/routes/abis.js
import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

/**
 * GET /api/abis/:contractName
 * Serve ABI JSON files for frontend contract interaction
 */
router.get('/:contractName', (req, res, next) => {
  try {
    const contractName = req.params.contractName;

    // Validate contract name (prevent path traversal)
    if (!/^[a-zA-Z0-9]+$/.test(contractName)) {
      return res.status(400).json({ error: 'Invalid contract name' });
    }

    const abiPath = join(__dirname, '../../public/abis', `${contractName}.json`);
    const abiJSON = JSON.parse(readFileSync(abiPath, 'utf8'));

    res.json(abiJSON);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ error: `ABI not found for contract: ${req.params.contractName}` });
    } else {
      next(error);
    }
  }
});

export default router;
