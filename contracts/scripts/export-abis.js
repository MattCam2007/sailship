const fs = require("fs");
const path = require("path");

/**
 * Export contract ABIs to backoffice/public/abis/
 * Team B (backoffice) depends on these for contract interaction
 */

const CONTRACTS = [
  "GameRegistry",
  "ResourceToken",
  "ShipNFT",
  "CelestialBody",
  "CelestialBodyRegistry"
];

const ARTIFACTS_DIR = path.join(__dirname, "../artifacts/contracts");
const OUTPUT_DIR = path.join(__dirname, "../../backoffice/public/abis");

function main() {
  console.log("Exporting ABIs to backoffice...");
  console.log("Source:", ARTIFACTS_DIR);
  console.log("Destination:", OUTPUT_DIR);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log("Created output directory");
  }

  let exportedCount = 0;

  for (const contractName of CONTRACTS) {
    try {
      // Find the artifact JSON file
      const artifactPath = path.join(ARTIFACTS_DIR, `${contractName}.sol`, `${contractName}.json`);

      if (!fs.existsSync(artifactPath)) {
        console.warn(`⚠️  Artifact not found: ${contractName}`);
        continue;
      }

      // Read artifact
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

      // Create simplified ABI JSON with only what backoffice needs
      const abiData = {
        contractName: artifact.contractName,
        abi: artifact.abi,
        bytecode: artifact.bytecode
      };

      // Write to backoffice
      const outputPath = path.join(OUTPUT_DIR, `${contractName}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(abiData, null, 2));

      console.log(`✅ Exported: ${contractName}.json`);
      exportedCount++;
    } catch (error) {
      console.error(`❌ Error exporting ${contractName}:`, error.message);
    }
  }

  console.log(`\nExported ${exportedCount}/${CONTRACTS.length} ABIs successfully`);

  if (exportedCount === 0) {
    console.error("\n⚠️  No ABIs exported. Run 'npx hardhat compile' first.");
    process.exit(1);
  }
}

main();
