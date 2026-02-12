const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

/**
 * Deploy all Phase 1 contracts in correct order
 * Outputs deployment addresses to JSON file
 */
async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

  const deploymentData = {
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {}
  };

  // 1. Deploy GameRegistry
  console.log("\n1. Deploying GameRegistry...");
  const GameRegistry = await ethers.getContractFactory("GameRegistry");
  const gameRegistry = await GameRegistry.deploy();
  await gameRegistry.waitForDeployment();
  const gameRegistryAddress = await gameRegistry.getAddress();
  console.log("GameRegistry deployed to:", gameRegistryAddress);
  deploymentData.contracts.gameRegistry = gameRegistryAddress;

  // 2. Deploy Resource Tokens (CH4, O2, H2O, CO2, N2)
  console.log("\n2. Deploying Resource Tokens...");
  const ResourceToken = await ethers.getContractFactory("ResourceToken");

  const resourceTokens = [
    { name: "Methane", symbol: "CH4" },
    { name: "Oxygen", symbol: "O2" },
    { name: "Water", symbol: "H2O" },
    { name: "Carbon Dioxide", symbol: "CO2" },
    { name: "Nitrogen", symbol: "N2" }
  ];

  deploymentData.contracts.resources = {};

  for (const resource of resourceTokens) {
    const token = await ResourceToken.deploy(resource.name, resource.symbol);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log(`  ${resource.symbol} (${resource.name}) deployed to:`, tokenAddress);
    deploymentData.contracts.resources[resource.symbol] = tokenAddress;

    // Register in GameRegistry
    await gameRegistry.setResourceToken(resource.symbol, tokenAddress);
    console.log(`  ${resource.symbol} registered in GameRegistry`);
  }

  // 3. Deploy ShipNFT
  console.log("\n3. Deploying ShipNFT...");
  const ShipNFT = await ethers.getContractFactory("ShipNFT");
  const shipNFT = await ShipNFT.deploy();
  await shipNFT.waitForDeployment();
  const shipNFTAddress = await shipNFT.getAddress();
  console.log("ShipNFT deployed to:", shipNFTAddress);
  deploymentData.contracts.shipNFT = shipNFTAddress;

  // Register in GameRegistry
  await gameRegistry.setShipNFT(shipNFTAddress);
  console.log("ShipNFT registered in GameRegistry");

  // 4. Deploy CelestialBodyRegistry
  console.log("\n4. Deploying CelestialBodyRegistry...");
  const CelestialBodyRegistry = await ethers.getContractFactory("CelestialBodyRegistry");
  const celestialBodyRegistry = await CelestialBodyRegistry.deploy();
  await celestialBodyRegistry.waitForDeployment();
  const celestialBodyRegistryAddress = await celestialBodyRegistry.getAddress();
  console.log("CelestialBodyRegistry deployed to:", celestialBodyRegistryAddress);
  deploymentData.contracts.celestialBodyRegistry = celestialBodyRegistryAddress;

  // Register in GameRegistry
  await gameRegistry.setCelestialBodyRegistry(celestialBodyRegistryAddress);
  console.log("CelestialBodyRegistry registered in GameRegistry");

  // 5. Create initial celestial bodies (TITAN, EUROPA, MARS, VENUS)
  console.log("\n5. Creating initial celestial bodies...");
  const initialBodies = [
    { name: "TITAN", type: "moon" },
    { name: "EUROPA", type: "moon" },
    { name: "MARS", type: "planet" },
    { name: "VENUS", type: "planet" }
  ];

  deploymentData.contracts.celestialBodies = {};

  for (const body of initialBodies) {
    const tx = await celestialBodyRegistry.createCelestialBody(body.name, body.type);
    await tx.wait();
    const bodyAddress = await celestialBodyRegistry.getCelestialBody(body.name);
    console.log(`  ${body.name} (${body.type}) created at:`, bodyAddress);
    deploymentData.contracts.celestialBodies[body.name] = bodyAddress;
  }

  // 6. Configure initial resource emission profiles
  console.log("\n6. Configuring resource emission profiles...");
  const CelestialBody = await ethers.getContractFactory("CelestialBody");

  // TITAN - emits CH4 at 100/s
  const titan = CelestialBody.attach(deploymentData.contracts.celestialBodies.TITAN);
  await titan.addResource(deploymentData.contracts.resources.CH4, ethers.parseEther("100"));
  console.log("  TITAN: Added CH4 emission (100/s)");

  // EUROPA - emits H2O at 100/s
  const europa = CelestialBody.attach(deploymentData.contracts.celestialBodies.EUROPA);
  await europa.addResource(deploymentData.contracts.resources.H2O, ethers.parseEther("100"));
  console.log("  EUROPA: Added H2O emission (100/s)");

  // MARS - emits CO2 at 50/s, H2O at 10/s
  const mars = CelestialBody.attach(deploymentData.contracts.celestialBodies.MARS);
  await mars.addResource(deploymentData.contracts.resources.CO2, ethers.parseEther("50"));
  await mars.addResource(deploymentData.contracts.resources.H2O, ethers.parseEther("10"));
  console.log("  MARS: Added CO2 emission (50/s), H2O emission (10/s)");

  // VENUS - emits CO2 at 80/s, N2 at 30/s
  const venus = CelestialBody.attach(deploymentData.contracts.celestialBodies.VENUS);
  await venus.addResource(deploymentData.contracts.resources.CO2, ethers.parseEther("80"));
  await venus.addResource(deploymentData.contracts.resources.N2, ethers.parseEther("30"));
  console.log("  VENUS: Added CO2 emission (80/s), N2 emission (30/s)");

  // 7. Save deployment data to JSON file
  const outputPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
  console.log("\n7. Deployment data saved to:", outputPath);

  // Print summary
  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", deploymentData.chainId);
  console.log("GameRegistry:", deploymentData.contracts.gameRegistry);
  console.log("ShipNFT:", deploymentData.contracts.shipNFT);
  console.log("CelestialBodyRegistry:", deploymentData.contracts.celestialBodyRegistry);
  console.log("\nResource Tokens:");
  for (const [symbol, address] of Object.entries(deploymentData.contracts.resources)) {
    console.log(`  ${symbol}: ${address}`);
  }
  console.log("\nCelestial Bodies:");
  for (const [name, address] of Object.entries(deploymentData.contracts.celestialBodies)) {
    console.log(`  ${name}: ${address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
