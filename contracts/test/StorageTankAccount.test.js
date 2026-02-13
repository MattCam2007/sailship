const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StorageTankAccount", function () {
  let tank, shipNFT, mockToken;
  let admin, player1, player2;
  const SHIP_ID = 1;

  beforeEach(async function () {
    [admin, player1, player2] = await ethers.getSigners();

    // Deploy ShipNFT and mint a ship
    const ShipNFT = await ethers.getContractFactory("ShipNFT");
    shipNFT = await ShipNFT.deploy();
    await shipNFT.mintShip(player1.address, "HELIOS", 10000, 3000000, 9000, 5, 1000000);

    // Deploy a mock ERC20 as the allowed resource
    const MockToken = await ethers.getContractFactory("ResourceToken");
    mockToken = await MockToken.deploy("Oxygen", "O2");

    // Deploy StorageTankAccount
    const Tank = await ethers.getContractFactory("StorageTankAccount");
    tank = await Tank.deploy();
    await tank.initialize(
      await shipNFT.getAddress(),
      SHIP_ID,
      await mockToken.getAddress(),
      ethers.parseEther("1000"), // capacity
      admin.address
    );
  });

  describe("Initialization", function () {
    it("should set correct allowed resource", async function () {
      expect(await tank.allowedResource()).to.equal(await mockToken.getAddress());
    });

    it("should set correct capacity", async function () {
      expect(await tank.capacity()).to.equal(ethers.parseEther("1000"));
    });

    it("should set correct token ID", async function () {
      expect(await tank.tokenId()).to.equal(SHIP_ID);
    });

    it("should set correct ship NFT address", async function () {
      expect(await tank.shipNFT()).to.equal(await shipNFT.getAddress());
    });

    it("should resolve owner to ship NFT owner", async function () {
      expect(await tank.owner()).to.equal(player1.address);
    });

    it("should revert on double initialization", async function () {
      await expect(
        tank.initialize(await shipNFT.getAddress(), SHIP_ID, await mockToken.getAddress(), 500, admin.address)
      ).to.be.revertedWithCustomError(tank, "AlreadyInitialized");
    });
  });
});
