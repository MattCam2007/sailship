// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../GameResource.sol";

/// @title CH4 — Methane resource token
contract CH4 is GameResource {
    constructor(address admin, address shipContract_)
        GameResource("Methane", "CH4", admin, shipContract_) {}
}
