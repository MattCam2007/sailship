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

    /// @notice Initialize the tank (called once after deployment)
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
