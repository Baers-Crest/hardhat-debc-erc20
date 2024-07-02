import { ethers } from "hardhat";

async function main() {
  const DEBC = await ethers.getContractFactory("DigitalEraBank");
  const debc = await DEBC.deploy();

  await debc.waitForDeployment();

  console.log("DEBC deployed to:", await debc.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
