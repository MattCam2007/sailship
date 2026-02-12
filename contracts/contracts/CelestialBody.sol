// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title CelestialBody
 * @notice Represents a planet/moon with resource emission profiles
 * @dev Admin controls resource harvesting to ship Token Bound Accounts
 */
contract CelestialBody is Ownable {
    // Emission profile for a single resource
    struct EmissionProfile {
        address resourceToken;  // ERC-20 token address
        uint256 ratePerSecond;  // Base emission rate (18 decimals)
        bool isActive;          // Can be disabled
    }

    // Celestial body data
    struct CelestialBodyData {
        string name;            // "TITAN", "EUROPA", etc.
        string bodyType;        // "planet", "moon", "asteroid"
        EmissionProfile[] emissions;
    }

    // Body metadata
    string public name;
    string public bodyType;

    // Array of emission profiles
    EmissionProfile[] private emissions;

    // Mapping for quick lookup: resourceToken => array index
    mapping(address => int256) private resourceIndex; // -1 if not found, else index

    // Events
    event ResourceAdded(address indexed resourceToken, uint256 ratePerSecond);
    event EmissionRateUpdated(address indexed resourceToken, uint256 newRate);
    event ResourceActiveToggled(address indexed resourceToken, bool isActive);
    event ResourceHarvested(address indexed shipTBA, address indexed resourceToken, uint256 amount);

    constructor(string memory _name, string memory _bodyType) Ownable(msg.sender) {
        name = _name;
        bodyType = _bodyType;
    }

    /**
     * @notice Add a new resource to the emission profile
     * @param resourceToken Address of the resource token
     * @param ratePerSecond Emission rate in tokens per second
     */
    function addResource(address resourceToken, uint256 ratePerSecond) external onlyOwner {
        require(resourceToken != address(0), "Invalid resource token");
        require(resourceIndex[resourceToken] == 0, "Resource already exists");

        emissions.push(EmissionProfile({
            resourceToken: resourceToken,
            ratePerSecond: ratePerSecond,
            isActive: true
        }));

        // Store index + 1 (so 0 means "not found")
        resourceIndex[resourceToken] = int256(emissions.length);

        emit ResourceAdded(resourceToken, ratePerSecond);
    }

    /**
     * @notice Update emission rate for a resource
     * @param resourceToken Address of the resource token
     * @param newRate New emission rate
     */
    function setEmissionRate(address resourceToken, uint256 newRate) external onlyOwner {
        int256 idx = resourceIndex[resourceToken];
        require(idx > 0, "Resource not found");

        emissions[uint256(idx - 1)].ratePerSecond = newRate;

        emit EmissionRateUpdated(resourceToken, newRate);
    }

    /**
     * @notice Enable or disable a resource
     * @param resourceToken Address of the resource token
     * @param isActive Whether the resource is active
     */
    function setResourceActive(address resourceToken, bool isActive) external onlyOwner {
        int256 idx = resourceIndex[resourceToken];
        require(idx > 0, "Resource not found");

        emissions[uint256(idx - 1)].isActive = isActive;

        emit ResourceActiveToggled(resourceToken, isActive);
    }

    /**
     * @notice Harvest resources to a ship's Token Bound Account
     * @param shipTBA Address of the ship's TBA
     * @param resourceToken Address of the resource token to harvest
     * @param amount Amount to harvest
     */
    function harvest(
        address shipTBA,
        address resourceToken,
        uint256 amount
    ) external onlyOwner {
        require(shipTBA != address(0), "Invalid TBA address");

        int256 idx = resourceIndex[resourceToken];
        require(idx > 0, "Resource not found");

        EmissionProfile memory profile = emissions[uint256(idx - 1)];
        require(profile.isActive, "Resource not active");

        // Transfer tokens from this contract to the ship TBA
        // Backend ensures this contract has enough tokens minted to it
        IERC20(resourceToken).transfer(shipTBA, amount);

        emit ResourceHarvested(shipTBA, resourceToken, amount);
    }

    /**
     * @notice Get all celestial body data including emission profiles
     * @return CelestialBodyData struct
     */
    function getCelestialBodyData() external view returns (CelestialBodyData memory) {
        return CelestialBodyData({
            name: name,
            bodyType: bodyType,
            emissions: emissions
        });
    }
}
