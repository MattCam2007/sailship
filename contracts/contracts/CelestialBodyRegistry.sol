// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./CelestialBody.sol";

/**
 * @title CelestialBodyRegistry
 * @notice Factory and registry for celestial body contracts
 * @dev Creates and tracks CelestialBody instances
 */
contract CelestialBodyRegistry is Ownable {
    // Struct for returning body data
    struct BodyInfo {
        string name;
        address bodyAddress;
    }

    // Mapping: name => CelestialBody contract address
    mapping(string => address) private bodies;

    // Array of registered body names for iteration
    string[] private bodyNames;

    // Events
    event CelestialBodyCreated(string indexed name, address indexed bodyAddress, string bodyType);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Create a new celestial body contract
     * @param name Body name (e.g., "TITAN", "EUROPA")
     * @param bodyType Body type (e.g., "moon", "planet", "asteroid")
     * @return address Address of the created CelestialBody contract
     */
    function createCelestialBody(
        string memory name,
        string memory bodyType
    ) external onlyOwner returns (address) {
        require(bytes(name).length > 0, "Invalid name");
        require(bodies[name] == address(0), "Body already exists");

        // Deploy new CelestialBody contract
        CelestialBody newBody = new CelestialBody(name, bodyType);

        // Transfer ownership to the registry owner (so they can manage resources)
        newBody.transferOwnership(msg.sender);

        // Register the body
        address bodyAddress = address(newBody);
        bodies[name] = bodyAddress;
        bodyNames.push(name);

        emit CelestialBodyCreated(name, bodyAddress, bodyType);

        return bodyAddress;
    }

    /**
     * @notice Get celestial body address by name
     * @param name Body name
     * @return address Contract address (zero address if not found)
     */
    function getCelestialBody(string memory name) external view returns (address) {
        return bodies[name];
    }

    /**
     * @notice Get all registered celestial bodies
     * @return BodyInfo[] Array of body names and addresses
     */
    function getAllBodies() external view returns (BodyInfo[] memory) {
        BodyInfo[] memory allBodies = new BodyInfo[](bodyNames.length);

        for (uint256 i = 0; i < bodyNames.length; i++) {
            string memory name = bodyNames[i];
            allBodies[i] = BodyInfo({
                name: name,
                bodyAddress: bodies[name]
            });
        }

        return allBodies;
    }
}
