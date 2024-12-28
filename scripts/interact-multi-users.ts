// scripts/interact-multi-users.ts
import { ethers } from "hardhat";
import { Dreams } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

async function createUserTasks(
    dreams: Dreams,
    users: SignerWithAddress[],
    startId: number,
    deadline: number,
    stake: string
) {
    console.log("\n--- Creating Tasks for Multiple Users ---");
    for (let i = 0; i < users.length; i++) {
        try {
            const taskId = startId + i;
            const tx = await dreams.connect(users[i]).createTask(taskId, deadline, {
                value: ethers.utils.parseEther(stake)
            });
            await tx.wait();
            console.log(`User${i + 1} created task ${taskId}`);

            const task = await dreams.getTaskDetails(taskId);
            console.log(`Task ${taskId} details:`, {
                owner: task.owner,
                deadline: new Date(Number(task.deadline) * 1000).toISOString(),
                completed: task.completed,
                stakeAmount: ethers.utils.formatEther(task.stakeAmount)
            });
        } catch (error) {
            console.error(`Error creating task for User${i + 1}:`, error);
        }
    }
}

async function completeTasks(
    dreams: Dreams,
    validator: SignerWithAddress,
    taskIds: number[]
) {
    console.log("\n--- Completing Selected Tasks ---");
    for (const taskId of taskIds) {
        try {
            const tx = await dreams.connect(validator).completeTask(taskId);
            await tx.wait();
            console.log(`Task ${taskId} completed by validator`);

            const task = await dreams.getTaskDetails(taskId);
            console.log(`Task ${taskId} completion status:`, task.completed);
        } catch (error) {
            console.error(`Error completing task ${taskId}:`, error);
        }
    }
}

async function withdrawRewards(
    dreams: Dreams,
    users: SignerWithAddress[],
    taskIds: number[]
) {
    console.log("\n--- Withdrawing Rewards ---");
    for (let i = 0; i < taskIds.length; i++) {
        try {
            const user = users[i];
            const taskId = taskIds[i];
            const balanceBefore = await ethers.provider.getBalance(user.address);
            
            const tx = await dreams.connect(user).withdraw(taskId);
            await tx.wait();
            
            const balanceAfter = await ethers.provider.getBalance(user.address);
            const balanceChange = balanceAfter.sub(balanceBefore);
            
            console.log(`User${i + 1} (Task ${taskId}) rewards withdrawn:`, 
                ethers.utils.formatEther(balanceChange), "ETH");
        } catch (error) {
            console.error(`Error withdrawing rewards for task ${taskIds[i]}:`, error);
        }
    }
}

async function main() {
    const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    // Get 10 signers
    const signers = await ethers.getSigners();
    const [deployer, validator, ...users] = signers;
    const selectedUsers = users.slice(0, 8); // Take 8 users for testing

    console.log("Interacting with contract at:", CONTRACT_ADDRESS);
    console.log("Deployer:", deployer.address);
    console.log("Validator:", validator.address);
    console.log("Number of users:", selectedUsers.length);

    // Get contract instance
    const Dreams = await ethers.getContractFactory("Dreams");
    const dreams = await Dreams.attach(CONTRACT_ADDRESS);

    // Setup validator
    console.log("\n--- Setting up Validator ---");
    try {
        const validatorRole = await dreams.VALIDATOR_ROLE();
        const tx = await dreams.grantRole(validatorRole, validator.address);
        await tx.wait();
        console.log("Added validator:", validator.address);
    } catch (error) {
        console.error("Error setting up validator:", error);
    }

    // Create tasks for all users
    const currentTime = Math.floor(Date.now() / 1000);
    const deadline = currentTime + 86400; // 1 day from now
    const stake = "0.01"; // 0.01 ETH

    await createUserTasks(dreams, selectedUsers, 1, deadline, stake);

    // Complete tasks for some users (5 out of 8)
    const completedTaskIds = [1, 2, 3, 4, 5];
    await completeTasks(dreams, validator, completedTaskIds);

    // Advance time to pass deadline
    console.log("\n--- Advancing Time ---");
    await ethers.provider.send("evm_increaseTime", [86401]); // 1 day + 1 second
    await ethers.provider.send("evm_mine", []);
    console.log("Time advanced by 1 day");

    // Distribute rewards
    console.log("\n--- Distributing Rewards ---");
    try {
        const tx = await dreams.connect(deployer).distributeRewards();
        await tx.wait();
        
        const rewardPool = await dreams.globalRewardPool();
        console.log("Global reward pool:", ethers.utils.formatEther(rewardPool), "ETH");
    } catch (error) {
        console.error("Error distributing rewards:", error);
    }

    // Withdraw rewards for completed tasks
    const completedUsers = selectedUsers.slice(0, 5); // First 5 users who completed tasks
    await withdrawRewards(dreams, completedUsers, completedTaskIds);

    // Final contract state
    console.log("\n--- Final Contract State ---");
    try {
        const taskCount = await dreams.getTaskCount();
        console.log("Remaining tasks:", taskCount.toString());
        
        const allTaskIds = await dreams.getAllTaskIds();
        console.log("Active task IDs:", allTaskIds.map(id => id.toString()));
        
        const completedTasks = await dreams.totalCompletedTasks();
        console.log("Total completed tasks:", completedTasks.toString());

        const finalRewardPool = await dreams.globalRewardPool();
        console.log("Final reward pool:", ethers.utils.formatEther(finalRewardPool), "ETH");
    } catch (error) {
        console.error("Error checking final state:", error);
    }

    // Print summary
    console.log("\n--- Test Summary ---");
    console.log("Total users:", selectedUsers.length);
    console.log("Tasks completed:", completedTaskIds.length);
    console.log("Tasks failed:", selectedUsers.length - completedTaskIds.length);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });