# Smart Contracts - Phase 1

**Owner:** Team A (Contracts Team)

## Structure

```
contracts/
├── GameRegistry.sol          # Central contract registry
├── ShipNFT.sol              # ERC-721 + ERC-6551 ships
├── ResourceToken.sol         # ERC-20 resource template
├── CelestialBody.sol        # Individual celestial body
├── CelestialBodyRegistry.sol # Factory for celestial bodies
├── interfaces/              # Contract interfaces
└── libraries/               # Shared libraries
```

## Development Workflow

**STRICT TDD:**
1. **RED**: Write failing test in `/test/contracts/`
2. **GREEN**: Implement contract code until test passes
3. **REFACTOR**: Clean up while keeping tests green

## Build & Test

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Deployment

```bash
npx hardhat run scripts/deploy.js --network localhost
```

## ABI Export

After compilation, copy ABIs to backoffice:
```bash
npm run export-abis
```

This copies ABI files from `artifacts/` to `/backoffice/public/abis/`
