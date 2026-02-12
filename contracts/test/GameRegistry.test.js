const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GameRegistry", function () {
  let gameRegistry;
  let owner;
  let addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    const GameRegistry = await ethers.getContractFactory("GameRegistry");
    gameRegistry = await GameRegistry.deploy();
  });

  describe("Deployment", function () {
    it("should set the deployer as owner", async function () {
      expect(await gameRegistry.owner()).to.equal(owner.address);
    });
  });

  describe("Contract Registration", function () {
    it("should allow owner to register ShipNFT address", async function () {
      const testAddress = "0x1234567890123456789012345678901234567890";
      await gameRegistry.setShipNFT(testAddress);
      expect(await gameRegistry.shipNFT()).to.equal(testAddress);
    });

    it("should allow owner to register CelestialBodyRegistry address", async function () {
      const testAddress = "0x1234567890123456789012345678901234567890";
      await gameRegistry.setCelestialBodyRegistry(testAddress);
      expect(await gameRegistry.celestialBodyRegistry()).to.equal(testAddress);
    });

    it("should allow owner to register resource token addresses", async function () {
      const testAddress = "0x1234567890123456789012345678901234567890";
      await gameRegistry.setResourceToken("CH4", testAddress);
      expect(await gameRegistry.getResourceToken("CH4")).to.equal(testAddress);
    });

    it("should reject non-owner attempts to register contracts", async function () {
      const testAddress = "0x1234567890123456789012345678901234567890";
      await expect(
        gameRegistry.connect(addr1).setShipNFT(testAddress)
      ).to.be.revertedWithCustomError(gameRegistry, "OwnableUnauthorizedAccount");
    });

    it("should reject zero address registration", async function () {
      await expect(
        gameRegistry.setShipNFT(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
  });

  describe("Contract Retrieval", function () {
    it("should return zero address for unregistered resource tokens", async function () {
      expect(await gameRegistry.getResourceToken("UNKNOWN")).to.equal(ethers.ZeroAddress);
    });

    it("should return all registered resource tokens", async function () {
      const ch4Address = "0x1234567890123456789012345678901234567891";
      const o2Address = "0x1234567890123456789012345678901234567892";

      await gameRegistry.setResourceToken("CH4", ch4Address);
      await gameRegistry.setResourceToken("O2", o2Address);

      const tokens = await gameRegistry.getAllResourceTokens();
      expect(tokens.length).to.equal(2);
      expect(tokens[0].symbol).to.equal("CH4");
      expect(tokens[0].tokenAddress).to.equal(ch4Address);
      expect(tokens[1].symbol).to.equal("O2");
      expect(tokens[1].tokenAddress).to.equal(o2Address);
    });
  });

  describe("Events", function () {
    it("should emit ContractRegistered event when registering ShipNFT", async function () {
      const testAddress = "0x1234567890123456789012345678901234567890";
      await expect(gameRegistry.setShipNFT(testAddress))
        .to.emit(gameRegistry, "ContractRegistered")
        .withArgs("ShipNFT", testAddress);
    });

    it("should emit ContractRegistered event when registering resource token", async function () {
      const testAddress = "0x1234567890123456789012345678901234567890";
      await expect(gameRegistry.setResourceToken("CH4", testAddress))
        .to.emit(gameRegistry, "ContractRegistered")
        .withArgs("ResourceToken:CH4", testAddress);
    });
  });
});
