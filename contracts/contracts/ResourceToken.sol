// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ResourceToken
 * @notice ERC-20 token representing in-game resources (CH4, O2, H2O, CO2, N2)
 * @dev Admin-only minting, burnable by holders
 */
contract ResourceToken is ERC20, ERC20Burnable, Ownable {
    /**
     * @notice Deploy a new resource token
     * @param name Token name (e.g., "Methane")
     * @param symbol Token symbol (e.g., "CH4")
     */
    constructor(string memory name, string memory symbol)
        ERC20(name, symbol)
        Ownable(msg.sender)
    {}

    /**
     * @notice Mint new tokens (admin only)
     * @param to Recipient address
     * @param amount Amount to mint (18 decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
