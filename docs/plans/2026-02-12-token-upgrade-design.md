# Token Upgrade: Physics-Enforced Resource System

**Date:** 2026-02-12
**Branch:** token-upgrade
**Status:** Approved

## 1. Problem Statement

The current resource tokens (ResourceToken.sol) are simple ERC-20s with no transfer restrictions. Any wallet can send tokens to any other wallet regardless of in-game location. The spec requires "resources obey physics, but markets are free" — meaning transfers must be gated by spatial proximity (same zone or flagged nearby in deep space).

## 2. Architecture

### Contracts Modified

| Contract | Action | Summary |
|----------|--------|---------|
| ShipNFT.sol | MODIFY | Add zones, proximity, `canInteract()`, per-token image/description. Keep existing ShipStats. |
| StorageTankAccount.sol | NEW | ERC-6551 TBA with allowedResource + capacity. |
| GameResource.sol | NEW | Abstract ERC-20 base. `_update` override enforces physics. |
| CH4.sol | NEW | Concrete token inheriting GameResource. |
| O2.sol | NEW | Concrete token inheriting GameResource. |
| H2O.sol | NEW | Concrete token inheriting GameResource. |
| CO2.sol | NEW | Concrete token inheriting GameResource. |
| N2.sol | NEW | Concrete token inheriting GameResource. |
| ResourceToken.sol | DELETE | Replaced by GameResource + concrete tokens. |
| IShipNFT.sol | NEW | Interface for ShipNFT. |
| IStorageTankAccount.sol | NEW | Interface for StorageTankAccount. |
| IGameResource.sol | NEW | Interface for GameResource. |

### Contracts Unchanged

| Contract | Rationale |
|----------|-----------|
| GameRegistry.sol | Works as-is. Register new contracts post-deployment. |
| CelestialBody.sol | Emission profiles still valid. Harvest flow shifts to backend calling GameResource.mint() directly. |
| CelestialBodyRegistry.sol | Factory/registry unaffected. |

### New Dependency

`@erc6551/reference` — ERC-6551 reference implementation for token-bound account creation.

## 3. ShipNFT Changes

Existing functionality preserved: ERC-721, ShipStats struct, `mintShip()`, `getShipStats()`, `getShipTBA()`, `totalSupply()`.

### New State

```solidity
mapping(uint256 => uint256) public shipZone;                    // tokenId => zone (0 = deep space)
mapping(uint256 => mapping(uint256 => bool)) private _nearby;   // shipA => shipB => proximity
mapping(uint256 => string) private _shipImage;                  // tokenId => image URI
mapping(uint256 => string) private _shipDescription;            // tokenId => description
```

### New Functions

**Admin (onlyOwner):**
- `setShipZone(uint256 shipId, uint256 zone)` — update ship location
- `setShipZoneBatch(uint256[] shipIds, uint256[] zones)` — batch zone updates
- `setNearby(uint256 shipA, uint256 shipB, bool nearby)` — toggle deep space proximity (both directions)
- `setShipImage(uint256 shipId, string image)` — set ship image URI
- `setShipDescription(uint256 shipId, string description)` — set ship description

**View:**
- `canInteract(uint256 shipA, uint256 shipB) returns (bool)` — core physics check
- `shipImage(uint256 shipId) returns (string)`
- `shipDescription(uint256 shipId) returns (string)`

### canInteract Logic

```
if shipA == shipB → true
if both have same non-zero zone → true
if both in zone 0 AND _nearby[shipA][shipB] → true
otherwise → false
```

### tokenURI Enhancement

Returns base64-encoded JSON with name, image, description, and ship stats (existing fields).

## 4. StorageTankAccount

Minimal ERC-6551 TBA deployed as an ERC-1167 minimal proxy.

**State:**
- `allowedResource` (address) — set once at initialization, immutable
- `capacity` (uint256) — admin-configurable

**Functions:**
- `withdraw(uint256 amount, address to)` — ship owner pulls resources out
- `setCapacity(uint256 newCapacity)` — admin only
- `allowedResource() returns (address)` — view
- `capacity() returns (uint256)` — view
- `owner()` — resolves through ERC-6551 to Ship NFT owner
- `tokenId()` — returns parent ship's token ID (ERC-6551 context)

**Design principle:** The tank is a dumb bucket. It does NOT enforce deposits, check capacity, or verify proximity. All enforcement lives in GameResource's `_update`.

## 5. GameResource (Abstract ERC-20)

Replaces ResourceToken.sol. All 5 resource tokens inherit from this.

### State

```solidity
IShipNFT public shipContract;
mapping(address => bool) public registeredTanks;
mapping(address => uint256) public playerShip;  // wallet => shipId
string public image;
string public description;
```

### _update Override

The single chokepoint for all token movements:

```
if from != 0 AND to != 0:
    // Transfer — resolve both to ships, check canInteract
    uint256 fromShip = resolveShip(from)
    uint256 toShip = resolveShip(to)
    require(shipContract.canInteract(fromShip, toShip), NoPhysicalPathway)

if to != 0 AND registeredTanks[to]:
    // Destination is a tank — check compatibility and capacity
    require(IStorageTankAccount(to).allowedResource() == address(this), WrongResource)
    require(balanceOf(to) + amount <= IStorageTankAccount(to).capacity(), ExceedsCapacity)
```

### resolveShip Logic

```
if registeredTanks[addr] → call IStorageTankAccount(addr).tokenId()
else → return playerShip[addr]
```

### Admin Functions

- `mint(address to, uint256 amount)` — mining faucet
- `burnFrom(address tank, uint256 amount)` — consumption (bypasses allowance via internal `_burn`)
- `registerTank(address tank, bool status)` — register/unregister tanks
- `setPlayerShip(address player, uint256 shipId)` — wallet-to-ship association
- `setShipContract(address)` — point to ShipNFT
- `setImage(string)` / `setDescription(string)` — resource metadata

### Custom Errors

```solidity
error NoPhysicalPathway();
error WrongResource();
error ExceedsCapacity();
```

## 6. Concrete Token Contracts

Five trivial contracts:

```solidity
contract CH4 is GameResource {
    constructor(address admin, address shipContract)
        GameResource("Methane", "CH4", admin, shipContract) {}
}
// Same pattern for O2, H2O, CO2, N2
```

Image and description set post-deployment via admin calls.

## 7. Impact on Existing System

### CelestialBody.harvest()

Currently mints tokens directly via `ResourceToken.mint()`. With GameResource, the admin (backend) calls `GameResource.mint()` instead. CelestialBody continues to track emission profiles but the backend orchestrates the actual minting.

### Backoffice

All API routes that interact with tokens need updated ABIs. New routes needed:
- Zone management (setShipZone, setShipZoneBatch)
- Proximity management (setNearby)
- Tank deployment and registration
- Player-ship association (setPlayerShip)
- Resource metadata (setImage, setDescription)

### Tests

- ResourceToken.test.js → deleted
- New test files: ShipNFT.test.js (expanded), StorageTankAccount.test.js, GameResource.test.js, per-token tests, integration/Lifecycle.test.js

## 8. Excluded from Scope

- **TradeBroker contract** — `_update` enforcement handles P2P trading without a broker
- **CelestialBody modifications** — work fine as-is
- **Upgradeability patterns** — adds complexity, not in spec
- **Governance/staking** — separate future work

## 9. File Structure

```
contracts/contracts/
├── ShipNFT.sol                    (MODIFIED)
├── StorageTankAccount.sol         (NEW)
├── GameResource.sol               (NEW)
├── GameRegistry.sol               (UNCHANGED)
├── CelestialBody.sol              (UNCHANGED)
├── CelestialBodyRegistry.sol      (UNCHANGED)
├── tokens/
│   ├── CH4.sol                    (NEW)
│   ├── O2.sol                     (NEW)
│   ├── H2O.sol                    (NEW)
│   ├── CO2.sol                    (NEW)
│   └── N2.sol                     (NEW)
├── interfaces/
│   ├── IShipNFT.sol               (NEW)
│   ├── IStorageTankAccount.sol    (NEW)
│   └── IGameResource.sol          (NEW)
contracts/test/
├── ShipNFT.test.js                (REWRITTEN — expanded)
├── StorageTankAccount.test.js     (NEW)
├── GameResource.test.js           (NEW)
├── GameRegistry.test.js           (UNCHANGED)
├── CelestialBody.test.js          (UNCHANGED)
├── CelestialBodyRegistry.test.js  (UNCHANGED)
├── tokens/
│   ├── CH4.test.js                (NEW)
│   ├── O2.test.js                 (NEW)
│   ├── H2O.test.js                (NEW)
│   ├── CO2.test.js                (NEW)
│   └── N2.test.js                 (NEW)
├── integration/
│   └── Lifecycle.test.js          (NEW)
```
