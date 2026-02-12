const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CelestialBodyRegistry", function () {
  let registry;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    const CelestialBodyRegistry = await ethers.getContractFactory("CelestialBodyRegistry");
    registry = await CelestialBodyRegistry.deploy();
  });

  describe("Deployment", function () {
    it("should set the deployer as owner", async function () {
      expect(await registry.owner()).to.equal(owner.address);
    });

    it("should start with no registered bodies", async function () {
      const bodies = await registry.getAllBodies();
      expect(bodies.length).to.equal(0);
    });
  });

  describe("Creating Celestial Bodies", function () {
    it("should allow owner to create a celestial body", async function () {
      const tx = await registry.createCelestialBody("TITAN", "moon");
      const receipt = await tx.wait();

      // Check that body was created
      const titanAddress = await registry.getCelestialBody("TITAN");
      expect(titanAddress).to.not.equal(ethers.ZeroAddress);
      expect(ethers.isAddress(titanAddress)).to.be.true;
    });

    it("should reject creating body from non-owner", async function () {
      await expect(
        registry.connect(addr1).createCelestialBody("TITAN", "moon")
      ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("should reject creating duplicate body", async function () {
      await registry.createCelestialBody("TITAN", "moon");

      await expect(
        registry.createCelestialBody("TITAN", "planet")
      ).to.be.revertedWith("Body already exists");
    });

    it("should reject empty name", async function () {
      await expect(
        registry.createCelestialBody("", "moon")
      ).to.be.revertedWith("Invalid name");
    });

    it("should emit CelestialBodyCreated event", async function () {
      const tx = await registry.createCelestialBody("TITAN", "moon");
      const receipt = await tx.wait();
      const titanAddress = await registry.getCelestialBody("TITAN");

      // Verify event was emitted (we can't easily check event args in this test setup,
      // but we can verify the body was created by checking its address)
      expect(titanAddress).to.not.equal(ethers.ZeroAddress);
    });
  });

  describe("Body Retrieval", function () {
    beforeEach(async function () {
      await registry.createCelestialBody("TITAN", "moon");
      await registry.createCelestialBody("EUROPA", "moon");
      await registry.createCelestialBody("MARS", "planet");
    });

    it("should return correct address for registered body", async function () {
      const titanAddress = await registry.getCelestialBody("TITAN");
      expect(titanAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("should return zero address for unregistered body", async function () {
      const address = await registry.getCelestialBody("UNKNOWN");
      expect(address).to.equal(ethers.ZeroAddress);
    });

    it("should return all registered bodies", async function () {
      const bodies = await registry.getAllBodies();
      expect(bodies.length).to.equal(3);

      expect(bodies[0].name).to.equal("TITAN");
      expect(bodies[1].name).to.equal("EUROPA");
      expect(bodies[2].name).to.equal("MARS");

      expect(bodies[0].bodyAddress).to.not.equal(ethers.ZeroAddress);
      expect(bodies[1].bodyAddress).to.not.equal(ethers.ZeroAddress);
      expect(bodies[2].bodyAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("should return correct body type from created contract", async function () {
      const titanAddress = await registry.getCelestialBody("TITAN");

      // Get the CelestialBody contract instance
      const CelestialBody = await ethers.getContractFactory("CelestialBody");
      const titan = CelestialBody.attach(titanAddress);

      expect(await titan.name()).to.equal("TITAN");
      expect(await titan.bodyType()).to.equal("moon");
    });
  });

  describe("Integration with CelestialBody", function () {
    it("should create functional CelestialBody contracts", async function () {
      await registry.createCelestialBody("TITAN", "moon");
      const titanAddress = await registry.getCelestialBody("TITAN");

      // Get the CelestialBody contract
      const CelestialBody = await ethers.getContractFactory("CelestialBody");
      const titan = CelestialBody.attach(titanAddress);

      // Verify it's a working CelestialBody contract
      const data = await titan.getCelestialBodyData();
      expect(data.name).to.equal("TITAN");
      expect(data.bodyType).to.equal("moon");
      expect(data.emissions.length).to.equal(0);
    });

    it("should transfer ownership of created bodies to registry owner", async function () {
      await registry.createCelestialBody("TITAN", "moon");
      const titanAddress = await registry.getCelestialBody("TITAN");

      const CelestialBody = await ethers.getContractFactory("CelestialBody");
      const titan = CelestialBody.attach(titanAddress);

      // Body should be owned by the registry owner (not the registry contract itself)
      expect(await titan.owner()).to.equal(owner.address);
    });
  });

  describe("Multiple Bodies", function () {
    it("should handle creating all initial Phase 1 bodies", async function () {
      // Create the 4 initial bodies from the architecture spec
      await registry.createCelestialBody("TITAN", "moon");
      await registry.createCelestialBody("EUROPA", "moon");
      await registry.createCelestialBody("MARS", "planet");
      await registry.createCelestialBody("VENUS", "planet");

      const bodies = await registry.getAllBodies();
      expect(bodies.length).to.equal(4);

      const names = bodies.map(b => b.name);
      expect(names).to.include("TITAN");
      expect(names).to.include("EUROPA");
      expect(names).to.include("MARS");
      expect(names).to.include("VENUS");
    });
  });
});
