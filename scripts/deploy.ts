// scripts/deploy.ts
import { ethers } from "hardhat";
import * as fs from 'fs';

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

    // Deploy Dreams contract
    const Dreams = await ethers.getContractFactory("Dreams");
    const dreams = await Dreams.deploy(deployer.address);
    
    // Wait for deployment to complete
    await dreams.deployed();

    console.log("Dreams contract deployed to:", dreams.address);

    // Save deployment information
    const deploymentInfo = {
        dreamContractAddress: dreams.address,
        deployerAddress: deployer.address,
        chainId: (await ethers.provider.getNetwork()).chainId,
        deploymentTime: new Date().toISOString()
    };

    // Save to a file
    fs.writeFileSync(
        'deployment-info.json',
        JSON.stringify(deploymentInfo, null, 2)
    );

    console.log("Deployment information saved to deployment-info.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });