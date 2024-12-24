// scripts/complete-and-distribute.ts
import { ethers } from "hardhat";
require('dotenv').config();

async function main() {
    const DREAMS_ADDRESS = "0x3C34e875B712565d3A3d1D45ff3E334d8e53D337";
    const TASK_ID = 1735068715;
    const USER_ADDRESS = "0x877d7C416b3f7bcDc457F4030d63cE66ff595d3e";  // Your address

    // Get contract and signers
    const [signer] = await ethers.getSigners();
    const dreams = await ethers.getContractAt("Dreams", DREAMS_ADDRESS, signer);

    try {
        // Check current time vs deadline
        const details = await dreams.getTaskDetails(TASK_ID);
        const currentTime = Math.floor(Date.now() / 1000);
        
        console.log("\nTime Check:");
        console.log("Current time:", new Date(currentTime * 1000).toISOString());
        console.log("Deadline:", new Date(details.deadline.toNumber() * 1000).toISOString());
        
        if (currentTime <= details.deadline.toNumber()) {
            console.log("\n❌ Cannot proceed: Deadline has not passed yet");
            console.log(`Please wait until: ${new Date(details.deadline.toNumber() * 1000).toISOString()}`);
            return;
        }

        // Check if task is already completed
        const isCompleted = await dreams.isTaskCompleted(TASK_ID, USER_ADDRESS);
        if (!isCompleted) {
            console.log("\nMarking task as completed for user...");
            const completeTx = await dreams.completeTask(TASK_ID, USER_ADDRESS);
            await completeTx.wait();
            console.log("Task marked as completed! Tx:", completeTx.hash);
        } else {
            console.log("\nTask already marked as completed");
        }

        // Check if rewards are already distributed
        if (!details.rewardsDistributed) {
            console.log("\nDistributing rewards...");
            const distributeTx = await dreams.distributeRewards(
                TASK_ID,
                [USER_ADDRESS],  // Winners array
                [100],          // Completion rates
                { gasLimit: 500000 }
            );
            await distributeTx.wait();
            console.log("Rewards distributed! Tx:", distributeTx.hash);
        } else {
            console.log("\nRewards already distributed");
        }

        // Try to withdraw
        const canWithdraw = await dreams.canWithdraw(TASK_ID, USER_ADDRESS);
        if (canWithdraw) {
            console.log("\nWithdrawing stake and rewards...");
            const withdrawTx = await dreams.withdraw(TASK_ID, { gasLimit: 500000 });
            await withdrawTx.wait();
            console.log("Withdrawal successful! Tx:", withdrawTx.hash);
        } else {
            console.log("\nCannot withdraw yet. Requirements not met.");
        }

        // Print final status
        const finalDetails = await dreams.getTaskDetails(TASK_ID);
        console.log("\nFinal Task Status:");
        console.log("Completed:", await dreams.isTaskCompleted(TASK_ID, USER_ADDRESS));
        console.log("Rewards Distributed:", finalDetails.rewardsDistributed);
        console.log("Total Stakes:", ethers.utils.formatEther(finalDetails.totalStakeAmount), "ETH");
        console.log("Reward Pool:", ethers.utils.formatEther(finalDetails.rewardPoolAmount), "ETH");

    } catch (error) {
        console.error("\nError:", error);
        if (error.error && error.error.message) {
            console.error("Contract error message:", error.error.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });