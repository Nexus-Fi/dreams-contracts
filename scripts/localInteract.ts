// scripts/localInteract.ts
import { ethers } from "hardhat";

async function main() {
    const DREAMS_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

    // Get signers
    const [admin, validator, user1, user2, user3] = await ethers.getSigners();
    console.log("\nAccount Details:");
    console.log("===============");
    console.log("Admin:", admin.address);
    console.log("Validator:", validator.address);
    console.log("User1:", user1.address);
    console.log("User2:", user2.address);
    console.log("User3:", user3.address);
    console.log("Contract:", DREAMS_ADDRESS);

    // Helper function to print balances
    async function printBalances() {
        const balances = {
            user1: ethers.utils.formatEther(await user1.getBalance()),
            user2: ethers.utils.formatEther(await user2.getBalance()),
            user3: ethers.utils.formatEther(await user3.getBalance()),
            contract: ethers.utils.formatEther(await ethers.provider.getBalance(DREAMS_ADDRESS))
        };
        
        console.log("\nCurrent Balances:");
        console.log("User1:", balances.user1, "ETH");
        console.log("User2:", balances.user2, "ETH");
        console.log("User3:", balances.user3, "ETH");
        console.log("Contract:", balances.contract, "ETH");
        return balances;
    }

    // Get contract instance
    const Dreams = await ethers.getContractFactory("Dreams");
    const dreams = await Dreams.attach(DREAMS_ADDRESS);

    try {
        // 1. Setup validator
        console.log("\n1. Setting up validator...");
        const validatorRole = await dreams.VALIDATOR_ROLE();
        const validatorTx = await dreams.connect(admin).grantRole(validatorRole, validator.address);
        const validatorReceipt = await validatorTx.wait();
        console.log("Validator role granted to:", validator.address);
        console.log("Transaction Hash:", validatorReceipt.transactionHash);

        // 2. Create task
        console.log("\n2. Creating new task...");
        const taskId = Math.floor(Date.now() / 1000);
        const oneDay = 24 * 60 * 60;
        const currentBlock = await ethers.provider.getBlock("latest");
        const deadline = currentBlock.timestamp + oneDay;

        console.log("Task ID:", taskId);
        console.log("Deadline:", new Date(deadline * 1000).toISOString());

        const createTaskTx = await dreams.connect(admin).createTask(taskId, deadline);
        const createTaskReceipt = await createTaskTx.wait();
        console.log("Task created. Hash:", createTaskReceipt.transactionHash);

        // 3. Users stake ETH
        console.log("\n3. Users staking ETH...");
        const stakeAmount = ethers.utils.parseEther("1.0");

        // All users stake
        for (const [index, user] of [user1, user2, user3].entries()) {
            console.log(`\nUser${index + 1} staking...`);
            const stakeTx = await dreams.connect(user).deposit(
                taskId,
                stakeAmount,
                ethers.constants.AddressZero,
                { value: stakeAmount }
            );
            const receipt = await stakeTx.wait();
            console.log(`User${index + 1} staked:`, ethers.utils.formatEther(stakeAmount), "ETH");
            console.log("Transaction Hash:", receipt.transactionHash);
        }

        const initialBalances = await printBalances();

        // 4. Mark task completion for user1 only
        console.log("\n4. Marking task completion...");
        const completeTx = await dreams.connect(validator).completeTask(taskId, user1.address);
        const completeReceipt = await completeTx.wait();
        console.log("User1 task marked complete. Hash:", completeReceipt.transactionHash);

        // Verify completion status
        console.log("\nTask Completion Status:");
        for (let i = 0; i < 3; i++) {
            const user = [user1, user2, user3][i];
            const isCompleted = await dreams.isTaskCompleted(taskId, user.address);
            console.log(`User${i + 1}:`, isCompleted);
        }

        // 5. Move past deadline
        console.log("\n5. Moving time forward...");
        await ethers.provider.send("evm_increaseTime", [oneDay + 1]);
        await ethers.provider.send("evm_mine", []);

        // 6. Get task details before distribution
        console.log("\n6. Task Details Before Distribution:");
        const totalStakes = await dreams.totalStakes(taskId);
        console.log("Total Stakes:", ethers.utils.formatEther(totalStakes));
        
        // Update reward pool manually if needed
        console.log("\nUpdating reward pool...");
        // User2 and User3's stakes should go to reward pool as they didn't complete
        const rewardPoolAmount = stakeAmount.mul(2); // 2 ETH from user2 and user3
        console.log("Expected Reward Pool:", ethers.utils.formatEther(rewardPoolAmount));

        // 7. Distribute rewards
        console.log("\n7. Distributing rewards...");
        const distributeTx = await dreams.connect(admin).distributeRewards(
            taskId,
            [user1.address],
            [100], // 100% completion rate
            { gasLimit: 500000 } // Adding explicit gas limit
        );
        const distributeReceipt = await distributeTx.wait();
        console.log("Rewards distributed. Hash:", distributeReceipt.transactionHash);

        // 8. Check withdrawal eligibility
        console.log("\n8. Withdrawal Eligibility:");
        for (let i = 0; i < 3; i++) {
            const user = [user1, user2, user3][i];
            const canWithdraw = await dreams.canWithdraw(taskId, user.address);
            console.log(`User${i + 1}:`, canWithdraw);
        }

        // 9. Process withdrawals
        console.log("\n9. Processing withdrawals...");
        
        // User1 withdraws
        console.log("\nUser1 withdrawing...");
        const withdrawTx = await dreams.connect(user1).withdraw(taskId);
        const withdrawReceipt = await withdrawTx.wait();
        console.log("User1 withdrawal complete. Hash:", withdrawReceipt.transactionHash);

        // Final balances
        console.log("\nFinal State:");
        const finalBalances = await printBalances();

        // Calculate and show changes
        console.log("\nBalance Changes:");
        console.log("User1:", parseFloat(finalBalances.user1) - parseFloat(initialBalances.user1), "ETH");
        console.log("User2:", parseFloat(finalBalances.user2) - parseFloat(initialBalances.user2), "ETH");
        console.log("User3:", parseFloat(finalBalances.user3) - parseFloat(initialBalances.user3), "ETH");
        console.log("Contract:", parseFloat(finalBalances.contract) - parseFloat(initialBalances.contract), "ETH");

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