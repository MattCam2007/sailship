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
