// scripts/interact.ts
import { ethers } from "hardhat";

async function main() {
    // Contract address on Base Sepolia
    const DREAMS_ADDRESS = "0xd9cf5d861E37edD6bA21aE38886e618E839B1c92";
    
    // Get signers
    const [admin, validator, user1, user2] = await ethers.getSigners();
    console.log("Interacting with contract using admin:", admin.address);

    // Get contract instance
    const Dreams = await ethers.getContractFactory("Dreams");
    const dreams = await Dreams.attach(DREAMS_ADDRESS);

    // Helper function to print balances
    async function printBalance(address: string, label: string) {
        const balance = await ethers.provider.getBalance(address);
        console.log(`${label} balance: ${ethers.utils.formatEther(balance)} ETH`);
    }

    try {
        console.log("\n1. Initial Setup");
        console.log("==============");
        await printBalance(user1.address, "User1");
        await printBalance(user2.address, "User2");

        // Create a new task
        console.log("\n2. Creating a New Task");
        console.log("====================");
        const oneWeek = 7 * 24 * 60 * 60; // One week in seconds
        const taskDeadline = Math.floor(Date.now() / 1000) + oneWeek;
        const taskId = 1;
        
        const createTaskTx = await dreams.connect(admin).createTask(taskId, taskDeadline);
        await createTaskTx.wait();
        console.log(`Task ${taskId} created with deadline:`, new Date(taskDeadline * 1000));

        // Users stake ETH
        console.log("\n3. Users Staking ETH");
        console.log("===================");
        const stakeAmount = ethers.utils.parseEther("0.1"); // 0.1 ETH

        // User1 stakes
        const stake1Tx = await dreams.connect(user1).deposit(
            taskId,
            stakeAmount,
            ethers.constants.AddressZero,
            { value: stakeAmount }
        );
        await stake1Tx.wait();
        console.log("User1 staked:", ethers.utils.formatEther(stakeAmount), "ETH");

        // User2 stakes
        const stake2Tx = await dreams.connect(user2).deposit(
            taskId,
            stakeAmount,
            ethers.constants.AddressZero,
            { value: stakeAmount }
        );
        await stake2Tx.wait();
        console.log("User2 staked:", ethers.utils.formatEther(stakeAmount), "ETH");

        // Print updated balances
        console.log("\n4. Balances After Staking");
        console.log("========================");
        await printBalance(user1.address, "User1");
        await printBalance(user2.address, "User2");
        await printBalance(DREAMS_ADDRESS, "Contract");

        // Validator marks User1's task as completed
        console.log("\n5. Validator Marking Task Completion");
        console.log("==================================");
        const completeTx = await dreams.connect(validator).completeTask(taskId, user1.address);
        await completeTx.wait();
        console.log("User1's task marked as completed");

        // Admin distributes rewards
        console.log("\n6. Admin Distributing Rewards");
        console.log("============================");
        const winners = [user1.address];
        const completionRates = [100]; // 100% completion rate
        const distributeTx = await dreams.connect(admin).distributeRewards(taskId, winners, completionRates);
        await distributeTx.wait();
        console.log("Rewards distributed");

        // Users withdraw their stakes
        console.log("\n7. Users Withdrawing Stakes");
        console.log("==========================");
        
        // User1 withdraws (completed task)
        const withdraw1Tx = await dreams.connect(user1).withdraw(taskId);
        await withdraw1Tx.wait();
        console.log("User1 withdrawn successfully");

        // Print final balances
        console.log("\n8. Final Balances");
        console.log("================");
        await printBalance(user1.address, "User1");
        await printBalance(user2.address, "User2");
        await printBalance(DREAMS_ADDRESS, "Contract");

    } catch (error) {
        console.error("\nError during interaction:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });