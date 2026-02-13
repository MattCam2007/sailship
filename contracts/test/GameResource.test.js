const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GameResource", function () {
  let resource, shipNFT;
  let admin, player1, player2;

  beforeEach(async function () {
    [admin, player1, player2] = await ethers.getSigners();

    // Deploy ShipNFT
    const ShipNFT = await ethers.getContractFactory("ShipNFT");
    shipNFT = await ShipNFT.deploy();

    // Deploy a concrete token (CH4) to test GameResource since it's abstract
    const TestResource = await ethers.getContractFactory("CH4");
    resource = await TestResource.deploy(admin.address, await shipNFT.getAddress());
  });

  describe("Deployment", function () {
    it("should set correct name and symbol", async function () {
      expect(await resource.name()).to.equal("Methane");
      expect(await resource.symbol()).to.equal("CH4");
    });

    it("should set deployer as owner", async function () {
      expect(await resource.owner()).to.equal(admin.address);
    });

    it("should start with zero total supply", async function () {
      expect(await resource.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("should allow admin to mint to player wallet", async function () {
      await resource.mint(player1.address, ethers.parseEther("1000"));
      expect(await resource.balanceOf(player1.address)).to.equal(ethers.parseEther("1000"));
    });

    it("should reject minting from non-admin", async function () {
      await expect(
        resource.connect(player1).mint(player1.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(resource, "OwnableUnauthorizedAccount");
    });

    it("should emit Transfer event on mint", async function () {
      await expect(resource.mint(player1.address, ethers.parseEther("100")))
        .to.emit(resource, "Transfer")
        .withArgs(ethers.ZeroAddress, player1.address, ethers.parseEther("100"));
    });
  });

  describe("Metadata", function () {
    it("should default image to empty string", async function () {
      expect(await resource.image()).to.equal("");
    });

    it("should default description to empty string", async function () {
      expect(await resource.description()).to.equal("");
    });

    it("should allow admin to set image", async function () {
      await resource.setImage("ipfs://QmResourceImage");
      expect(await resource.image()).to.equal("ipfs://QmResourceImage");
    });

    it("should allow admin to set description", async function () {
      await resource.setDescription("Volatile hydrocarbon fuel");
      expect(await resource.description()).to.equal("Volatile hydrocarbon fuel");
    });

    it("should reject setImage from non-admin", async function () {
      await expect(
        resource.connect(player1).setImage("ipfs://hack")
      ).to.be.revertedWithCustomError(resource, "OwnableUnauthorizedAccount");
    });

    it("should reject setDescription from non-admin", async function () {
      await expect(
        resource.connect(player1).setDescription("hacked")
      ).to.be.revertedWithCustomError(resource, "OwnableUnauthorizedAccount");
    });
  });
});
