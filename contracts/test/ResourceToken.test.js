const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ResourceToken", function () {
  let resourceToken;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const ResourceToken = await ethers.getContractFactory("ResourceToken");
    resourceToken = await ResourceToken.deploy("Methane", "CH4");
  });

  describe("Deployment", function () {
    it("should set the correct name and symbol", async function () {
      expect(await resourceToken.name()).to.equal("Methane");
      expect(await resourceToken.symbol()).to.equal("CH4");
    });

    it("should set 18 decimals", async function () {
      expect(await resourceToken.decimals()).to.equal(18);
    });

    it("should set the deployer as owner", async function () {
      expect(await resourceToken.owner()).to.equal(owner.address);
    });

    it("should start with zero total supply", async function () {
      expect(await resourceToken.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("should allow owner to mint tokens", async function () {
      const amount = ethers.parseEther("1000");
      await resourceToken.mint(addr1.address, amount);
      expect(await resourceToken.balanceOf(addr1.address)).to.equal(amount);
      expect(await resourceToken.totalSupply()).to.equal(amount);
    });

    it("should reject minting from non-owner", async function () {
      const amount = ethers.parseEther("1000");
      await expect(
        resourceToken.connect(addr1).mint(addr1.address, amount)
      ).to.be.revertedWithCustomError(resourceToken, "OwnableUnauthorizedAccount");
    });

    it("should reject minting to zero address", async function () {
      const amount = ethers.parseEther("1000");
      await expect(
        resourceToken.mint(ethers.ZeroAddress, amount)
      ).to.be.revertedWithCustomError(resourceToken, "ERC20InvalidReceiver");
    });

    it("should emit Transfer event on mint", async function () {
      const amount = ethers.parseEther("1000");
      await expect(resourceToken.mint(addr1.address, amount))
        .to.emit(resourceToken, "Transfer")
        .withArgs(ethers.ZeroAddress, addr1.address, amount);
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("1000");
      await resourceToken.mint(addr1.address, amount);
    });

    it("should allow token holder to burn tokens", async function () {
      const burnAmount = ethers.parseEther("500");
      await resourceToken.connect(addr1).burn(burnAmount);
      expect(await resourceToken.balanceOf(addr1.address)).to.equal(ethers.parseEther("500"));
      expect(await resourceToken.totalSupply()).to.equal(ethers.parseEther("500"));
    });

    it("should reject burning more than balance", async function () {
      const burnAmount = ethers.parseEther("2000");
      await expect(
        resourceToken.connect(addr1).burn(burnAmount)
      ).to.be.revertedWithCustomError(resourceToken, "ERC20InsufficientBalance");
    });

    it("should emit Transfer event on burn", async function () {
      const burnAmount = ethers.parseEther("500");
      await expect(resourceToken.connect(addr1).burn(burnAmount))
        .to.emit(resourceToken, "Transfer")
        .withArgs(addr1.address, ethers.ZeroAddress, burnAmount);
    });
  });

  describe("ERC-20 Standard Compliance", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("1000");
      await resourceToken.mint(addr1.address, amount);
    });

    it("should allow transfers between accounts", async function () {
      const transferAmount = ethers.parseEther("100");
      await resourceToken.connect(addr1).transfer(addr2.address, transferAmount);
      expect(await resourceToken.balanceOf(addr2.address)).to.equal(transferAmount);
      expect(await resourceToken.balanceOf(addr1.address)).to.equal(ethers.parseEther("900"));
    });

    it("should allow approvals and transferFrom", async function () {
      const approveAmount = ethers.parseEther("100");
      await resourceToken.connect(addr1).approve(addr2.address, approveAmount);
      expect(await resourceToken.allowance(addr1.address, addr2.address)).to.equal(approveAmount);

      await resourceToken.connect(addr2).transferFrom(addr1.address, addr2.address, approveAmount);
      expect(await resourceToken.balanceOf(addr2.address)).to.equal(approveAmount);
    });
  });

  describe("Multiple Resource Types", function () {
    it("should deploy different tokens with different symbols", async function () {
      const ResourceToken = await ethers.getContractFactory("ResourceToken");
      const ch4 = await ResourceToken.deploy("Methane", "CH4");
      const o2 = await ResourceToken.deploy("Oxygen", "O2");
      const h2o = await ResourceToken.deploy("Water", "H2O");
      const co2 = await ResourceToken.deploy("Carbon Dioxide", "CO2");
      const n2 = await ResourceToken.deploy("Nitrogen", "N2");

      expect(await ch4.symbol()).to.equal("CH4");
      expect(await o2.symbol()).to.equal("O2");
      expect(await h2o.symbol()).to.equal("H2O");
      expect(await co2.symbol()).to.equal("CO2");
      expect(await n2.symbol()).to.equal("N2");
    });
  });
});
