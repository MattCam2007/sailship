// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GameRegistry
 * @notice Central registry for all game contract addresses
 * @dev Provides single source of truth for contract discovery
 */
contract GameRegistry is Ownable {
    // Core contract addresses
    address public shipNFT;
    address public celestialBodyRegistry;

    // Resource token mapping: symbol => address
    mapping(string => address) private resourceTokens;

    // Array of registered resource token symbols for iteration
    string[] private resourceSymbols;

    // Struct for returning resource token data
    struct ResourceToken {
        string symbol;
        address tokenAddress;
    }

    // Events
    event ContractRegistered(string indexed contractType, address indexed contractAddress);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Register ShipNFT contract address
     * @param _shipNFT Address of ShipNFT contract
     */
    function setShipNFT(address _shipNFT) external onlyOwner {
        require(_shipNFT != address(0), "Invalid address");
        shipNFT = _shipNFT;
        emit ContractRegistered("ShipNFT", _shipNFT);
    }

    /**
     * @notice Register CelestialBodyRegistry contract address
     * @param _celestialBodyRegistry Address of CelestialBodyRegistry contract
     */
    function setCelestialBodyRegistry(address _celestialBodyRegistry) external onlyOwner {
        require(_celestialBodyRegistry != address(0), "Invalid address");
        celestialBodyRegistry = _celestialBodyRegistry;
        emit ContractRegistered("CelestialBodyRegistry", _celestialBodyRegistry);
    }

    /**
     * @notice Register a resource token
     * @param symbol Token symbol (e.g., "CH4", "O2")
     * @param tokenAddress Address of the resource token contract
     */
    function setResourceToken(string memory symbol, address tokenAddress) external onlyOwner {
        require(tokenAddress != address(0), "Invalid address");
        require(bytes(symbol).length > 0, "Invalid symbol");

        // Add to symbols array if this is a new token
        if (resourceTokens[symbol] == address(0)) {
            resourceSymbols.push(symbol);
        }

        resourceTokens[symbol] = tokenAddress;
        emit ContractRegistered(string.concat("ResourceToken:", symbol), tokenAddress);
    }

    /**
     * @notice Get resource token address by symbol
     * @param symbol Token symbol
     * @return address Token contract address (zero address if not registered)
     */
    function getResourceToken(string memory symbol) external view returns (address) {
        return resourceTokens[symbol];
    }

    /**
     * @notice Get all registered resource tokens
     * @return ResourceToken[] Array of resource token data
     */
    function getAllResourceTokens() external view returns (ResourceToken[] memory) {
        ResourceToken[] memory tokens = new ResourceToken[](resourceSymbols.length);

        for (uint256 i = 0; i < resourceSymbols.length; i++) {
            string memory symbol = resourceSymbols[i];
            tokens[i] = ResourceToken({
                symbol: symbol,
                tokenAddress: resourceTokens[symbol]
            });
        }

        return tokens;
    }
}
