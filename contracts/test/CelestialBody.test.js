const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CelestialBody", function () {
  let celestialBody;
  let resourceToken;
  let shipNFT;
  let owner;
  let addr1;
  let shipTBA;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    shipTBA = addr1.address; // Use addr1 as mock TBA for testing

    // Deploy ShipNFT (needed by GameResource tokens)
    const ShipNFT = await ethers.getContractFactory("ShipNFT");
    shipNFT = await ShipNFT.deploy();

    // Deploy a resource token (CH4 as concrete GameResource)
    const CH4 = await ethers.getContractFactory("CH4");
    resourceToken = await CH4.deploy(owner.address, await shipNFT.getAddress());

    // Deploy celestial body
    const CelestialBody = await ethers.getContractFactory("CelestialBody");
    celestialBody = await CelestialBody.deploy("TITAN", "moon");
  });

  describe("Deployment", function () {
    it("should set the correct name and body type", async function () {
      const data = await celestialBody.getCelestialBodyData();
      expect(data.name).to.equal("TITAN");
      expect(data.bodyType).to.equal("moon");
    });

    it("should set the deployer as owner", async function () {
      expect(await celestialBody.owner()).to.equal(owner.address);
    });

    it("should start with no emission profiles", async function () {
      const data = await celestialBody.getCelestialBodyData();
      expect(data.emissions.length).to.equal(0);
    });
  });

  describe("Resource Management", function () {
    it("should allow owner to add a resource", async function () {
      const ratePerSecond = ethers.parseEther("100"); // 100 tokens per second
      await celestialBody.addResource(await resourceToken.getAddress(), ratePerSecond);

      const data = await celestialBody.getCelestialBodyData();
      expect(data.emissions.length).to.equal(1);
      expect(data.emissions[0].resourceToken).to.equal(await resourceToken.getAddress());
      expect(data.emissions[0].ratePerSecond).to.equal(ratePerSecond);
      expect(data.emissions[0].isActive).to.be.true;
    });

    it("should reject adding resource from non-owner", async function () {
      const ratePerSecond = ethers.parseEther("100");
      await expect(
        celestialBody.connect(addr1).addResource(await resourceToken.getAddress(), ratePerSecond)
      ).to.be.revertedWithCustomError(celestialBody, "OwnableUnauthorizedAccount");
    });

    it("should reject adding zero address resource", async function () {
      await expect(
        celestialBody.addResource(ethers.ZeroAddress, ethers.parseEther("100"))
      ).to.be.revertedWith("Invalid resource token");
    });

    it("should allow owner to set emission rate", async function () {
      const initialRate = ethers.parseEther("100");
      const newRate = ethers.parseEther("200");

      await celestialBody.addResource(await resourceToken.getAddress(), initialRate);
      await celestialBody.setEmissionRate(await resourceToken.getAddress(), newRate);

      const data = await celestialBody.getCelestialBodyData();
      expect(data.emissions[0].ratePerSecond).to.equal(newRate);
    });

    it("should allow owner to toggle resource active state", async function () {
      await celestialBody.addResource(await resourceToken.getAddress(), ethers.parseEther("100"));

      await celestialBody.setResourceActive(await resourceToken.getAddress(), false);
      let data = await celestialBody.getCelestialBodyData();
      expect(data.emissions[0].isActive).to.be.false;

      await celestialBody.setResourceActive(await resourceToken.getAddress(), true);
      data = await celestialBody.getCelestialBodyData();
      expect(data.emissions[0].isActive).to.be.true;
    });

    it("should emit ResourceAdded event", async function () {
      const ratePerSecond = ethers.parseEther("100");
      await expect(
        celestialBody.addResource(await resourceToken.getAddress(), ratePerSecond)
      )
        .to.emit(celestialBody, "ResourceAdded")
        .withArgs(await resourceToken.getAddress(), ratePerSecond);
    });

    it("should emit EmissionRateUpdated event", async function () {
      await celestialBody.addResource(await resourceToken.getAddress(), ethers.parseEther("100"));
      const newRate = ethers.parseEther("200");

      await expect(
        celestialBody.setEmissionRate(await resourceToken.getAddress(), newRate)
      )
        .to.emit(celestialBody, "EmissionRateUpdated")
        .withArgs(await resourceToken.getAddress(), newRate);
    });
  });

  describe("Harvesting", function () {
    beforeEach(async function () {
      // Add CH4 resource to TITAN
      await celestialBody.addResource(await resourceToken.getAddress(), ethers.parseEther("100"));

      // Mint some CH4 tokens to celestial body for harvesting
      // (In production, the backend would ensure resources are available)
      await resourceToken.mint(await celestialBody.getAddress(), ethers.parseEther("10000"));
    });

    it("should allow owner to harvest resources to a TBA", async function () {
      const harvestAmount = ethers.parseEther("500");

      await celestialBody.harvest(shipTBA, await resourceToken.getAddress(), harvestAmount);

      expect(await resourceToken.balanceOf(shipTBA)).to.equal(harvestAmount);
    });

    it("should reject harvesting from non-owner", async function () {
      const harvestAmount = ethers.parseEther("500");
      await expect(
        celestialBody.connect(addr1).harvest(shipTBA, await resourceToken.getAddress(), harvestAmount)
      ).to.be.revertedWithCustomError(celestialBody, "OwnableUnauthorizedAccount");
    });

    it("should reject harvesting to zero address", async function () {
      await expect(
        celestialBody.harvest(ethers.ZeroAddress, await resourceToken.getAddress(), ethers.parseEther("500"))
      ).to.be.revertedWith("Invalid TBA address");
    });

    it("should reject harvesting inactive resource", async function () {
      await celestialBody.setResourceActive(await resourceToken.getAddress(), false);

      await expect(
        celestialBody.harvest(shipTBA, await resourceToken.getAddress(), ethers.parseEther("500"))
      ).to.be.revertedWith("Resource not active");
    });

    it("should reject harvesting unregistered resource", async function () {
      const O2Factory = await ethers.getContractFactory("O2");
      const otherToken = await O2Factory.deploy(owner.address, await shipNFT.getAddress());

      await expect(
        celestialBody.harvest(shipTBA, await otherToken.getAddress(), ethers.parseEther("500"))
      ).to.be.revertedWith("Resource not found");
    });

    it("should emit ResourceHarvested event", async function () {
      const harvestAmount = ethers.parseEther("500");

      await expect(
        celestialBody.harvest(shipTBA, await resourceToken.getAddress(), harvestAmount)
      )
        .to.emit(celestialBody, "ResourceHarvested")
        .withArgs(shipTBA, await resourceToken.getAddress(), harvestAmount);
    });
  });

  describe("Multiple Resources", function () {
    it("should support multiple resources with different rates", async function () {
      const H2OFactory = await ethers.getContractFactory("H2O");
      const h2oToken = await H2OFactory.deploy(owner.address, await shipNFT.getAddress());

      await celestialBody.addResource(await resourceToken.getAddress(), ethers.parseEther("100"));
      await celestialBody.addResource(await h2oToken.getAddress(), ethers.parseEther("50"));

      const data = await celestialBody.getCelestialBodyData();
      expect(data.emissions.length).to.equal(2);
      expect(data.emissions[0].ratePerSecond).to.equal(ethers.parseEther("100"));
      expect(data.emissions[1].ratePerSecond).to.equal(ethers.parseEther("50"));
    });
  });
});
