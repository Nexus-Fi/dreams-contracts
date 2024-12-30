// scripts/interact-local.ts
import { ethers } from "hardhat";

async function main() {
    const [deployer, validator, user1, user2, user3, user4, user5] = await ethers.getSigners();

    console.log("\n=== Initial Setup ===");
    // Deploy contract
    const Dreams = await ethers.getContractFactory("Dreams");
    const dreams = await Dreams.deploy(deployer.address);
    await dreams.deployed();
    console.log("Contract deployed to:", dreams.address);

    // Setup validator
    await dreams.grantRole(await dreams.VALIDATOR_ROLE(), validator.address);
    console.log("Validator added:", validator.address);

    // Set task parameters
    const currentTime = Math.floor(Date.now() / 1000);
    const deadline = currentTime + 30; // 30 seconds from now
    const stake = ethers.utils.parseEther("1.0"); // 1 ETH stake for easy calculation

    console.log("\n=== Initial Balances ===");
    for (let i = 1; i <= 5; i++) {
        const balance = await ethers[`provider`].getBalance(eval(`user${i}`).address);
        console.log(`User${i} initial balance: ${ethers.utils.formatEther(balance)} ETH`);
    }

    console.log("\n=== Creating Tasks ===");
    // Create tasks for all 5 users
    for (let i = 1; i <= 5; i++) {
        const tx = await dreams.connect(eval(`user${i}`)).createTask(i, deadline, { value: stake });
        await tx.wait();
        console.log(`User${i} created task ${i} with ${ethers.utils.formatEther(stake)} ETH stake`);
    }

    console.log("\n=== Completing Tasks (3 out of 5) ===");
    // Complete tasks for users 1, 2, and 3
    for (let i = 1; i <= 3; i++) {
        const tx = await dreams.connect(validator).completeTask(i);
        await tx.wait();
        console.log(`Task ${i} completed for User${i}`);
    }
    console.log("Tasks 4 and 5 left incomplete intentionally");

    // Wait for deadline to pass
    console.log("\n=== Waiting for deadline (30 seconds) ===");
    await new Promise(resolve => setTimeout(resolve, 31000)); // Wait 31 seconds

    // Advance blockchain time
    await ethers.provider.send("evm_increaseTime", [31]);
    await ethers.provider.send("evm_mine", []);

    console.log("\n=== Distributing Rewards ===");
    // Distribute rewards
    const distributeTx = await dreams.connect(deployer).distributeRewards();
    await distributeTx.wait();
    
    const rewardPool = await dreams.globalRewardPool();
    console.log(`Global reward pool: ${ethers.utils.formatEther(rewardPool)} ETH`);
    console.log("(Should contain 2 ETH from User4 and User5's forfeited stakes)");

    console.log("\n=== Withdrawing Rewards ===");
    // Users 1, 2, and 3 withdraw their rewards
    for (let i = 1; i <= 3; i++) {
        const balanceBefore = await ethers.provider.getBalance(eval(`user${i}`).address);
        const tx = await dreams.connect(eval(`user${i}`)).withdraw(i);
        await tx.wait();
        const balanceAfter = await ethers.provider.getBalance(eval(`user${i}`).address);
        
        console.log(`\nUser${i} withdrawal:`);
        console.log(`Balance before: ${ethers.utils.formatEther(balanceBefore)} ETH`);
        console.log(`Balance after: ${ethers.utils.formatEther(balanceAfter)} ETH`);
        console.log(`Change: ${ethers.utils.formatEther(balanceAfter.sub(balanceBefore))} ETH`);
    }

    console.log("\n=== Failed Withdrawal Attempts ===");
    // Try to withdraw for users 4 and 5 (should fail)
    try {
        await dreams.connect(user4).withdraw(4);
    } catch (error) {
        console.log("User4 withdrawal failed as expected (task not completed)");
    }
    try {
        await dreams.connect(user5).withdraw(5);
    } catch (error) {
        console.log("User5 withdrawal failed as expected (task not completed)");
    }

    console.log("\n=== Final Balances ===");
    for (let i = 1; i <= 5; i++) {
        const balance = await ethers.provider.getBalance(eval(`user${i}`).address);
        console.log(`User${i} final balance: ${ethers.utils.formatEther(balance)} ETH`);
    }

    // Final contract state
    console.log("\n=== Final Contract State ===");
    const taskCount = await dreams.getTaskCount();
    const allTaskIds = await dreams.getAllTaskIds();
    const completedTasks = await dreams.totalCompletedTasks();
    const finalRewardPool = await dreams.globalRewardPool();

    console.log("Remaining tasks:", taskCount.toString());
    console.log("Active task IDs:", allTaskIds.map(id => id.toString()));
    console.log("Total completed tasks:", completedTasks.toString());
    console.log("Final reward pool:", ethers.utils.formatEther(finalRewardPool), "ETH");

    console.log("\n=== Summary ===");
    console.log("1. Five users staked 1 ETH each");
    console.log("2. Users 1, 2, and 3 completed their tasks");
    console.log("3. Users 4 and 5 failed (2 ETH total forfeited)");
    console.log("4. Each successful user should receive:");
    console.log("   - Their 1 ETH stake back");
    console.log("   - ~0.67 ETH (1/3 of the 2 ETH forfeited)");
    console.log("   - Total: ~1.67 ETH each");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });