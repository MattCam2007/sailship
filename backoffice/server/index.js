// server/index.js
import express from 'express';
import cors from 'cors';
import config from './config.js';
import { initializeBlockchain } from './services/blockchain.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize blockchain connection
try {
  initializeBlockchain();
  console.log(`Blockchain connected: ${config.chainUrl}`);
} catch (error) {
  console.error('Failed to initialize blockchain:', error.message);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    chainUrl: config.chainUrl,
    chainId: config.chainId
  });
});

// API routes
import shipsRouter from './routes/ships.js';
import resourcesRouter from './routes/resources.js';
import celestialBodiesRouter from './routes/celestialBodies.js';
import abisRouter from './routes/abis.js';

app.use('/api/ships', shipsRouter);
app.use('/api/resources', resourcesRouter);
app.use('/api/celestial-bodies', celestialBodiesRouter);
app.use('/api/abis', abisRouter);

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server only if not in test mode
if (config.nodeEnv !== 'test') {
  app.listen(config.port, () => {
    console.log(`Backoffice server running on http://localhost:${config.port}`);
  });
}

export default app;
