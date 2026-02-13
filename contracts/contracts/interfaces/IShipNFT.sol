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
