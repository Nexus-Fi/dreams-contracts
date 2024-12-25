// scripts/interact-base-sepolia.ts
import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    const DREAMS_ADDRESS = "0x61B03bBECA034D161212e295D6EAb0800DadCeB1";

    // Setup provider
    const provider = new ethers.providers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);

    // Setup signers with private keys
    const adminSigner = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
    const userSigner = new ethers.Wallet(process.env.USER_PRIVATE_KEY!, provider);

    console.log("\nAccounts:");
    console.log("Admin:", adminSigner.address);
    console.log("User:", userSigner.address);

    // Get contract instance
    const dreams = await ethers.getContractAt("Dreams", DREAMS_ADDRESS, adminSigner);

    async function printTaskDetails(taskId: number) {
        try {
            const details = await dreams.getTaskDetails(taskId);
            console.log(`\nTask ${taskId} Details:`);
            console.log("Deadline:", new Date(details.deadline.toNumber() * 1000).toISOString());
            console.log("Rewards Distributed:", details.rewardsDistributed);
            console.log("Total Stakes:", ethers.utils.formatEther(details.totalStakeAmount), "ETH");
            console.log("Reward Pool:", ethers.utils.formatEther(details.rewardPoolAmount), "ETH");

            // Check if user has staked
            const userStake = await dreams.stakes(userSigner.address, taskId);
            console.log("\nUser Stake Details:");
            console.log("Amount:", ethers.utils.formatEther(userStake.amount), "ETH");
            console.log("Token:", userStake.token);
            console.log("Withdrawn:", userStake.withdrawn);
        } catch (error) {
            console.log(`Task ${taskId} not found or error:`, error.message);
        }
    }

    try {
        // 1. Check user balances
        const adminBalance = await provider.getBalance(adminSigner.address);
        const userBalance = await provider.getBalance(userSigner.address);
        
        console.log("\nBalances:");
        console.log("Admin Balance:", ethers.utils.formatEther(adminBalance), "ETH");
        console.log("User Balance:", ethers.utils.formatEther(userBalance), "ETH");

        // 2. Create a new task
        const taskId = Math.floor(Date.now() / 1000); // Use current timestamp as task ID
        const oneDay = 24 * 60 * 60;
        const deadline = taskId + oneDay; // Deadline is 24 hours from now

        console.log("\nCreating new task...");
        console.log("Task ID:", taskId);
        console.log("Deadline:", new Date(deadline * 1000).toISOString());

        const createTx = await dreams.connect(adminSigner).createTask(taskId, deadline);
        await createTx.wait();
        console.log("Task created! Tx Hash:", createTx.hash);

        // 3. Make a deposit
        const depositAmount = ethers.utils.parseEther("0.001"); // 0.01 ETH
        console.log("\nMaking deposit of", ethers.utils.formatEther(depositAmount), "ETH...");
        
        const dreamsWithUser = dreams.connect(userSigner);
        const depositTx = await dreamsWithUser.deposit(
            taskId,
            depositAmount,
            ethers.constants.AddressZero,
            { 
                value: depositAmount,
                gasLimit: 500000 // Add explicit gas limit
            }
        );
        await depositTx.wait();
        console.log("Deposit successful! Tx Hash:", depositTx.hash);



        // 4. Print task details after deposit
        
        console.log("\n4. Marking User1's task as completed...");


        // 5. Print transaction summary
        console.log("\nTransaction Summary:");
        console.log("Task Creation:", createTx.hash);
        console.log("Deposit:", depositTx.hash);

    } catch (error) {
        console.error("\nError during interaction:", error);
        if (error.transaction) {
            console.error("Failed Transaction Hash:", error.transaction.hash);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });