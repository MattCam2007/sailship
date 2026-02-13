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

  describe("Tank Registration", function () {
    let tank;

    beforeEach(async function () {
      // Deploy a real StorageTankAccount
      await shipNFT.mintShip(player1.address, "HELIOS", 10000, 3000000, 9000, 5, 1000000);
      const Tank = await ethers.getContractFactory("StorageTankAccount");
      tank = await Tank.deploy();
      await tank.initialize(
        await shipNFT.getAddress(), 1,
        await resource.getAddress(), ethers.parseEther("1000"),
        admin.address
      );
    });

    it("should allow admin to register a tank", async function () {
      const tankAddr = await tank.getAddress();
      await resource.registerTank(tankAddr, true);
      expect(await resource.registeredTanks(tankAddr)).to.be.true;
    });

    it("should emit TankRegistered event", async function () {
      const tankAddr = await tank.getAddress();
      await expect(resource.registerTank(tankAddr, true))
        .to.emit(resource, "TankRegistered")
        .withArgs(tankAddr, true);
    });

    it("should allow admin to unregister a tank", async function () {
      const tankAddr = await tank.getAddress();
      await resource.registerTank(tankAddr, true);
      await resource.registerTank(tankAddr, false);
      expect(await resource.registeredTanks(tankAddr)).to.be.false;
    });

    it("should reject registerTank from non-admin", async function () {
      const tankAddr = await tank.getAddress();
      await expect(
        resource.connect(player1).registerTank(tankAddr, true)
      ).to.be.revertedWithCustomError(resource, "OwnableUnauthorizedAccount");
    });
  });

  describe("Player-Ship Association", function () {
    beforeEach(async function () {
      await shipNFT.mintShip(player1.address, "HELIOS", 10000, 3000000, 9000, 5, 1000000);
    });

    it("should allow admin to set player ship", async function () {
      await resource.setPlayerShip(player1.address, 1);
      expect(await resource.playerShip(player1.address)).to.equal(1);
    });

    it("should emit PlayerShipSet event", async function () {
      await expect(resource.setPlayerShip(player1.address, 1))
        .to.emit(resource, "PlayerShipSet")
        .withArgs(player1.address, 1);
    });

    it("should reject setPlayerShip from non-admin", async function () {
      await expect(
        resource.connect(player1).setPlayerShip(player1.address, 1)
      ).to.be.revertedWithCustomError(resource, "OwnableUnauthorizedAccount");
    });
  });

  describe("resolveShip", function () {
    let tank;

    beforeEach(async function () {
      await shipNFT.mintShip(player1.address, "HELIOS", 10000, 3000000, 9000, 5, 1000000);

      const Tank = await ethers.getContractFactory("StorageTankAccount");
      tank = await Tank.deploy();
      await tank.initialize(
        await shipNFT.getAddress(), 1,
        await resource.getAddress(), ethers.parseEther("1000"),
        admin.address
      );
      await resource.registerTank(await tank.getAddress(), true);
      await resource.setPlayerShip(player1.address, 1);
    });

    it("should resolve tank address to ship token ID", async function () {
      expect(await resource.resolveShip(await tank.getAddress())).to.equal(1);
    });

    it("should resolve player wallet to ship token ID", async function () {
      expect(await resource.resolveShip(player1.address)).to.equal(1);
    });
  });

  describe("Transfer — Proximity Enforcement", function () {
    beforeEach(async function () {
      // Mint two ships
      await shipNFT.mintShip(player1.address, "CLASS-A", 10000, 3000000, 9000, 5, 1000000);
      await shipNFT.mintShip(player2.address, "CLASS-B", 10000, 3000000, 9000, 5, 1000000);
      // Associate wallets with ships
      await resource.setPlayerShip(player1.address, 1);
      await resource.setPlayerShip(player2.address, 2);
      // Give player1 some tokens
      await resource.mint(player1.address, ethers.parseEther("1000"));
    });

    it("should allow transfer between addresses on the same ship", async function () {
      await resource.connect(player1).transfer(player1.address, ethers.parseEther("100"));
    });

    it("should allow transfer between ships at the same station", async function () {
      await shipNFT.setShipZone(1, 42);
      await shipNFT.setShipZone(2, 42);
      await resource.connect(player1).transfer(player2.address, ethers.parseEther("100"));
      expect(await resource.balanceOf(player2.address)).to.equal(ethers.parseEther("100"));
    });

    it("should revert transfer between ships at different stations", async function () {
      await shipNFT.setShipZone(1, 10);
      await shipNFT.setShipZone(2, 20);
      await expect(
        resource.connect(player1).transfer(player2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(resource, "NoPhysicalPathway");
    });

    it("should revert transfer between ships both in zone 0 without proximity", async function () {
      await expect(
        resource.connect(player1).transfer(player2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(resource, "NoPhysicalPathway");
    });

    it("should allow transfer between ships in zone 0 with proximity", async function () {
      await shipNFT.setNearby(1, 2, true);
      await resource.connect(player1).transfer(player2.address, ethers.parseEther("100"));
      expect(await resource.balanceOf(player2.address)).to.equal(ethers.parseEther("100"));
    });

    it("should succeed then fail when proximity is removed", async function () {
      await shipNFT.setNearby(1, 2, true);
      await resource.connect(player1).transfer(player2.address, ethers.parseEther("100"));
      await shipNFT.setNearby(1, 2, false);
      await expect(
        resource.connect(player1).transfer(player2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(resource, "NoPhysicalPathway");
    });

    it("should succeed after docking, fail after undocking", async function () {
      await shipNFT.setShipZone(1, 5);
      await shipNFT.setShipZone(2, 5);
      await resource.connect(player1).transfer(player2.address, ethers.parseEther("100"));
      await shipNFT.setShipZone(1, 0); // undock
      await expect(
        resource.connect(player1).transfer(player2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(resource, "NoPhysicalPathway");
    });

    it("should enforce proximity on transferFrom too", async function () {
      await resource.connect(player1).approve(player2.address, ethers.parseEther("100"));
      await expect(
        resource.connect(player2).transferFrom(player1.address, player2.address, ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(resource, "NoPhysicalPathway");
    });

    it("should skip proximity check on mint (from == address(0))", async function () {
      await resource.mint(player2.address, ethers.parseEther("500"));
      expect(await resource.balanceOf(player2.address)).to.equal(ethers.parseEther("500"));
    });
  });

  describe("Transfer — Tank Compatibility", function () {
    let ch4Tank, o2Token;

    beforeEach(async function () {
      await shipNFT.mintShip(player1.address, "HELIOS", 10000, 3000000, 9000, 5, 1000000);
      await resource.setPlayerShip(player1.address, 1);
      await resource.mint(player1.address, ethers.parseEther("1000"));

      // Deploy CH4 tank for ship 1
      const Tank = await ethers.getContractFactory("StorageTankAccount");
      ch4Tank = await Tank.deploy();
      await ch4Tank.initialize(
        await shipNFT.getAddress(), 1,
        await resource.getAddress(), ethers.parseEther("500"),
        admin.address
      );
      await resource.registerTank(await ch4Tank.getAddress(), true);

      // Deploy a second resource (O2) for wrong-resource testing
      const O2Factory = await ethers.getContractFactory("O2");
      o2Token = await O2Factory.deploy(admin.address, await shipNFT.getAddress());
    });

    it("should allow transfer of correct resource to matching tank", async function () {
      const tankAddr = await ch4Tank.getAddress();
      await resource.connect(player1).transfer(tankAddr, ethers.parseEther("100"));
      expect(await resource.balanceOf(tankAddr)).to.equal(ethers.parseEther("100"));
    });

    it("should revert transfer of wrong resource to tank", async function () {
      // Try to send O2 to a CH4 tank
      await o2Token.setPlayerShip(player1.address, 1);
      await o2Token.registerTank(await ch4Tank.getAddress(), true);
      await o2Token.mint(player1.address, ethers.parseEther("100"));
      await expect(
        o2Token.connect(player1).transfer(await ch4Tank.getAddress(), ethers.parseEther("50"))
      ).to.be.revertedWithCustomError(o2Token, "WrongResource");
    });
  });

  describe("Transfer — Tank Capacity", function () {
    let tank;

    beforeEach(async function () {
      await shipNFT.mintShip(player1.address, "HELIOS", 10000, 3000000, 9000, 5, 1000000);
      await resource.setPlayerShip(player1.address, 1);
      await resource.mint(player1.address, ethers.parseEther("2000"));

      const Tank = await ethers.getContractFactory("StorageTankAccount");
      tank = await Tank.deploy();
      await tank.initialize(
        await shipNFT.getAddress(), 1,
        await resource.getAddress(), ethers.parseEther("500"),
        admin.address
      );
      await resource.registerTank(await tank.getAddress(), true);
    });

    it("should allow transfer up to capacity", async function () {
      const tankAddr = await tank.getAddress();
      await resource.connect(player1).transfer(tankAddr, ethers.parseEther("500"));
      expect(await resource.balanceOf(tankAddr)).to.equal(ethers.parseEther("500"));
    });

    it("should revert transfer exceeding capacity", async function () {
      const tankAddr = await tank.getAddress();
      await expect(
        resource.connect(player1).transfer(tankAddr, ethers.parseEther("501"))
      ).to.be.revertedWithCustomError(resource, "ExceedsCapacity");
    });

    it("should handle cumulative transfers up to capacity", async function () {
      const tankAddr = await tank.getAddress();
      await resource.connect(player1).transfer(tankAddr, ethers.parseEther("300"));
      await resource.connect(player1).transfer(tankAddr, ethers.parseEther("200"));
      // Now at 500 (capacity). Next transfer should fail.
      await expect(
        resource.connect(player1).transfer(tankAddr, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(resource, "ExceedsCapacity");
    });

    it("should allow transfer after withdrawal frees space", async function () {
      const tankAddr = await tank.getAddress();
      await resource.connect(player1).transfer(tankAddr, ethers.parseEther("500"));
      // Withdraw 100 from tank
      await tank.connect(player1).withdraw(ethers.parseEther("100"), player1.address);
      // Now can deposit 100 more
      await resource.connect(player1).transfer(tankAddr, ethers.parseEther("100"));
      expect(await resource.balanceOf(tankAddr)).to.equal(ethers.parseEther("500"));
    });

    it("should check capacity on mint to tank", async function () {
      const tankAddr = await tank.getAddress();
      await expect(
        resource.mint(tankAddr, ethers.parseEther("501"))
      ).to.be.revertedWithCustomError(resource, "ExceedsCapacity");
    });

    it("should check resource compatibility on mint to tank", async function () {
      const O2Factory = await ethers.getContractFactory("O2");
      const o2Token = await O2Factory.deploy(admin.address, await shipNFT.getAddress());
      await o2Token.registerTank(await tank.getAddress(), true);
      await expect(
        o2Token.mint(await tank.getAddress(), ethers.parseEther("100"))
      ).to.be.revertedWithCustomError(o2Token, "WrongResource");
    });
  });

  describe("BurnFrom", function () {
    let tank;

    beforeEach(async function () {
      await shipNFT.mintShip(player1.address, "HELIOS", 10000, 3000000, 9000, 5, 1000000);
      await resource.setPlayerShip(player1.address, 1);

      const Tank = await ethers.getContractFactory("StorageTankAccount");
      tank = await Tank.deploy();
      await tank.initialize(
        await shipNFT.getAddress(), 1,
        await resource.getAddress(), ethers.parseEther("1000"),
        admin.address
      );
      await resource.registerTank(await tank.getAddress(), true);

      // Deposit tokens into tank
      await resource.mint(player1.address, ethers.parseEther("500"));
      await resource.connect(player1).transfer(await tank.getAddress(), ethers.parseEther("500"));
    });

    it("should allow admin to burn from tank", async function () {
      const tankAddr = await tank.getAddress();
      await resource.burnFrom(tankAddr, ethers.parseEther("50"));
      expect(await resource.balanceOf(tankAddr)).to.equal(ethers.parseEther("450"));
    });

    it("should reduce total supply on burn", async function () {
      await resource.burnFrom(await tank.getAddress(), ethers.parseEther("50"));
      expect(await resource.totalSupply()).to.equal(ethers.parseEther("450"));
    });

    it("should reject burnFrom from non-admin", async function () {
      await expect(
        resource.connect(player1).burnFrom(await tank.getAddress(), ethers.parseEther("50"))
      ).to.be.revertedWithCustomError(resource, "OwnableUnauthorizedAccount");
    });

    it("should skip all _update checks on burn (to == address(0))", async function () {
      await resource.burnFrom(await tank.getAddress(), ethers.parseEther("50"));
      // No revert = success
    });
  });
});
