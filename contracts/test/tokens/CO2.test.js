const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CO2", function () {
  let token, shipNFT;
  let admin, player1;

  beforeEach(async function () {
    [admin, player1] = await ethers.getSigners();
    const ShipNFT = await ethers.getContractFactory("ShipNFT");
    shipNFT = await ShipNFT.deploy();
    const Token = await ethers.getContractFactory("CO2");
    token = await Token.deploy(admin.address, await shipNFT.getAddress());
  });

  it("should have correct name", async function () {
    expect(await token.name()).to.equal("Carbon Dioxide");
  });

  it("should have correct symbol", async function () {
    expect(await token.symbol()).to.equal("CO2");
  });

  it("should support admin mint", async function () {
    await token.mint(player1.address, ethers.parseEther("100"));
    expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("100"));
  });
});
