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
