// scripts/interact-specific.ts
import { ethers } from "hardhat";

async function main() {
    const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    // Get signers
    const [deployer, validator, user1, user2] = await ethers.getSigners();
    console.log("Interacting with contract at:", CONTRACT_ADDRESS);

    // Get contract instance
    const Dreams = await ethers.getContractFactory("Dreams");
    const dreams = await Dreams.attach(CONTRACT_ADDRESS);

    // Setup: Add validator role
    console.log("\n--- Setting up Validator ---");
    try {
        const validatorRole = await dreams.VALIDATOR_ROLE();
        const tx = await dreams.grantRole(validatorRole, validator.address);
        await tx.wait();
        console.log("Added validator:", validator.address);
    } catch (error) {
        console.error("Error setting up validator:", error);
    }

    // Test Case 1: Create Tasks
    console.log("\n--- Creating Tasks ---");
    const currentTime = Math.floor(Date.now() / 1000);
    const deadline1 = currentTime + 86400; // 1 day from now
    const minStake = ethers.utils.parseEther("0.01");

    try {
        console.log("User1 creating task...");
        const tx1 = await dreams.connect(user1).createTask(1, deadline1, {
            value: minStake
        });
        await tx1.wait();
        console.log("User1 created task 1");

        console.log("User2 creating task...");
        const tx2 = await dreams.connect(user2).createTask(2, deadline1, {
            value: minStake
        });
        await tx2.wait();
        console.log("User2 created task 2");

        // Check task details
        const task1 = await dreams.getTaskDetails(1);
        console.log("\nTask 1 details:", {
            owner: task1.owner,
            deadline: new Date(Number(task1.deadline) * 1000).toISOString(),
            completed: task1.completed,
            stakeAmount: ethers.utils.formatEther(task1.stakeAmount)
        });

    } catch (error) {
        console.error("Error creating tasks:", error);
    }

    // Test Case 2: Complete Task 1 only
    console.log("\n--- Completing Task 1 ---");
    try {
        const tx = await dreams.connect(validator).completeTask(1);
        await tx.wait();
        console.log("Task 1 completed by validator");

        const task1 = await dreams.getTaskDetails(1);
        console.log("Task 1 completion status:", task1.completed);
    } catch (error) {
        console.error("Error completing task:", error);
    }

    // Test Case 3: Fast forward time and distribute rewards
    console.log("\n--- Advancing Time & Distributing Rewards ---");
    try {
        console.log("Advancing time by 1 day...");
        await network.provider.send("evm_increaseTime", [86401]); // 1 day + 1 second
        await network.provider.send("evm_mine");

        console.log("Distributing rewards...");
        const tx = await dreams.connect(deployer).distributeRewards();
        await tx.wait();
        
        const rewardPool = await dreams.globalRewardPool();
        console.log("Global reward pool:", ethers.utils.formatEther(rewardPool));
    } catch (error) {
        console.error("Error distributing rewards:", error);
    }

    // Test Case 4: Withdraw rewards for completed task
    console.log("\n--- Withdrawing Rewards for Task 1 ---");
    try {
        const balanceBefore = await ethers.provider.getBalance(user1.address);
        console.log("User1 balance before:", ethers.utils.formatEther(balanceBefore));
        
        const tx = await dreams.connect(user1).withdraw(1);
        await tx.wait();
        
        const balanceAfter = await ethers.provider.getBalance(user1.address);
        console.log("User1 balance after:", ethers.utils.formatEther(balanceAfter));
        console.log("Balance change:", ethers.utils.formatEther(balanceAfter.sub(balanceBefore)));
    } catch (error) {
        console.error("Error withdrawing rewards:", error);
    }

    // Test Case 5: Check final contract state
    console.log("\n--- Final Contract State ---");
    try {
        const taskCount = await dreams.getTaskCount();
        console.log("Remaining tasks:", taskCount.toString());
        
        const allTaskIds = await dreams.getAllTaskIds();
        console.log("Active task IDs:", allTaskIds.map(id => id.toString()));
        
        const completedTasks = await dreams.totalCompletedTasks();
        console.log("Total completed tasks:", completedTasks.toString());
    } catch (error) {
        console.error("Error checking contract state:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
    