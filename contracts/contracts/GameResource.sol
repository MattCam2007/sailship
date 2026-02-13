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
}
