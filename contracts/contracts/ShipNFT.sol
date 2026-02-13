// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ShipNFT
 * @notice ERC-721 NFTs representing solar sail ships with Token Bound Accounts
 * @dev Each ship has on-chain stats and a deterministic TBA address
 */
contract ShipNFT is ERC721Enumerable, Ownable {
    // Ship statistics structure
    struct ShipStats {
        uint256 mass;              // kg (e.g., 10000)
        uint256 sailArea;          // m² (e.g., 3000000 = 3 km²)
        uint256 sailReflectivity;  // Basis points (9000 = 0.9 = 90%)
        uint256 maxSailCount;      // Max number of sails (1-20)
        uint256 cargoCapacity;     // Max resource units ship can hold
        string className;          // Ship class name (e.g., "HELIOS-CLASS")
        uint256 condition;         // Ship condition 0-10000 (10000 = perfect)
    }

    // Token ID counter
    uint256 private _nextTokenId;

    // Mapping from token ID to ship stats
    mapping(uint256 => ShipStats) private _shipStats;

    // Zone tracking
    mapping(uint256 => uint256) private _shipZones;

    // Proximity tracking (deep space)
    mapping(uint256 => mapping(uint256 => bool)) private _nearby;

    // Custom errors
    error ArrayLengthMismatch();

    // Events
    event ShipMinted(uint256 indexed tokenId, address indexed owner, string className);
    event ZoneUpdated(uint256 indexed shipId, uint256 zone);
    event ProximitySet(uint256 indexed shipA, uint256 indexed shipB, bool nearby);

    constructor() ERC721("Sailship Fleet", "SHIP") Ownable(msg.sender) {
        _nextTokenId = 1; // Start token IDs at 1
    }

    /**
     * @notice Mint a new ship NFT with specified stats
     * @param to Recipient address
     * @param className Ship class name
     * @param mass Ship mass in kg
     * @param sailArea Sail area in m²
     * @param sailReflectivity Reflectivity in basis points (9000 = 90%)
     * @param maxSailCount Maximum number of sails
     * @param cargoCapacity Maximum cargo capacity
     * @return tokenId The ID of the minted ship
     */
    function mintShip(
        address to,
        string memory className,
        uint256 mass,
        uint256 sailArea,
        uint256 sailReflectivity,
        uint256 maxSailCount,
        uint256 cargoCapacity
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;

        // Mint the NFT
        _safeMint(to, tokenId);

        // Store ship stats
        _shipStats[tokenId] = ShipStats({
            mass: mass,
            sailArea: sailArea,
            sailReflectivity: sailReflectivity,
            maxSailCount: maxSailCount,
            cargoCapacity: cargoCapacity,
            className: className,
            condition: 10000 // Perfect condition
        });

        emit ShipMinted(tokenId, to, className);

        return tokenId;
    }

    /**
     * @notice Get ship statistics for a token
     * @param tokenId The token ID
     * @return ShipStats The ship's stats
     */
    function getShipStats(uint256 tokenId) external view returns (ShipStats memory) {
        _requireOwned(tokenId); // Reverts with ERC721NonexistentToken if not minted
        return _shipStats[tokenId];
    }

    /**
     * @notice Get Token Bound Account address for a ship
     * @dev Uses deterministic address generation (ERC-6551 compatible)
     * @param tokenId The token ID
     * @return address The TBA address for this ship
     */
    function getShipTBA(uint256 tokenId) external view returns (address) {
        _requireOwned(tokenId); // Reverts with ERC721NonexistentToken if not minted

        // Generate deterministic TBA address using ERC-6551 standard formula
        // TBA address = keccak256(chainId, tokenContract, tokenId, implementationAddress, salt)
        // For Phase 1 proof of concept, we use a simplified deterministic address
        uint256 chainId = block.chainid;
        address tokenContract = address(this);

        // Deterministic address generation (simplified for Phase 1)
        // In production, this would create an actual ERC-6551 account contract
        bytes32 salt = keccak256(abi.encodePacked("SAILSHIP_TBA", tokenId));
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                tokenContract,
                salt,
                keccak256(abi.encodePacked(chainId, tokenId))
            )
        );

        return address(uint160(uint256(hash)));
    }

    /**
     * @notice Get total supply of ships
     * @return uint256 Total number of minted ships
     */
    function totalSupply() public view override returns (uint256) {
        return super.totalSupply();
    }

    /**
     * @notice Generate token URI for metadata
     * @param tokenId The token ID
     * @return string The token URI
     */
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        _requireOwned(tokenId);

        ShipStats memory stats = _shipStats[tokenId];

        // For Phase 1, return a simple JSON string with ship class and token ID
        // In production, this would point to off-chain metadata
        return string(
            abi.encodePacked(
                "data:application/json;utf8,{",
                '"name":"', stats.className, ' #', _toString(tokenId), '"',
                "}"
            )
        );
    }

    /// @notice Check if two ships can exchange resources
    /// @param shipA First ship token ID
    /// @param shipB Second ship token ID
    /// @return True if ships can interact
    function canInteract(uint256 shipA, uint256 shipB) external view returns (bool) {
        if (shipA == shipB) return true;

        uint256 zoneA = _shipZones[shipA];
        uint256 zoneB = _shipZones[shipB];

        // Same non-zero zone = same location
        if (zoneA != 0 && zoneA == zoneB) return true;

        // Both in deep space with proximity flag
        if (zoneA == 0 && zoneB == 0 && _nearby[shipA][shipB]) return true;

        return false;
    }

    /// @notice Set deep space proximity between two ships (admin only)
    /// @param shipA First ship token ID
    /// @param shipB Second ship token ID
    /// @param nearby Whether ships are nearby
    function setNearby(uint256 shipA, uint256 shipB, bool nearby) external onlyOwner {
        _nearby[shipA][shipB] = nearby;
        _nearby[shipB][shipA] = nearby;
        emit ProximitySet(shipA, shipB, nearby);
    }

    /// @notice Get a ship's current zone
    /// @param shipId The token ID
    /// @return The zone ID (0 = deep space)
    function shipZone(uint256 shipId) external view returns (uint256) {
        return _shipZones[shipId];
    }

    /// @notice Set a ship's zone (admin only)
    /// @param shipId The token ID
    /// @param zone The zone ID (0 = deep space)
    function setShipZone(uint256 shipId, uint256 zone) external onlyOwner {
        _shipZones[shipId] = zone;
        emit ZoneUpdated(shipId, zone);
    }

    /// @notice Batch update ship zones (admin only)
    /// @param shipIds Array of token IDs
    /// @param zones Array of zone IDs
    function setShipZoneBatch(uint256[] calldata shipIds, uint256[] calldata zones) external onlyOwner {
        if (shipIds.length != zones.length) revert ArrayLengthMismatch();
        for (uint256 i = 0; i < shipIds.length; i++) {
            _shipZones[shipIds[i]] = zones[i];
            emit ZoneUpdated(shipIds[i], zones[i]);
        }
    }

    /**
     * @dev Convert uint256 to string
     */
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
