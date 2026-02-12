// tests/integration/ships.test.js
import request from 'supertest';
import { expect } from 'chai';
import app from '../../server/index.js';

describe('Ships API', function() {
  // Note: These tests will fail until contracts are deployed
  // They serve as documentation of expected behavior

  describe('POST /api/ships/mint', function() {
    it('should return 400 when missing required fields', async function() {
      const response = await request(app)
        .post('/api/ships/mint')
        .send({});

      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error');
    });

    it('should return 400 when mass is invalid', async function() {
      const response = await request(app)
        .post('/api/ships/mint')
        .send({
          to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          className: 'HELIOS-CLASS',
          mass: -100, // Invalid
          sailArea: 3000000,
          sailReflectivity: 9000,
          maxSailCount: 5,
          cargoCapacity: 1000000
        });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.include('mass');
    });

    // This test will fail until contracts are deployed
    it.skip('should mint a ship and return tokenId', async function() {
      const response = await request(app)
        .post('/api/ships/mint')
        .send({
          to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          className: 'HELIOS-CLASS',
          mass: 10000,
          sailArea: 3000000,
          sailReflectivity: 9000,
          maxSailCount: 5,
          cargoCapacity: 1000000
        });

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('tokenId');
      expect(response.body).to.have.property('txHash');
    });
  });

  describe('GET /api/ships/:tokenId', function() {
    it('should return 400 for invalid tokenId', async function() {
      const response = await request(app)
        .get('/api/ships/invalid');

      expect(response.status).to.equal(400);
      expect(response.body.error).to.include('tokenId');
    });

    it.skip('should return ship stats', async function() {
      const response = await request(app)
        .get('/api/ships/1');

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('tokenId');
      expect(response.body).to.have.property('stats');
      expect(response.body.stats).to.have.property('className');
      expect(response.body.stats).to.have.property('mass');
    });
  });

  describe('GET /api/ships/:tokenId/tba', function() {
    it('should return 400 for invalid tokenId', async function() {
      const response = await request(app)
        .get('/api/ships/abc/tba');

      expect(response.status).to.equal(400);
    });

    it.skip('should return TBA address and balances', async function() {
      const response = await request(app)
        .get('/api/ships/1/tba');

      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('tbaAddress');
      expect(response.body).to.have.property('balances');
      expect(response.body.balances).to.be.an('array');
    });
  });

  describe('GET /api/ships', function() {
    it.skip('should list all ships', async function() {
      const response = await request(app)
        .get('/api/ships');

      expect(response.status).to.equal(200);
      expect(response.body).to.be.an('array');
    });
  });
});
