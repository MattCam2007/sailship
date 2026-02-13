# Token Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace simple ResourceToken with physics-enforced GameResource system where all resource transfers are gated by spatial proximity between ships.

**Architecture:** ShipNFT gains zone/proximity tracking and `canInteract()`. New abstract GameResource ERC-20 overrides `_update` to enforce proximity on transfers, resource compatibility on tank deposits, and capacity limits. StorageTankAccount (ERC-6551 TBA) provides per-ship typed cargo storage. Five concrete tokens (CH4, O2, H2O, CO2, N2) inherit from GameResource.

**Tech Stack:** Solidity 0.8.20, OpenZeppelin 5.x (ERC-721, ERC-20, Ownable, Base64, Strings, Clones), Hardhat, ethers.js v6, Chai.

**Design Doc:** `docs/plans/2026-02-12-token-upgrade-design.md`

---

## Known Limitations

- **CelestialBody.harvest()** currently calls `IERC20.transfer()` from its own balance. With GameResource's `_update` override, this would fail because CelestialBody can't be resolved to a ship. The harvest flow shifts to the backend calling `GameResource.mint()` directly. CelestialBody.harvest() is effectively deprecated for new tokens but the contract itself is NOT modified.
- **Existing ResourceToken.sol** is deleted at the end. The old deployment script and ResourceToken.test.js are replaced.

---

## Phase 1: Setup & Interfaces

### Task 1: Project Setup

**Files:**
- Create: `contracts/contracts/interfaces/` (directory)
- Create: `contracts/contracts/tokens/` (directory)
- Create: `contracts/test/tokens/` (directory)
- Create: `contracts/test/integration/` (directory)

**Step 1: Create directories**

```bash
cd /Users/mattcameron/Projects/sailship/contracts
mkdir -p contracts/interfaces contracts/tokens test/tokens test/integration
```

**Step 2: Verify existing tests still pass**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test`
Expected: All 72 existing tests pass.

**Step 3: Commit**

```bash
git add -A && git commit -m "[Task 1] Project setup: create directories for new contracts"
```

---

### Task 2: Write Interfaces

**Files:**
- Create: `contracts/contracts/interfaces/IShipNFT.sol`
- Create: `contracts/contracts/interfaces/IStorageTankAccount.sol`
- Create: `contracts/contracts/interfaces/IGameResource.sol`

**Step 1: Write IShipNFT.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IShipNFT
/// @notice Interface for the ShipNFT contract's zone and proximity features
interface IShipNFT {
    function ownerOf(uint256 tokenId) external view returns (address);
    function shipZone(uint256 shipId) external view returns (uint256);
    function canInteract(uint256 shipA, uint256 shipB) external view returns (bool);
    function shipImage(uint256 shipId) external view returns (string memory);
    function shipDescription(uint256 shipId) external view returns (string memory);
}
```

**Step 2: Write IStorageTankAccount.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IStorageTankAccount
/// @notice Interface for ERC-6551 storage tank accounts bound to ships
interface IStorageTankAccount {
    function allowedResource() external view returns (address);
    function capacity() external view returns (uint256);
    function tokenId() external view returns (uint256);
    function shipNFT() external view returns (address);
    function owner() external view returns (address);
    function withdraw(uint256 amount, address to) external;
}
```

**Step 3: Write IGameResource.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IGameResource
/// @notice Interface for physics-enforced resource tokens
interface IGameResource {
    error NoPhysicalPathway();
    error WrongResource();
    error ExceedsCapacity();
    error ShipNotRegistered();

    event TankRegistered(address indexed tank, bool status);
    event PlayerShipSet(address indexed player, uint256 indexed shipId);

    function registeredTanks(address tank) external view returns (bool);
    function playerShip(address player) external view returns (uint256);
    function resolveShip(address addr) external view returns (uint256);
    function image() external view returns (string memory);
    function description() external view returns (string memory);

    function mint(address to, uint256 amount) external;
    function burnFrom(address tank, uint256 amount) external;
    function registerTank(address tank, bool status) external;
    function setPlayerShip(address player, uint256 shipId) external;
    function setShipContract(address shipContract) external;
    function setImage(string calldata uri) external;
    function setDescription(string calldata desc) external;
}
```

**Step 4: Compile to verify syntax**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat compile`
Expected: Compilation successful.

**Step 5: Commit**

```bash
git add contracts/interfaces/ && git commit -m "[Task 2] Add interfaces: IShipNFT, IStorageTankAccount, IGameResource"
```

---

## Phase 2: ShipNFT Enhancements

### Task 3: ShipNFT — Zone Tracking

**Files:**
- Modify: `contracts/contracts/ShipNFT.sol`
- Modify: `contracts/test/ShipNFT.test.js`

**Step 1: Write failing tests — add to the end of ShipNFT.test.js**

```javascript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/ShipNFT.test.js`
Expected: FAIL — `shipNFT.shipZone is not a function`

**Step 3: Implement zone tracking in ShipNFT.sol**

Add to ShipNFT.sol (after `_shipStats` mapping):

```solidity
// Zone tracking
mapping(uint256 => uint256) private _shipZones;

// Custom errors
error ArrayLengthMismatch();

// Events
event ZoneUpdated(uint256 indexed shipId, uint256 zone);

/// @notice Get a ship's current zone
/// @param shipId The token ID
/// @return The zone ID (0 = deep space)
function shipZone(uint256 shipId) external view returns (uint256) {
    return _shipZones[shipId];
}

/// @notice Set a ship's zone (admin only)
/// @param shipId The token ID
/// @param zone The zone ID (0 = deep space)
function setShipZone(uint256 shipId, uint256 zone) external onlyOwner {
    _shipZones[shipId] = zone;
    emit ZoneUpdated(shipId, zone);
}

/// @notice Batch update ship zones (admin only)
/// @param shipIds Array of token IDs
/// @param zones Array of zone IDs
function setShipZoneBatch(uint256[] calldata shipIds, uint256[] calldata zones) external onlyOwner {
    if (shipIds.length != zones.length) revert ArrayLengthMismatch();
    for (uint256 i = 0; i < shipIds.length; i++) {
        _shipZones[shipIds[i]] = zones[i];
        emit ZoneUpdated(shipIds[i], zones[i]);
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/ShipNFT.test.js`
Expected: All tests pass (existing + new zone tests).

**Step 5: Commit**

```bash
git add contracts/contracts/ShipNFT.sol test/ShipNFT.test.js
git commit -m "[Task 3] ShipNFT: add zone tracking with setShipZone and batch updates"
```

---

### Task 4: ShipNFT — Proximity & canInteract

**Files:**
- Modify: `contracts/contracts/ShipNFT.sol`
- Modify: `contracts/test/ShipNFT.test.js`

**Step 1: Write failing tests — add to ShipNFT.test.js**

```javascript
describe("Proximity", function () {
  let ship1, ship2;

  beforeEach(async function () {
    await shipNFT.mintShip(addr1.address, "CLASS-A", 10000, 3000000, 9000, 5, 1000000);
    await shipNFT.mintShip(addr2.address, "CLASS-B", 10000, 3000000, 9000, 5, 1000000);
    ship1 = 1;
    ship2 = 2;
  });

  it("should allow admin to set nearby", async function () {
    await shipNFT.setNearby(ship1, ship2, true);
    // No revert = success. Verified via canInteract below.
  });

  it("should set both directions automatically", async function () {
    await shipNFT.setNearby(ship1, ship2, true);
    // Both directions verified via canInteract
    // Put both in zone 0 (deep space)
    // canInteract should return true from both perspectives
  });

  it("should emit ProximitySet event", async function () {
    await expect(shipNFT.setNearby(ship1, ship2, true))
      .to.emit(shipNFT, "ProximitySet")
      .withArgs(ship1, ship2, true);
  });

  it("should reject setNearby from non-owner", async function () {
    await expect(
      shipNFT.connect(addr1).setNearby(ship1, ship2, true)
    ).to.be.revertedWithCustomError(shipNFT, "OwnableUnauthorizedAccount");
  });

  it("should toggle proximity on and off", async function () {
    await shipNFT.setNearby(ship1, ship2, true);
    await shipNFT.setNearby(ship1, ship2, false);
    // Verified via canInteract tests below
  });
});

describe("canInteract", function () {
  let ship1, ship2;

  beforeEach(async function () {
    await shipNFT.mintShip(addr1.address, "CLASS-A", 10000, 3000000, 9000, 5, 1000000);
    await shipNFT.mintShip(addr2.address, "CLASS-B", 10000, 3000000, 9000, 5, 1000000);
    ship1 = 1;
    ship2 = 2;
  });

  it("should return true for same ship", async function () {
    expect(await shipNFT.canInteract(ship1, ship1)).to.be.true;
  });

  it("should return true for same non-zero zone", async function () {
    await shipNFT.setShipZone(ship1, 42);
    await shipNFT.setShipZone(ship2, 42);
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.true;
  });

  it("should return false for different non-zero zones", async function () {
    await shipNFT.setShipZone(ship1, 10);
    await shipNFT.setShipZone(ship2, 20);
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.false;
  });

  it("should return false for both in zone 0 without proximity", async function () {
    // Both default to zone 0
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.false;
  });

  it("should return true for zone 0 ships with proximity flag", async function () {
    await shipNFT.setNearby(ship1, ship2, true);
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.true;
  });

  it("should return true bidirectionally for proximity", async function () {
    await shipNFT.setNearby(ship1, ship2, true);
    expect(await shipNFT.canInteract(ship2, ship1)).to.be.true;
  });

  it("should return false after proximity is removed", async function () {
    await shipNFT.setNearby(ship1, ship2, true);
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.true;
    await shipNFT.setNearby(ship1, ship2, false);
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.false;
  });

  it("should return true after ship docks (zone change)", async function () {
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.false;
    await shipNFT.setShipZone(ship1, 5);
    await shipNFT.setShipZone(ship2, 5);
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.true;
  });

  it("should return false after ship undocks", async function () {
    await shipNFT.setShipZone(ship1, 5);
    await shipNFT.setShipZone(ship2, 5);
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.true;
    await shipNFT.setShipZone(ship1, 0); // undock to deep space
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.false;
  });

  it("should handle one ship at station, one in deep space", async function () {
    await shipNFT.setShipZone(ship1, 5);
    // ship2 remains zone 0
    expect(await shipNFT.canInteract(ship1, ship2)).to.be.false;
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/ShipNFT.test.js`
Expected: FAIL — `shipNFT.setNearby is not a function`

**Step 3: Implement proximity and canInteract in ShipNFT.sol**

Add to ShipNFT.sol:

```solidity
// Proximity tracking (deep space)
mapping(uint256 => mapping(uint256 => bool)) private _nearby;

// Events
event ProximitySet(uint256 indexed shipA, uint256 indexed shipB, bool nearby);

/// @notice Check if two ships can exchange resources
/// @param shipA First ship token ID
/// @param shipB Second ship token ID
/// @return True if ships can interact
function canInteract(uint256 shipA, uint256 shipB) external view returns (bool) {
    if (shipA == shipB) return true;

    uint256 zoneA = _shipZones[shipA];
    uint256 zoneB = _shipZones[shipB];

    // Same non-zero zone = same location
    if (zoneA != 0 && zoneA == zoneB) return true;

    // Both in deep space with proximity flag
    if (zoneA == 0 && zoneB == 0 && _nearby[shipA][shipB]) return true;

    return false;
}

/// @notice Set deep space proximity between two ships (admin only)
/// @param shipA First ship token ID
/// @param shipB Second ship token ID
/// @param nearby Whether ships are nearby
function setNearby(uint256 shipA, uint256 shipB, bool nearby) external onlyOwner {
    _nearby[shipA][shipB] = nearby;
    _nearby[shipB][shipA] = nearby;
    emit ProximitySet(shipA, shipB, nearby);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/ShipNFT.test.js`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add contracts/contracts/ShipNFT.sol test/ShipNFT.test.js
git commit -m "[Task 4] ShipNFT: add proximity tracking and canInteract"
```

---

### Task 5: ShipNFT — Image, Description & tokenURI

**Files:**
- Modify: `contracts/contracts/ShipNFT.sol`
- Modify: `contracts/test/ShipNFT.test.js`

**Step 1: Write failing tests — add to ShipNFT.test.js**

```javascript
describe("Ship Metadata", function () {
  let tokenId;

  beforeEach(async function () {
    await shipNFT.mintShip(addr1.address, "HELIOS-CLASS", 10000, 3000000, 9000, 5, 1000000);
    tokenId = 1;
  });

  it("should default image to empty string", async function () {
    expect(await shipNFT.shipImage(tokenId)).to.equal("");
  });

  it("should default description to empty string", async function () {
    expect(await shipNFT.shipDescription(tokenId)).to.equal("");
  });

  it("should allow admin to set ship image", async function () {
    await shipNFT.setShipImage(tokenId, "ipfs://QmTest123");
    expect(await shipNFT.shipImage(tokenId)).to.equal("ipfs://QmTest123");
  });

  it("should allow admin to set ship description", async function () {
    await shipNFT.setShipDescription(tokenId, "A fast solar sailer");
    expect(await shipNFT.shipDescription(tokenId)).to.equal("A fast solar sailer");
  });

  it("should reject setShipImage from non-owner", async function () {
    await expect(
      shipNFT.connect(addr1).setShipImage(tokenId, "ipfs://hack")
    ).to.be.revertedWithCustomError(shipNFT, "OwnableUnauthorizedAccount");
  });

  it("should reject setShipDescription from non-owner", async function () {
    await expect(
      shipNFT.connect(addr1).setShipDescription(tokenId, "hacked")
    ).to.be.revertedWithCustomError(shipNFT, "OwnableUnauthorizedAccount");
  });
});

describe("tokenURI (enhanced)", function () {
  let tokenId;

  beforeEach(async function () {
    await shipNFT.mintShip(addr1.address, "HELIOS-CLASS", 10000, 3000000, 9000, 5, 1000000);
    tokenId = 1;
    await shipNFT.setShipImage(tokenId, "ipfs://QmShipImage");
    await shipNFT.setShipDescription(tokenId, "A legendary solar sailer");
  });

  it("should return base64-encoded JSON", async function () {
    const uri = await shipNFT.tokenURI(tokenId);
    expect(uri).to.match(/^data:application\/json;base64,/);
  });

  it("should contain name, image, and description", async function () {
    const uri = await shipNFT.tokenURI(tokenId);
    const json = JSON.parse(
      Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString()
    );
    expect(json.name).to.include("HELIOS-CLASS");
    expect(json.name).to.include("#1");
    expect(json.image).to.equal("ipfs://QmShipImage");
    expect(json.description).to.equal("A legendary solar sailer");
  });

  it("should update when image changes", async function () {
    await shipNFT.setShipImage(tokenId, "ipfs://QmNewImage");
    const uri = await shipNFT.tokenURI(tokenId);
    const json = JSON.parse(
      Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString()
    );
    expect(json.image).to.equal("ipfs://QmNewImage");
  });

  it("should revert for nonexistent token", async function () {
    await expect(shipNFT.tokenURI(999))
      .to.be.revertedWithCustomError(shipNFT, "ERC721NonexistentToken");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/ShipNFT.test.js`
Expected: FAIL — `shipNFT.shipImage is not a function`

**Step 3: Implement metadata and enhanced tokenURI**

Add imports to ShipNFT.sol:

```solidity
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
```

Add state and functions:

```solidity
using Strings for uint256;

// Per-token metadata
mapping(uint256 => string) private _shipImage;
mapping(uint256 => string) private _shipDescription;

/// @notice Get ship image URI
function shipImage(uint256 shipId) external view returns (string memory) {
    return _shipImage[shipId];
}

/// @notice Get ship description
function shipDescription(uint256 shipId) external view returns (string memory) {
    return _shipDescription[shipId];
}

/// @notice Set ship image URI (admin only)
function setShipImage(uint256 shipId, string calldata imageUri) external onlyOwner {
    _shipImage[shipId] = imageUri;
}

/// @notice Set ship description (admin only)
function setShipDescription(uint256 shipId, string calldata desc) external onlyOwner {
    _shipDescription[shipId] = desc;
}
```

Replace the existing `tokenURI` function and remove `_toString`:

```solidity
/// @notice Generate on-chain JSON metadata as base64 data URI
function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
    _requireOwned(tokenId);
    ShipStats memory stats = _shipStats[tokenId];

    string memory json = string(abi.encodePacked(
        '{"name":"', stats.className, ' #', tokenId.toString(), '"',
        ',"image":"', _shipImage[tokenId], '"',
        ',"description":"', _shipDescription[tokenId], '"}'
    ));

    return string(abi.encodePacked(
        "data:application/json;base64,",
        Base64.encode(bytes(json))
    ));
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/ShipNFT.test.js`
Expected: All tests pass. Note: the old tokenURI test may need updating since the format changed from `data:application/json;utf8` to `data:application/json;base64,`.

**Step 5: Fix old tokenURI test if needed**

Update the existing tokenURI test to match the new base64 format:

```javascript
it("should return a tokenURI for minted ships", async function () {
  await shipNFT.mintShip(addr1.address, "HELIOS-CLASS", 10000, 3000000, 9000, 5, 1000000);
  const uri = await shipNFT.tokenURI(1);
  expect(uri).to.match(/^data:application\/json;base64,/);
  const json = JSON.parse(
    Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString()
  );
  expect(json.name).to.include("HELIOS-CLASS");
  expect(json.name).to.include("#1");
});
```

**Step 6: Run full test suite**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test`
Expected: All tests pass (existing + new).

**Step 7: Commit**

```bash
git add contracts/contracts/ShipNFT.sol test/ShipNFT.test.js
git commit -m "[Task 5] ShipNFT: add image/description metadata and base64 tokenURI"
```

---

## Phase 3: StorageTankAccount

### Task 6: StorageTankAccount — Initialization & Views

**Files:**
- Create: `contracts/contracts/StorageTankAccount.sol`
- Create: `contracts/test/StorageTankAccount.test.js`

**Step 1: Write failing test**

```javascript
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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/StorageTankAccount.test.js`
Expected: FAIL — compilation error (StorageTankAccount not found)

**Step 3: Write minimal StorageTankAccount.sol**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title StorageTankAccount
/// @notice ERC-6551 compatible storage tank bound to a Ship NFT
/// @dev Holds a single resource type with a capacity limit
contract StorageTankAccount {
    address private _shipNFT;
    uint256 private _tokenId;
    address private _allowedResource;
    uint256 private _capacity;
    address private _admin;
    bool private _initialized;

    error AlreadyInitialized();
    error NotAdmin();
    error NotShipOwner();
    error InsufficientBalance();

    /// @notice Initialize the tank (called once after proxy deployment)
    function initialize(
        address shipNFTAddr,
        uint256 shipTokenId,
        address allowedResourceAddr,
        uint256 initialCapacity,
        address adminAddr
    ) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;
        _shipNFT = shipNFTAddr;
        _tokenId = shipTokenId;
        _allowedResource = allowedResourceAddr;
        _capacity = initialCapacity;
        _admin = adminAddr;
    }

    /// @notice Get the allowed resource token address
    function allowedResource() external view returns (address) {
        return _allowedResource;
    }

    /// @notice Get the tank capacity
    function capacity() external view returns (uint256) {
        return _capacity;
    }

    /// @notice Get the parent ship's token ID
    function tokenId() external view returns (uint256) {
        return _tokenId;
    }

    /// @notice Get the ship NFT contract address
    function shipNFT() external view returns (address) {
        return _shipNFT;
    }

    /// @notice Get the ship owner (resolves via NFT ownership)
    function owner() public view returns (address) {
        return IERC721(_shipNFT).ownerOf(_tokenId);
    }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/StorageTankAccount.test.js`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add contracts/contracts/StorageTankAccount.sol test/StorageTankAccount.test.js
git commit -m "[Task 6] StorageTankAccount: initialization and view functions"
```

---

### Task 7: StorageTankAccount — Capacity & Withdraw

**Files:**
- Modify: `contracts/contracts/StorageTankAccount.sol`
- Modify: `contracts/test/StorageTankAccount.test.js`

**Step 1: Write failing tests — add to StorageTankAccount.test.js**

```javascript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/StorageTankAccount.test.js`
Expected: FAIL — `tank.setCapacity is not a function`

**Step 3: Implement setCapacity and withdraw**

Add to StorageTankAccount.sol:

```solidity
event CapacityUpdated(uint256 newCapacity);
event Withdrawal(address indexed to, uint256 amount);

modifier onlyAdmin() {
    if (msg.sender != _admin) revert NotAdmin();
    _;
}

modifier onlyShipOwner() {
    if (msg.sender != owner()) revert NotShipOwner();
    _;
}

/// @notice Update tank capacity (admin only)
/// @param newCapacity New capacity value
function setCapacity(uint256 newCapacity) external onlyAdmin {
    _capacity = newCapacity;
    emit CapacityUpdated(newCapacity);
}

/// @notice Withdraw resources from the tank (ship owner only)
/// @param amount Amount to withdraw
/// @param to Recipient address
function withdraw(uint256 amount, address to) external onlyShipOwner {
    IERC20(_allowedResource).transfer(to, amount);
    emit Withdrawal(to, amount);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/StorageTankAccount.test.js`
Expected: All tests pass.

**Step 5: Run full suite**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add contracts/contracts/StorageTankAccount.sol test/StorageTankAccount.test.js
git commit -m "[Task 7] StorageTankAccount: capacity management and owner withdrawal"
```

---

## Phase 4: GameResource & Concrete Tokens

### Task 8: GameResource — Basic Mint & Metadata

**Files:**
- Create: `contracts/contracts/GameResource.sol`
- Create: `contracts/test/GameResource.test.js`

**Step 1: Write failing test**

```javascript
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

    // Deploy a concrete token (we need one to test GameResource since it's abstract)
    // We'll create a minimal concrete contract for testing
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
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/GameResource.test.js`
Expected: FAIL — compilation error (GameResource and CH4 not found)

**Step 3: Write GameResource.sol and CH4.sol**

`contracts/contracts/GameResource.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IShipNFT.sol";
import "./interfaces/IStorageTankAccount.sol";

/// @title GameResource
/// @notice Abstract ERC-20 with physics-enforced transfers
/// @dev All resource tokens inherit from this. _update enforces proximity, compatibility, and capacity.
abstract contract GameResource is ERC20, Ownable {
    error NoPhysicalPathway();
    error WrongResource();
    error ExceedsCapacity();
    error ShipNotRegistered();

    event TankRegistered(address indexed tank, bool status);
    event PlayerShipSet(address indexed player, uint256 indexed shipId);

    IShipNFT public shipContract;
    mapping(address => bool) public registeredTanks;
    mapping(address => uint256) public playerShip;
    string public image;
    string public description;

    constructor(
        string memory name_,
        string memory symbol_,
        address admin_,
        address shipContract_
    ) ERC20(name_, symbol_) Ownable(admin_) {
        shipContract = IShipNFT(shipContract_);
    }

    /// @notice Mint new tokens (admin only — mining faucet)
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Set resource image URI (admin only)
    function setImage(string calldata uri) external onlyOwner {
        image = uri;
    }

    /// @notice Set resource description (admin only)
    function setDescription(string calldata desc) external onlyOwner {
        description = desc;
    }

    /// @notice Update the ship contract reference (admin only)
    function setShipContract(address shipContract_) external onlyOwner {
        shipContract = IShipNFT(shipContract_);
    }
}
```

`contracts/contracts/tokens/CH4.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameResource.sol";

/// @title CH4 — Methane resource token
contract CH4 is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Methane", "CH4", admin, shipContract_) {}
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/GameResource.test.js`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add contracts/contracts/GameResource.sol contracts/tokens/CH4.sol test/GameResource.test.js
git commit -m "[Task 8] GameResource: base contract with mint and metadata"
```

---

### Task 9: GameResource — Tank Registration & resolveShip

**Files:**
- Modify: `contracts/contracts/GameResource.sol`
- Modify: `contracts/test/GameResource.test.js`

**Step 1: Write failing tests — add to GameResource.test.js**

```javascript
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
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/GameResource.test.js`
Expected: FAIL — `resource.registerTank is not a function`

**Step 3: Implement tank registration, player-ship mapping, and resolveShip**

Add to GameResource.sol:

```solidity
/// @notice Register or unregister a storage tank (admin only)
function registerTank(address tank, bool status) external onlyOwner {
    registeredTanks[tank] = status;
    emit TankRegistered(tank, status);
}

/// @notice Set which ship a player wallet is associated with (admin only)
function setPlayerShip(address player, uint256 shipId) external onlyOwner {
    playerShip[player] = shipId;
    emit PlayerShipSet(player, shipId);
}

/// @notice Resolve an address to its parent ship's token ID
/// @dev For tanks: reads tokenId() from the TBA. For wallets: reads playerShip mapping.
function resolveShip(address addr) public view returns (uint256) {
    if (registeredTanks[addr]) {
        return IStorageTankAccount(addr).tokenId();
    }
    return playerShip[addr];
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/GameResource.test.js`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add contracts/contracts/GameResource.sol test/GameResource.test.js
git commit -m "[Task 9] GameResource: tank registration, player-ship mapping, resolveShip"
```

---

### Task 10: GameResource — _update Proximity Enforcement

**Files:**
- Modify: `contracts/contracts/GameResource.sol`
- Modify: `contracts/test/GameResource.test.js`

**Step 1: Write failing tests — add to GameResource.test.js**

The test setup needs two ships with wallets associated. Tests cover all proximity scenarios.

```javascript
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
    // player1 is on ship 1, transferring to themselves (same ship)
    await resource.connect(player1).transfer(player1.address, ethers.parseEther("100"));
    // No revert = success
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
    // Both default to zone 0
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
    // Minting to player2 who is on a different ship — should work
    await resource.mint(player2.address, ethers.parseEther("500"));
    expect(await resource.balanceOf(player2.address)).to.equal(ethers.parseEther("500"));
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/GameResource.test.js`
Expected: FAIL — transfers succeed when they should revert (no `_update` override yet)

**Step 3: Implement _update override in GameResource.sol**

```solidity
/// @dev Override _update to enforce physics on all token movements
function _update(address from, address to, uint256 value) internal virtual override {
    // Proximity check: only on transfers (not mint or burn)
    if (from != address(0) && to != address(0)) {
        uint256 fromShip = resolveShip(from);
        uint256 toShip = resolveShip(to);
        if (!shipContract.canInteract(fromShip, toShip)) {
            revert NoPhysicalPathway();
        }
    }

    super._update(from, to, value);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/GameResource.test.js`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add contracts/contracts/GameResource.sol test/GameResource.test.js
git commit -m "[Task 10] GameResource: _update proximity enforcement on transfers"
```

---

### Task 11: GameResource — _update Tank Compatibility & Capacity

**Files:**
- Modify: `contracts/contracts/GameResource.sol`
- Modify: `contracts/test/GameResource.test.js`

**Step 1: Write failing tests — add to GameResource.test.js**

These tests need a second resource token to test wrong-resource scenarios. Add a helper at the top of the describe block to deploy a second token (O2).

```javascript
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
```

**Step 2: Run tests to verify they fail**

Expected: FAIL — transfers to tanks succeed without checking compatibility/capacity. Also FAIL if O2.sol doesn't exist yet.

**Step 3: Create O2.sol (needed for tests)**

`contracts/contracts/tokens/O2.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameResource.sol";

/// @title O2 — Oxygen resource token
contract O2 is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Oxygen", "O2", admin, shipContract_) {}
}
```

**Step 4: Extend _update override in GameResource.sol**

Update the `_update` function to add tank checks:

```solidity
function _update(address from, address to, uint256 value) internal virtual override {
    // Proximity check: only on transfers (not mint or burn)
    if (from != address(0) && to != address(0)) {
        uint256 fromShip = resolveShip(from);
        uint256 toShip = resolveShip(to);
        if (!shipContract.canInteract(fromShip, toShip)) {
            revert NoPhysicalPathway();
        }
    }

    // Tank checks: on any movement TO a registered tank (including mint)
    if (to != address(0) && registeredTanks[to]) {
        if (IStorageTankAccount(to).allowedResource() != address(this)) {
            revert WrongResource();
        }
        if (balanceOf(to) + value > IStorageTankAccount(to).capacity()) {
            revert ExceedsCapacity();
        }
    }

    super._update(from, to, value);
}
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/GameResource.test.js`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add contracts/contracts/GameResource.sol contracts/tokens/O2.sol test/GameResource.test.js
git commit -m "[Task 11] GameResource: _update tank compatibility and capacity checks"
```

---

### Task 12: GameResource — burnFrom

**Files:**
- Modify: `contracts/contracts/GameResource.sol`
- Modify: `contracts/test/GameResource.test.js`

**Step 1: Write failing tests**

```javascript
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
    // Burns should work regardless of zone/proximity
    await resource.burnFrom(await tank.getAddress(), ethers.parseEther("50"));
    // No revert = success
  });
});
```

**Step 2: Run tests to verify they fail**

Expected: FAIL — `resource.burnFrom is not a function`

**Step 3: Implement burnFrom**

Add to GameResource.sol:

```solidity
/// @notice Burn tokens from a tank (admin only — resource consumption)
/// @param tank The tank address to burn from
/// @param amount Amount to burn
function burnFrom(address tank, uint256 amount) external onlyOwner {
    _burn(tank, amount);
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/GameResource.test.js`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add contracts/contracts/GameResource.sol test/GameResource.test.js
git commit -m "[Task 12] GameResource: burnFrom for admin resource consumption"
```

---

### Task 13: Remaining Concrete Tokens

**Files:**
- Create: `contracts/contracts/tokens/H2O.sol`
- Create: `contracts/contracts/tokens/CO2.sol`
- Create: `contracts/contracts/tokens/N2.sol`
- Create: `contracts/test/tokens/CH4.test.js`
- Create: `contracts/test/tokens/O2.test.js`
- Create: `contracts/test/tokens/H2O.test.js`
- Create: `contracts/test/tokens/CO2.test.js`
- Create: `contracts/test/tokens/N2.test.js`

**Step 1: Create remaining token contracts**

Each follows the same trivial pattern as CH4.sol:

`H2O.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../GameResource.sol";
/// @title H2O — Water resource token
contract H2O is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Water", "H2O", admin, shipContract_) {}
}
```

`CO2.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../GameResource.sol";
/// @title CO2 — Carbon Dioxide resource token
contract CO2 is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Carbon Dioxide", "CO2", admin, shipContract_) {}
}
```

`N2.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "../GameResource.sol";
/// @title N2 — Nitrogen resource token
contract N2 is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Nitrogen", "N2", admin, shipContract_) {}
}
```

**Step 2: Write per-token tests**

Each token test verifies correct name/symbol and that it inherits GameResource. Use this template for each (substituting name, symbol, and factory name):

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CH4", function () {
  let token, shipNFT;
  let admin, player1;

  beforeEach(async function () {
    [admin, player1] = await ethers.getSigners();
    const ShipNFT = await ethers.getContractFactory("ShipNFT");
    shipNFT = await ShipNFT.deploy();
    const Token = await ethers.getContractFactory("CH4");
    token = await Token.deploy(admin.address, await shipNFT.getAddress());
  });

  it("should have correct name", async function () {
    expect(await token.name()).to.equal("Methane");
  });

  it("should have correct symbol", async function () {
    expect(await token.symbol()).to.equal("CH4");
  });

  it("should support admin mint", async function () {
    await token.mint(player1.address, ethers.parseEther("100"));
    expect(await token.balanceOf(player1.address)).to.equal(ethers.parseEther("100"));
  });
});
```

Repeat with appropriate name/symbol for O2 ("Oxygen"/"O2"), H2O ("Water"/"H2O"), CO2 ("Carbon Dioxide"/"CO2"), N2 ("Nitrogen"/"N2").

**Step 3: Run all tests**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add contracts/tokens/ test/tokens/
git commit -m "[Task 13] Add remaining concrete tokens: H2O, CO2, N2 with per-token tests"
```

---

## Phase 5: Integration Tests

### Task 14: Integration — Full Lifecycle

**Files:**
- Create: `contracts/test/integration/Lifecycle.test.js`

**Step 1: Write integration tests**

```javascript
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
```

**Step 2: Run integration tests**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test test/integration/Lifecycle.test.js`
Expected: All tests pass.

**Step 3: Run full test suite**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test`
Expected: All tests pass (unit + integration).

**Step 4: Commit**

```bash
git add test/integration/Lifecycle.test.js
git commit -m "[Task 14] Integration tests: full lifecycle, trading, edge cases"
```

---

## Phase 6: Cleanup & Deployment

### Task 15: Delete ResourceToken & Update Deployment

**Files:**
- Delete: `contracts/contracts/ResourceToken.sol`
- Delete: `contracts/test/ResourceToken.test.js`
- Modify: `contracts/scripts/deploy.js` (if it exists and references ResourceToken)

**Step 1: Delete old files**

```bash
cd /Users/mattcameron/Projects/sailship/contracts
rm contracts/ResourceToken.sol test/ResourceToken.test.js
```

**Step 2: Verify compilation still succeeds**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat compile`
Expected: Compilation successful. Check for warnings about CelestialBody.sol importing ResourceToken — if so, update CelestialBody to use `IERC20` directly (it already does based on the code reviewed).

**Step 3: Run full test suite**

Run: `cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test`
Expected: All remaining tests pass. ResourceToken tests are gone but all new tests pass.

**Step 4: Update deployment script**

Read `contracts/scripts/deploy.js` first to understand current deployment flow. Update it to deploy the new contracts:
1. Deploy ShipNFT (same as before)
2. Deploy 5 GameResource tokens (CH4, O2, H2O, CO2, N2) with admin and shipNFT addresses
3. Deploy StorageTankAccount instances as needed
4. Register in GameRegistry

The exact changes depend on the current deploy.js content — read it first, then modify to replace `ResourceToken.deploy("Methane", "CH4")` calls with `CH4.deploy(admin.address, shipNFT.address)` etc.

**Step 5: Commit**

```bash
git add -A
git commit -m "[Task 15] Cleanup: remove ResourceToken, update deployment script"
```

---

### Task 16: Backoffice Updates

**Files:**
- Modify: `backoffice/server/routes/resources.js`
- Modify: `backoffice/server/routes/ships.js`
- Modify: `backoffice/public/abis/` (regenerate ABIs)
- Potentially create new route files for zones, proximity, tanks

**Step 1: Export updated ABIs**

```bash
cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat compile && node scripts/export-abis.js
```

**Step 2: Read existing backoffice code to understand current patterns**

Read these files before modifying:
- `backoffice/server/routes/resources.js`
- `backoffice/server/routes/ships.js`
- `backoffice/server/services/contracts.js`
- `backoffice/.env`

**Step 3: Update contract instances in services/contracts.js**

Replace ResourceToken references with individual GameResource token contracts (CH4, O2, H2O, CO2, N2). Each token is now its own contract with its own ABI.

**Step 4: Add new API routes**

New endpoints needed:
- `POST /ships/:tokenId/zone` → calls `shipNFT.setShipZone(tokenId, zone)`
- `POST /ships/zones/batch` → calls `shipNFT.setShipZoneBatch(ids, zones)`
- `POST /ships/nearby` → calls `shipNFT.setNearby(shipA, shipB, nearby)`
- `POST /resources/:symbol/register-tank` → calls `token.registerTank(tankAddr, true)`
- `POST /resources/:symbol/player-ship` → calls `token.setPlayerShip(player, shipId)`
- `POST /resources/:symbol/burn` → calls `token.burnFrom(tank, amount)`

**Step 5: Update .env with new contract addresses**

After redeployment, update contract addresses. Note: each token now has its own contract factory name (CH4, O2, H2O, CO2, N2).

**Step 6: Test backoffice**

```bash
cd /Users/mattcameron/Projects/sailship/backoffice && npm test
```

Fix any failing tests, update test expectations for new contract interfaces.

**Step 7: Commit**

```bash
git add backoffice/
git commit -m "[Task 16] Backoffice: update for new GameResource contract interfaces"
```

---

### Task 17: Final Verification

**Step 1: Run full contract test suite**

```bash
cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat test
```
Expected: All tests pass.

**Step 2: Run coverage report**

```bash
cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat coverage
```
Expected: >95% coverage on all new contracts.

**Step 3: Verify compilation with no warnings**

```bash
cd /Users/mattcameron/Projects/sailship/contracts && npx hardhat compile 2>&1
```
Expected: Clean compilation.

**Step 4: Run backoffice tests**

```bash
cd /Users/mattcameron/Projects/sailship/backoffice && npm test
```
Expected: All tests pass.

**Step 5: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "[Task 17] Final verification: all tests passing"
```

---

## Task Summary

| Task | Phase | Description | Key Files |
|------|-------|-------------|-----------|
| 1 | Setup | Create directories, verify baseline | directories |
| 2 | Interfaces | IShipNFT, IStorageTankAccount, IGameResource | contracts/interfaces/*.sol |
| 3 | ShipNFT | Zone tracking (setShipZone, batch) | ShipNFT.sol |
| 4 | ShipNFT | Proximity & canInteract | ShipNFT.sol |
| 5 | ShipNFT | Image, description, base64 tokenURI | ShipNFT.sol |
| 6 | Tank | Initialization & view functions | StorageTankAccount.sol |
| 7 | Tank | Capacity management & withdraw | StorageTankAccount.sol |
| 8 | Resource | Basic mint & metadata | GameResource.sol, CH4.sol |
| 9 | Resource | Tank registration & resolveShip | GameResource.sol |
| 10 | Resource | _update proximity enforcement | GameResource.sol |
| 11 | Resource | _update tank compatibility & capacity | GameResource.sol, O2.sol |
| 12 | Resource | burnFrom | GameResource.sol |
| 13 | Tokens | H2O, CO2, N2 + per-token tests | tokens/*.sol |
| 14 | Integration | Full lifecycle tests | Lifecycle.test.js |
| 15 | Cleanup | Delete ResourceToken, update deploy script | deploy.js |
| 16 | Backoffice | Update ABIs, routes, services | backoffice/ |
| 17 | Verify | Full test suite, coverage, final check | all |
