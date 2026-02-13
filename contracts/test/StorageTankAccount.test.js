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

  describe("Capacity Management", function () {
    it("should allow admin to set capacity", async function () {
      await tank.setCapacity(ethers.parseEther("2000"));
      expect(await tank.capacity()).to.equal(ethers.parseEther("2000"));
    });

    it("should emit CapacityUpdated event", async function () {
      await expect(tank.setCapacity(ethers.parseEther("2000")))
        .to.emit(tank, "CapacityUpdated")
        .withArgs(ethers.parseEther("2000"));
    });

    it("should reject setCapacity from non-admin", async function () {
      await expect(
        tank.connect(player1).setCapacity(ethers.parseEther("9999"))
      ).to.be.revertedWithCustomError(tank, "NotAdmin");
    });
  });

  describe("Withdraw", function () {
    beforeEach(async function () {
      // Mint tokens to the tank (simulate a deposit)
      await mockToken.mint(await tank.getAddress(), ethers.parseEther("500"));
    });

    it("should allow ship owner to withdraw", async function () {
      await tank.connect(player1).withdraw(ethers.parseEther("100"), player1.address);
      expect(await mockToken.balanceOf(player1.address)).to.equal(ethers.parseEther("100"));
    });

    it("should reduce tank balance on withdraw", async function () {
      const tankAddr = await tank.getAddress();
      await tank.connect(player1).withdraw(ethers.parseEther("100"), player1.address);
      expect(await mockToken.balanceOf(tankAddr)).to.equal(ethers.parseEther("400"));
    });

    it("should emit Withdrawal event", async function () {
      await expect(
        tank.connect(player1).withdraw(ethers.parseEther("100"), player1.address)
      )
        .to.emit(tank, "Withdrawal")
        .withArgs(player1.address, ethers.parseEther("100"));
    });

    it("should reject withdraw from non-owner", async function () {
      await expect(
        tank.connect(player2).withdraw(ethers.parseEther("100"), player2.address)
      ).to.be.revertedWithCustomError(tank, "NotShipOwner");
    });

    it("should revert if withdrawing more than balance", async function () {
      await expect(
        tank.connect(player1).withdraw(ethers.parseEther("9999"), player1.address)
      ).to.be.reverted; // ERC20 insufficient balance
    });

    it("should track new owner after ship transfer", async function () {
      // Transfer ship to player2
      await shipNFT.connect(player1).transferFrom(player1.address, player2.address, SHIP_ID);
      // Now player2 is the ship owner and can withdraw
      await tank.connect(player2).withdraw(ethers.parseEther("100"), player2.address);
      expect(await mockToken.balanceOf(player2.address)).to.equal(ethers.parseEther("100"));
      // player1 can no longer withdraw
      await expect(
        tank.connect(player1).withdraw(ethers.parseEther("100"), player1.address)
      ).to.be.revertedWithCustomError(tank, "NotShipOwner");
    });
  });
});
