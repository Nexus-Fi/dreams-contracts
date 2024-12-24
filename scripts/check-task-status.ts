// scripts/check-task-status.ts
import { ethers } from "hardhat";
require('dotenv').config();

async function main() {
    const DREAMS_ADDRESS = "0x3C34e875B712565d3A3d1D45ff3E334d8e53D337";
    const TASK_ID = 1735068715;

    // Get signer
    const [signer] = await ethers.getSigners();
    console.log("Checking with account:", signer.address);

    // Get contract
    const dreams = await ethers.getContractAt("Dreams", DREAMS_ADDRESS, signer);

    async function checkTaskRequirements() {
        try {
            // Get task details
            const details = await dreams.getTaskDetails(TASK_ID);
            const currentTimestamp = Math.floor(Date.now() / 1000);
            
            console.log("\nTask Requirements Check:");
            console.log("=======================");
            
            // 1. Check deadline
            console.log("\n1. Deadline Check:");
            console.log("Current time:", new Date(currentTimestamp * 1000).toISOString());
            console.log("Task deadline:", new Date(details.deadline.toNumber() * 1000).toISOString());
            console.log("Deadline passed:", currentTimestamp > details.deadline.toNumber());

            // 2. Check if rewards already distributed
            console.log("\n2. Rewards Status:");
            console.log("Already distributed:", details.rewardsDistributed);

            // 3. Check total stakes and participants
            console.log("\n3. Stakes Information:");
            console.log("Total stakes:", ethers.utils.formatEther(details.totalStakeAmount), "ETH");
            console.log("Reward pool:", ethers.utils.formatEther(details.rewardPoolAmount), "ETH");

            // 4. Get stakeholders
            const stakeholders = await dreams.getStakeholders(TASK_ID);
            console.log("\n4. Participant Status:");
            for (const stakeholder of stakeholders) {
                const isCompleted = await dreams.isTaskCompleted(TASK_ID, stakeholder);
                const stake = await dreams.stakes(stakeholder, TASK_ID);
                console.log(`\nParticipant ${stakeholder}:`);
                console.log("- Task completed:", isCompleted);
                console.log("- Stake amount:", ethers.utils.formatEther(stake.amount), "ETH");
                console.log("- Already withdrawn:", stake.withdrawn);
            }

            // Check if conditions are met for reward distribution
            console.log("\nReward Distribution Requirements:");
            console.log("1. Deadline passed:", currentTimestamp > details.deadline.toNumber());
            console.log("2. Not already distributed:", !details.rewardsDistributed);
            console.log("3. Has stakes:", details.totalStakeAmount.gt(0));

            // Recommend next action
            console.log("\nRecommended Action:");
            if (currentTimestamp <= details.deadline.toNumber()) {
                console.log("❌ Wait for deadline to pass");
            } else if (details.rewardsDistributed) {
                console.log("❌ Rewards already distributed");
            } else if (details.totalStakeAmount.eq(0)) {
                console.log("❌ No stakes to distribute");
            } else {
                console.log("✅ Ready for reward distribution");
            }

        } catch (error) {
            console.error("Error checking task:", error);
        }
    }

    await checkTaskRequirements();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });