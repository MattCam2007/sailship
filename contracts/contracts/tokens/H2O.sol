// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameResource.sol";

/// @title H2O — Water resource token
contract H2O is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Water", "H2O", admin, shipContract_) {}
}
