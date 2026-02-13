const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Integration: Full Lifecycle", function () {
  let shipNFT, ch4, o2, h2o;
  let admin, player1, player2;
  let ship1Tank, ship2Tank;

  beforeEach(async function () {
    [admin, player1, player2] = await ethers.getSigners();

    // Deploy core contracts
    const ShipNFT = await ethers.getContractFactory("ShipNFT");
    shipNFT = await ShipNFT.deploy();

    const CH4Factory = await ethers.getContractFactory("CH4");
    ch4 = await CH4Factory.deploy(admin.address, await shipNFT.getAddress());

    const O2Factory = await ethers.getContractFactory("O2");
    o2 = await O2Factory.deploy(admin.address, await shipNFT.getAddress());

    const H2OFactory = await ethers.getContractFactory("H2O");
    h2o = await H2OFactory.deploy(admin.address, await shipNFT.getAddress());

    // Mint ships
    await shipNFT.mintShip(player1.address, "HELIOS", 10000, 3000000, 9000, 5, 1000000);
    await shipNFT.mintShip(player2.address, "SCOUT", 8000, 2000000, 8500, 3, 500000);

    // Associate wallets with ships
    await ch4.setPlayerShip(player1.address, 1);
    await ch4.setPlayerShip(player2.address, 2);
    await o2.setPlayerShip(player1.address, 1);
    await o2.setPlayerShip(player2.address, 2);

    // Deploy tanks for ship 1 (CH4 tank)
    const Tank = await ethers.getContractFactory("StorageTankAccount");
    ship1Tank = await Tank.deploy();
    await ship1Tank.initialize(
      await shipNFT.getAddress(), 1,
      await ch4.getAddress(), ethers.parseEther("1000"),
      admin.address
    );
    await ch4.registerTank(await ship1Tank.getAddress(), true);

    // Deploy tank for ship 2 (CH4 tank)
    ship2Tank = await Tank.deploy();
    await ship2Tank.initialize(
      await shipNFT.getAddress(), 2,
      await ch4.getAddress(), ethers.parseEther("500"),
      admin.address
    );
    await ch4.registerTank(await ship2Tank.getAddress(), true);
  });

  it("should complete full lifecycle: mint → deposit → trade → consume", async function () {
    // 1. MINT: Backend mines CH4 to player1
    await ch4.mint(player1.address, ethers.parseEther("500"));
    expect(await ch4.balanceOf(player1.address)).to.equal(ethers.parseEther("500"));

    // 2. DEPOSIT: Player1 stores CH4 in their tank
    await ch4.connect(player1).transfer(await ship1Tank.getAddress(), ethers.parseEther("300"));
    expect(await ch4.balanceOf(await ship1Tank.getAddress())).to.equal(ethers.parseEther("300"));

    // 3. TRADE: Both ships dock at station 5
    await shipNFT.setShipZone(1, 5);
    await shipNFT.setShipZone(2, 5);
    await ch4.connect(player1).transfer(player2.address, ethers.parseEther("100"));
    expect(await ch4.balanceOf(player2.address)).to.equal(ethers.parseEther("100"));

    // 4. Player2 deposits into their tank
    await ch4.connect(player2).transfer(await ship2Tank.getAddress(), ethers.parseEther("100"));

    // 5. CONSUME: Backend burns 50 CH4 from ship2's tank (fuel consumption)
    await ch4.burnFrom(await ship2Tank.getAddress(), ethers.parseEther("50"));
    expect(await ch4.balanceOf(await ship2Tank.getAddress())).to.equal(ethers.parseEther("50"));
  });

  it("should allow two players at a station to trade back and forth", async function () {
    await shipNFT.setShipZone(1, 5);
    await shipNFT.setShipZone(2, 5);

    await ch4.mint(player1.address, ethers.parseEther("1000"));
    await ch4.connect(player1).transfer(player2.address, ethers.parseEther("300"));
    await ch4.connect(player2).transfer(player1.address, ethers.parseEther("100"));

    expect(await ch4.balanceOf(player1.address)).to.equal(ethers.parseEther("800"));
    expect(await ch4.balanceOf(player2.address)).to.equal(ethers.parseEther("200"));
  });

  it("should block trade after undocking", async function () {
    await shipNFT.setShipZone(1, 5);
    await shipNFT.setShipZone(2, 5);
    await ch4.mint(player1.address, ethers.parseEther("1000"));

    // Trade works at station
    await ch4.connect(player1).transfer(player2.address, ethers.parseEther("100"));

    // Player1 undocks
    await shipNFT.setShipZone(1, 0);

    // Trade fails
    await expect(
      ch4.connect(player1).transfer(player2.address, ethers.parseEther("100"))
    ).to.be.revertedWithCustomError(ch4, "NoPhysicalPathway");
  });

  it("should handle ship takes damage (capacity reduced)", async function () {
    await ch4.mint(player1.address, ethers.parseEther("500"));
    await ch4.connect(player1).transfer(await ship1Tank.getAddress(), ethers.parseEther("400"));

    // Ship takes damage — tank capacity reduced below current balance
    await ship1Tank.setCapacity(ethers.parseEther("200"));

    // Can't deposit more
    await expect(
      ch4.connect(player1).transfer(await ship1Tank.getAddress(), ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(ch4, "ExceedsCapacity");

    // But can still withdraw
    await ship1Tank.connect(player1).withdraw(ethers.parseEther("300"), player1.address);
    expect(await ch4.balanceOf(await ship1Tank.getAddress())).to.equal(ethers.parseEther("100"));
  });

  it("should handle new player joining: mint ship, deploy tank, register, deposit", async function () {
    const [, , , newPlayer] = await ethers.getSigners();

    // Mint ship for new player
    await shipNFT.mintShip(newPlayer.address, "ROOKIE", 5000, 1000000, 7000, 1, 200000);
    const newShipId = 3;

    // Deploy tank
    const Tank = await ethers.getContractFactory("StorageTankAccount");
    const newTank = await Tank.deploy();
    await newTank.initialize(
      await shipNFT.getAddress(), newShipId,
      await ch4.getAddress(), ethers.parseEther("200"),
      admin.address
    );
    await ch4.registerTank(await newTank.getAddress(), true);
    await ch4.setPlayerShip(newPlayer.address, newShipId);

    // Mint resources and deposit
    await ch4.mint(newPlayer.address, ethers.parseEther("100"));
    await ch4.connect(newPlayer).transfer(await newTank.getAddress(), ethers.parseEther("50"));

    expect(await ch4.balanceOf(await newTank.getAddress())).to.equal(ethers.parseEther("50"));
    expect(await ch4.balanceOf(newPlayer.address)).to.equal(ethers.parseEther("50"));
  });

  it("should handle zero amount transfers", async function () {
    await shipNFT.setShipZone(1, 5);
    await shipNFT.setShipZone(2, 5);
    await ch4.setPlayerShip(player1.address, 1);
    await ch4.mint(player1.address, ethers.parseEther("100"));

    // Zero transfer should succeed (ERC20 allows it)
    await ch4.connect(player1).transfer(player2.address, 0);
  });
});
