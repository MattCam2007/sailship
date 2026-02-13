// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameResource.sol";

/// @title N2 — Nitrogen resource token
contract N2 is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Nitrogen", "N2", admin, shipContract_) {}
}
