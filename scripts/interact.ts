// scripts/reward-calculation.ts
import { ethers } from "hardhat";

async function main() {
    const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    // Get signers
    const [deployer, validator, user1, user2, user3] = await ethers.getSigners();

    // Get contract instance
    const Dreams = await ethers.getContractFactory("Dreams");
    const dreams = Dreams.attach(CONTRACT_ADDRESS);

    // Setup validator
    console.log("\n=== Setting up Validator ===");
    const validatorRole = await dreams.VALIDATOR_ROLE();
    await dreams.grantRole(validatorRole, validator.address);
    console.log("Validator added:", validator.address);

    // Get current block timestamp for deadline
    const latestBlock = await ethers.provider.getBlock('latest');
    const deadline = latestBlock.timestamp + 86400; // 24 hours
    const stake = ethers.utils.parseEther("0.01");

    console.log("\n=== Initial Stakes ===");
    console.log("Each user stakes:", ethers.utils.formatEther(stake), "ETH");

    // Create tasks
    console.log("\n=== Creating Tasks ===");
    await dreams.connect(user1).createTask(1, deadline, { value: stake });
    console.log("User1 created task 1");
    await dreams.connect(user2).createTask(2, deadline, { value: stake });
    console.log("User2 created task 2");
    await dreams.connect(user3).createTask(3, deadline, { value: stake });
    console.log("User3 created task 3");

    // Complete tasks 1 and 2
    console.log("\n=== Completing Tasks ===");
    await dreams.connect(validator).completeTask(1);
    await dreams.connect(validator).completeTask(2);
    console.log("Tasks 1 and 2 completed, Task 3 left incomplete");

    // Record balances before distribution
    const user1BalanceBefore = await ethers.provider.getBalance(user1.address);
    const user2BalanceBefore = await ethers.provider.getBalance(user2.address);

    // Advance time
    await ethers.provider.send("evm_increaseTime", [86401]);
    await ethers.provider.send("evm_mine", []);

    // Distribute rewards
    console.log("\n=== Distributing Rewards ===");
    await dreams.connect(deployer).distributeRewards();
    
    const rewardPool = await dreams.globalRewardPool();
    console.log("Global reward pool (User3's forfeited stake):", ethers.utils.formatEther(rewardPool), "ETH");
    console.log("Each successful user should receive their stake (0.01 ETH) + half of User3's stake (0.005 ETH)");

    // Users withdraw
    console.log("\n=== Withdrawals ===");
    
    // User1 withdrawal
    await dreams.connect(user1).withdraw(1);
    const user1BalanceAfter = await ethers.provider.getBalance(user1.address);
    const user1Reward = user1BalanceAfter.sub(user1BalanceBefore);
    console.log("\nUser1 reward breakdown:");
    console.log("Total received:", ethers.utils.formatEther(user1Reward), "ETH");
    console.log("Original stake:", ethers.utils.formatEther(stake), "ETH");
    console.log("Share of User3's stake:", ethers.utils.formatEther(user1Reward.sub(stake)), "ETH");

    // User2 withdrawal
    await dreams.connect(user2).withdraw(2);
    const user2BalanceAfter = await ethers.provider.getBalance(user2.address);
    const user2Reward = user2BalanceAfter.sub(user2BalanceBefore);
    console.log("\nUser2 reward breakdown:");
    console.log("Total received:", ethers.utils.formatEther(user2Reward), "ETH");
    console.log("Original stake:", ethers.utils.formatEther(stake), "ETH");
    console.log("Share of User3's stake:", ethers.utils.formatEther(user2Reward.sub(stake)), "ETH");

    // Final reward pool
    const finalRewardPool = await dreams.globalRewardPool();
    console.log("\nFinal reward pool:", ethers.utils.formatEther(finalRewardPool), "ETH");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

    