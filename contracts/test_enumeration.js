const { ethers } = require("hardhat");

async function main() {
  const [owner, addr1] = await ethers.getSigners();
  
  // Get deployed ShipNFT contract
  const shipNFTAddress = process.env.SHIP_NFT_ADDRESS;
  if (!shipNFTAddress) {
    throw new Error("SHIP_NFT_ADDRESS not set");
  }
  
  const ShipNFT = await ethers.getContractFactory("ShipNFT");
  const shipNFT = ShipNFT.attach(shipNFTAddress);
  
  console.log("Testing ShipNFT enumeration...");
  console.log("Contract address:", shipNFTAddress);
  console.log("Admin address:", addr1.address);
  
  // Get balance
  const balance = await shipNFT.balanceOf(addr1.address);
  console.log("Balance:", balance.toString());
  
  // Get all token IDs
  const tokenIds = [];
  for (let i = 0; i < Number(balance); i++) {
    const tokenId = await shipNFT.tokenOfOwnerByIndex(addr1.address, i);
    tokenIds.push(tokenId.toString());
    console.log(`Token ${i}:`, tokenId.toString());
  }
  
  console.log("All token IDs:", tokenIds);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
