// scripts/deploy.ts
import { ethers, run, network } from "hardhat";

async function main() {
    // Get deployment account
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    try {
        // Deploy Dreams contract
        console.log("\nDeploying Dreams contract...");
        const Dreams = await ethers.getContractFactory("Dreams");
        const dreams = await Dreams.deploy(deployer.address);
        await dreams.deployed(); // Changed from waitForDeployment to deployed()

        console.log("Dreams deployed to:", dreams.address);

        // Wait for a few block confirmations
        console.log("\nWaiting for block confirmations...");
        const CONFIRMATIONS = 6;
        await dreams.deployTransaction.wait(CONFIRMATIONS); // Changed from deploymentTransaction to deployTransaction

        // Set up initial validators if specified in env
        const validatorAddresses = process.env.VALIDATOR_ADDRESSES?.split(',') || [];
        if (validatorAddresses.length > 0) {
            console.log("\nSetting up validators...");
            const validatorRole = await dreams.VALIDATOR_ROLE();
            
            for (const validator of validatorAddresses) {
                console.log(`Adding validator: ${validator}`);
                const tx = await dreams.grantRole(validatorRole, validator);
                await tx.wait();
            }
        }

        // Verify contract if we're on a supported network
        if (network.name !== "hardhat" && process.env.BASESCAN_API_KEY) {
            console.log("\nVerifying contract on explorer...");
            try {
                await run("verify:verify", {
                    address: dreams.address, // Changed from address to dreams.address
                    constructorArguments: [deployer.address],
                    contract: "contracts/Dreams.sol:Dreams"
                });
                console.log("Contract verified successfully");
            } catch (error: any) {
                if (error.message.toLowerCase().includes("already verified")) {
                    console.log("Contract is already verified!");
                } else {
                    console.error("Error verifying contract:", error);
                }
            }
        }

        // Create initial task if specified in env
        if (process.env.INITIAL_TASK_DEADLINE) {
            console.log("\nCreating initial task...");
            const deadline = Math.floor(Date.now() / 1000) + parseInt(process.env.INITIAL_TASK_DEADLINE);
            const tx = await dreams.createTask(1, deadline);
            await tx.wait();
            console.log("Initial task created with deadline:", new Date(deadline * 1000).toISOString());
        }

        // Print deployment summary
        console.log("\nDeployment Summary");
        console.log("==================");
        console.log("Network:", network.name);
        console.log("Contract address:", dreams.address);
        console.log("Admin address:", deployer.address);
        console.log("Validators:", validatorAddresses.length > 0 ? validatorAddresses.join(", ") : "None");
        console.log("Block number:", await ethers.provider.getBlockNumber());
        
        // Save deployment info to a file
        const fs = require("fs");
        const deploymentInfo = {
            network: network.name,
            contractAddress: dreams.address,
            adminAddress: deployer.address,
            validators: validatorAddresses,
            deploymentTime: new Date().toISOString(),
            blockNumber: await ethers.provider.getBlockNumber()
        };

        // Create deployments directory if it doesn't exist
        if (!fs.existsSync('./deployments')){
            fs.mkdirSync('./deployments');
        }

        fs.writeFileSync(
            `deployments/${network.name}.json`,
            JSON.stringify(deploymentInfo, null, 2)
        );
        console.log("\nDeployment info saved to:", `deployments/${network.name}.json`);

    } catch (error) {
        console.error("Error during deployment:", error);
        process.exit(1);
    }
}

// Execute deployment
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
    