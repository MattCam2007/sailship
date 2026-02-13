const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ShipNFT", function () {
  let shipNFT;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const ShipNFT = await ethers.getContractFactory("ShipNFT");
    shipNFT = await ShipNFT.deploy();
  });

  describe("Deployment", function () {
    it("should set the correct name and symbol", async function () {
      expect(await shipNFT.name()).to.equal("Sailship Fleet");
      expect(await shipNFT.symbol()).to.equal("SHIP");
    });

    it("should set the deployer as owner", async function () {
      expect(await shipNFT.owner()).to.equal(owner.address);
    });

    it("should start with zero total supply", async function () {
      expect(await shipNFT.totalSupply()).to.equal(0);
    });
  });

  describe("Ship Minting", function () {
    it("should mint a ship with correct stats", async function () {
      const tx = await shipNFT.mintShip(
        addr1.address,
        "HELIOS-CLASS",
        10000,      // mass (kg)
        3000000,    // sailArea (m²)
        9000,       // sailReflectivity (basis points, 9000 = 0.9)
        5,          // maxSailCount
        1000000     // cargoCapacity
      );

      const receipt = await tx.wait();
      const tokenId = 1; // First token

      // Check ownership
      expect(await shipNFT.ownerOf(tokenId)).to.equal(addr1.address);

      // Check stats
      const stats = await shipNFT.getShipStats(tokenId);
      expect(stats.className).to.equal("HELIOS-CLASS");
      expect(stats.mass).to.equal(10000);
      expect(stats.sailArea).to.equal(3000000);
      expect(stats.sailReflectivity).to.equal(9000);
      expect(stats.maxSailCount).to.equal(5);
      expect(stats.cargoCapacity).to.equal(1000000);
      expect(stats.condition).to.equal(10000); // Perfect condition
    });

    it("should increment token IDs sequentially", async function () {
      await shipNFT.mintShip(addr1.address, "CLASS-A", 10000, 3000000, 9000, 5, 1000000);
      await shipNFT.mintShip(addr2.address, "CLASS-B", 12000, 3500000, 8500, 7, 1500000);

      expect(await shipNFT.ownerOf(1)).to.equal(addr1.address);
      expect(await shipNFT.ownerOf(2)).to.equal(addr2.address);
      expect(await shipNFT.totalSupply()).to.equal(2);
    });

    it("should reject minting from non-owner", async function () {
      await expect(
        shipNFT.connect(addr1).mintShip(addr1.address, "HACKER", 10000, 3000000, 9000, 5, 1000000)
      ).to.be.revertedWithCustomError(shipNFT, "OwnableUnauthorizedAccount");
    });

    it("should reject minting to zero address", async function () {
      await expect(
        shipNFT.mintShip(ethers.ZeroAddress, "VOID", 10000, 3000000, 9000, 5, 1000000)
      ).to.be.revertedWithCustomError(shipNFT, "ERC721InvalidReceiver");
    });

    it("should emit ShipMinted event", async function () {
      await expect(
        shipNFT.mintShip(addr1.address, "HELIOS-CLASS", 10000, 3000000, 9000, 5, 1000000)
      )
        .to.emit(shipNFT, "ShipMinted")
        .withArgs(1, addr1.address, "HELIOS-CLASS");
    });
  });

  describe("Token Bound Accounts (ERC-6551)", function () {
    let tokenId;

    beforeEach(async function () {
      await shipNFT.mintShip(addr1.address, "HELIOS-CLASS", 10000, 3000000, 9000, 5, 1000000);
      tokenId = 1;
    });

    it("should create a Token Bound Account on mint", async function () {
      const tbaAddress = await shipNFT.getShipTBA(tokenId);
      expect(tbaAddress).to.not.equal(ethers.ZeroAddress);
      expect(ethers.isAddress(tbaAddress)).to.be.true;
    });

    it("should return the same TBA address for the same token", async function () {
      const tba1 = await shipNFT.getShipTBA(tokenId);
      const tba2 = await shipNFT.getShipTBA(tokenId);
      expect(tba1).to.equal(tba2);
    });

    it("should return different TBA addresses for different tokens", async function () {
      await shipNFT.mintShip(addr2.address, "CLASS-B", 12000, 3500000, 8500, 7, 1500000);
      const tokenId2 = 2;

      const tba1 = await shipNFT.getShipTBA(tokenId);
      const tba2 = await shipNFT.getShipTBA(tokenId2);
      expect(tba1).to.not.equal(tba2);
    });

    it("should revert when querying TBA for non-existent token", async function () {
      await expect(
        shipNFT.getShipTBA(999)
      ).to.be.revertedWithCustomError(shipNFT, "ERC721NonexistentToken");
    });
  });

  describe("ERC-721 Compliance", function () {
    let tokenId;

    beforeEach(async function () {
      await shipNFT.mintShip(addr1.address, "HELIOS-CLASS", 10000, 3000000, 9000, 5, 1000000);
      tokenId = 1;
    });

    it("should allow transfers", async function () {
      await shipNFT.connect(addr1).transferFrom(addr1.address, addr2.address, tokenId);
      expect(await shipNFT.ownerOf(tokenId)).to.equal(addr2.address);
    });

    it("should allow approvals", async function () {
      await shipNFT.connect(addr1).approve(addr2.address, tokenId);
      expect(await shipNFT.getApproved(tokenId)).to.equal(addr2.address);
    });

    it("should support setApprovalForAll", async function () {
      await shipNFT.connect(addr1).setApprovalForAll(addr2.address, true);
      expect(await shipNFT.isApprovedForAll(addr1.address, addr2.address)).to.be.true;
    });
  });

  describe("Ship Stats Validation", function () {
    it("should validate ship stats are within realistic bounds", async function () {
      // Ship stats from game config:
      // DEFAULT_SHIP_MASS = 10000 kg
      // DEFAULT_SAIL.area = 3000000 m² (3 km²)
      // DEFAULT_SAIL.reflectivity = 0.9 (9000 basis points)
      // DEFAULT_SAIL.sailCount max = 20

      await shipNFT.mintShip(addr1.address, "REALISTIC", 10000, 3000000, 9000, 20, 1000000);
      const stats = await shipNFT.getShipStats(1);

      expect(stats.mass).to.be.gt(0);
      expect(stats.sailArea).to.be.gt(0);
      expect(stats.sailReflectivity).to.be.lte(10000); // Max 100% (10000 basis points)
      expect(stats.maxSailCount).to.be.gt(0);
      expect(stats.cargoCapacity).to.be.gt(0);
    });
  });

  describe("tokenURI", function () {
    it("should return a tokenURI for minted ships", async function () {
      await shipNFT.mintShip(addr1.address, "HELIOS-CLASS", 10000, 3000000, 9000, 5, 1000000);
      const uri = await shipNFT.tokenURI(1);
      expect(uri).to.include("1"); // Token ID should be in URI
    });
  });

  describe("Zone Tracking", function () {
    let tokenId;

    beforeEach(async function () {
      await shipNFT.mintShip(addr1.address, "HELIOS-CLASS", 10000, 3000000, 9000, 5, 1000000);
      tokenId = 1;
    });

    it("should default to zone 0 (deep space)", async function () {
      expect(await shipNFT.shipZone(tokenId)).to.equal(0);
    });

    it("should allow admin to set ship zone", async function () {
      await shipNFT.setShipZone(tokenId, 42);
      expect(await shipNFT.shipZone(tokenId)).to.equal(42);
    });

    it("should emit ZoneUpdated event", async function () {
      await expect(shipNFT.setShipZone(tokenId, 42))
        .to.emit(shipNFT, "ZoneUpdated")
        .withArgs(tokenId, 42);
    });

    it("should reject setShipZone from non-owner", async function () {
      await expect(
        shipNFT.connect(addr1).setShipZone(tokenId, 42)
      ).to.be.revertedWithCustomError(shipNFT, "OwnableUnauthorizedAccount");
    });

    it("should allow batch zone updates", async function () {
      await shipNFT.mintShip(addr2.address, "CLASS-B", 10000, 3000000, 9000, 5, 1000000);
      await shipNFT.setShipZoneBatch([1, 2], [10, 20]);
      expect(await shipNFT.shipZone(1)).to.equal(10);
      expect(await shipNFT.shipZone(2)).to.equal(20);
    });

    it("should revert batch with mismatched array lengths", async function () {
      await expect(
        shipNFT.setShipZoneBatch([1], [10, 20])
      ).to.be.revertedWithCustomError(shipNFT, "ArrayLengthMismatch");
    });

    it("should update zone (ship moves from station to deep space)", async function () {
      await shipNFT.setShipZone(tokenId, 42);
      expect(await shipNFT.shipZone(tokenId)).to.equal(42);
      await shipNFT.setShipZone(tokenId, 0);
      expect(await shipNFT.shipZone(tokenId)).to.equal(0);
    });
  });
});
