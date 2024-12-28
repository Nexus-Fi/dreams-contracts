// scripts/deploy-base.ts
import { ethers, run } from "hardhat";
import { sleep } from "./utils";

async function main() {
    console.log("Starting deployment to Base Sepolia...");

    // Get deployer
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);

    // Deploy Dreams contract
    const Dreams = await ethers.getContractFactory("Dreams");
    const dreams = await Dreams.deploy(deployer.address);
    await dreams.deployed();

    console.log("Dreams contract deployed to:", dreams.address);

    // Wait for a few block confirmations
    console.log("Waiting for block confirmations...");
    await sleep(30000); // Wait 30 seconds

    // Verify contract on BaseScan
    console.log("Starting contract verification...");
    try {
        await run("verify:verify", {
            address: dreams.address,
            constructorArguments: [deployer.address],
        });
        console.log("Contract verification successful");
    } catch (error) {
        console.log("Verification failed:", error);
    }

    // Save deployment info
    console.log("\nDeployment Summary:");
    console.log("Contract Address:", dreams.address);
    console.log("Deployer Address:", deployer.address);
    console.log("Network: Base Sepolia");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });