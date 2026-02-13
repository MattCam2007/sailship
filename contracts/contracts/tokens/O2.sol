// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameResource.sol";

/// @title O2 — Oxygen resource token
contract O2 is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Oxygen", "O2", admin, shipContract_) {}
}
