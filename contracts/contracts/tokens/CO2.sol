// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameResource.sol";

/// @title CO2 — Carbon Dioxide resource token
contract CO2 is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Carbon Dioxide", "CO2", admin, shipContract_) {}
}
