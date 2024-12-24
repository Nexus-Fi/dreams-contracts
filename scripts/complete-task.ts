// scripts/complete-task.ts
import { ethers } from "hardhat";
require('dotenv').config();

async function main() {
    // Contract address and task ID
    const DREAMS_ADDRESS = "0x3C34e875B712565d3A3d1D45ff3E334d8e53D337";
    const TASK_ID = 1735068715; // Your task ID

    // Get signer
    const [signer] = await ethers.getSigners();
    console.log("Using account:", signer.address);

    // Get contract
    const dreams = await ethers.getContractAt("Dreams", DREAMS_ADDRESS, signer);

    async function printTaskStatus() {
        try {
            const details = await dreams.getTaskDetails(TASK_ID);
            const isCompleted = await dreams.isTaskCompleted(TASK_ID, signer.address);
            const canWithdraw = await dreams.canWithdraw(TASK_ID, signer.address);
            
            console.log("\nTask Status:");
            console.log("Task ID:", TASK_ID);
            console.log("Completed:", isCompleted);
            console.log("Rewards Distributed:", details.rewardsDistributed);
            console.log("Can Withdraw:", canWithdraw);
            console.log("Total Stakes:", ethers.utils.formatEther(details.totalStakeAmount), "ETH");
            console.log("Reward Pool:", ethers.utils.formatEther(details.rewardPoolAmount), "ETH");
        } catch (error) {
            console.error("Error getting task status:", error.message);
        }
    }

    try {
        // 1. Print initial status
        console.log("\nInitial Status:");
        await printTaskStatus();

        // 2. Distribute rewards
        console.log("\nDistributing rewards...");
        const distributeTx = await dreams.distributeRewards(
            TASK_ID,
            [signer.address], // Array of winners
            [100], // Completion rates (100%)
            { gasLimit: 500000 }
        );
        const receipt = await distributeTx.wait();
        console.log("Rewards distributed! Transaction hash:", receipt.transactionHash);

        // 3. Print updated status
        console.log("\nStatus after reward distribution:");
        await printTaskStatus();

        // 4. Try to withdraw
        if (await dreams.canWithdraw(TASK_ID, signer.address)) {
            console.log("\nAttempting withdrawal...");
            const withdrawTx = await dreams.withdraw(TASK_ID, { gasLimit: 500000 });
            const withdrawReceipt = await withdrawTx.wait();
            console.log("Withdrawal successful! Transaction hash:", withdrawReceipt.transactionHash);
        } else {
            console.log("\nCannot withdraw yet. Make sure:");
            console.log("1. Task deadline has passed");
            console.log("2. Rewards have been distributed");
            console.log("3. Your task was completed");
            console.log("4. You haven't already withdrawn");
        }

    } catch (error) {
        console.error("\nError occurred:", error);
        if (error.error && error.error.message) {
            console.error("Contract error message:", error.error.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });