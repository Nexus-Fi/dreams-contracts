// scripts/interact-test.ts
import { ethers } from "hardhat";

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function printBalances(users: any[], labels: string[]) {
    console.log("\nCurrent Balances:");
    for (let i = 0; i < users.length; i++) {
        const balance = await ethers.provider.getBalance(users[i].address);
        console.log(`${labels[i]}:`, ethers.utils.formatEther(balance), "ETH");
    }
}

async function main() {
    const DREAMS_ADDRESS = "0x61B03bBECA034D161212e295D6EAb0800DadCeB1";
    const [admin, validator, user1, user2] = await ethers.getSigners();
    const users = [admin, validator, user1, user2];
    const labels = ["Admin", "Validator", "User1", "User2"];

    console.log("\nAccounts:");
    console.log("Admin:", admin.address);
    console.log("Validator:", validator.address);
    console.log("User1:", user1.address);
    console.log("User2:", user2.address);

    // Print initial balances
    await printBalances(users, labels);

    const dreams = await ethers.getContractAt("Dreams", DREAMS_ADDRESS);

    async function checkRoles() {
        const validatorRole = await dreams.VALIDATOR_ROLE();
        const adminRole = await dreams.ADMIN_ROLE();
        
        console.log("\nChecking Roles:");
        console.log("Admin has admin role:", await dreams.hasRole(adminRole, admin.address));
        console.log("Validator has validator role:", await dreams.hasRole(validatorRole, validator.address));
    }

    try {
        // 1. Setup roles
        console.log("\n1. Setting up roles...");
        await checkRoles();

        const validatorRole = await dreams.VALIDATOR_ROLE();
        if (!(await dreams.hasRole(validatorRole, validator.address))) {
            console.log("Granting validator role...");
            const grantTx = await dreams.connect(admin).grantRole(validatorRole, validator.address);
            const receipt = await grantTx.wait();
            console.log("Validator role granted - Tx Hash:", receipt.transactionHash);
        }

        await checkRoles();

        // 2. Create task
        console.log("\n2. Creating task...");
        const taskId = Math.floor(Date.now() / 1000);
        const deadline = Math.floor(Date.now() / 1000) + 120;
        
        const createTx = await dreams.connect(admin).createTask(taskId, deadline);
        const createReceipt = await createTx.wait();
        console.log("Task created with ID:", taskId);
        console.log("Transaction Hash:", createReceipt.transactionHash);
        console.log("Deadline:", new Date(deadline * 1000).toISOString());

        // Print balances after task creation
        await printBalances(users, labels);

        // 3. Users stake
        console.log("\n3. Users staking...");
        const stakeAmount = ethers.utils.parseEther("0.1");

        // User1 stakes
        console.log("\nUser1 staking...");
        const stake1Tx = await dreams.connect(user1).deposit(
            taskId,
            stakeAmount,
            ethers.constants.AddressZero,
            { value: stakeAmount, gasLimit: 500000 }
        );
        const stake1Receipt = await stake1Tx.wait();
        console.log("User1 staked", ethers.utils.formatEther(stakeAmount), "ETH");
        console.log("Transaction Hash:", stake1Receipt.transactionHash);

        // User2 stakes
        console.log("\nUser2 staking...");
        const stake2Tx = await dreams.connect(user2).deposit(
            taskId,
            stakeAmount,
            ethers.constants.AddressZero,
            { value: stakeAmount, gasLimit: 500000 }
        );
        const stake2Receipt = await stake2Tx.wait();
        console.log("User2 staked", ethers.utils.formatEther(stakeAmount), "ETH");
        console.log("Transaction Hash:", stake2Receipt.transactionHash);

        // Print balances after staking
        await printBalances(users, labels);

        // 4. Mark task completion
        console.log("\n4. Marking User1's task as completed...");
        const completeTx = await dreams.connect(validator).completeTask(
            taskId, 
            user1.address,
            { gasLimit: 500000 }
        );
        const completeReceipt = await completeTx.wait();
        console.log("User1's task marked as completed");
        console.log("Transaction Hash:", completeReceipt.transactionHash);

        // 5. Wait for deadline
        console.log("\n5. Waiting for deadline (2 minutes)...");
        console.log("Current time:", new Date().toISOString());
        console.log("Waiting until:", new Date(deadline * 1000).toISOString());

        while (Math.floor(Date.now() / 1000) <= deadline) {
            process.stdout.write(".");
            await sleep(1000);
        }
        console.log("\nDeadline passed!");

        // 6. Distribute rewards
        console.log("\n6. Distributing rewards...");
        const distributeTx = await dreams.connect(admin).distributeRewards(
            taskId,
            [user1.address],
            [100],
            { gasLimit: 500000 }
        );
        const distributeReceipt = await distributeTx.wait();
        console.log("Rewards distributed!");
        console.log("Transaction Hash:", distributeReceipt.transactionHash);

        // Print balances after distribution
        await printBalances(users, labels);

        // 7. Withdrawals
        console.log("\n7. Testing withdrawals...");
        
        // User1 withdrawal
        console.log("\nUser1 withdrawing...");
        try {
            const withdraw1Tx = await dreams.connect(user1).withdraw(taskId, { gasLimit: 500000 });
            const withdraw1Receipt = await withdraw1Tx.wait();
            console.log("User1 withdrawal successful!");
            console.log("Transaction Hash:", withdraw1Receipt.transactionHash);
        } catch (error) {
            console.log("User1 withdrawal failed:", error.message);
        }

        // User2 withdrawal
        console.log("\nUser2 withdrawing...");
        try {
            const withdraw2Tx = await dreams.connect(user2).withdraw(taskId, { gasLimit: 500000 });
            const withdraw2Receipt = await withdraw2Tx.wait();
            console.log("User2 withdrawal successful!");
            console.log("Transaction Hash:", withdraw2Receipt.transactionHash);
        } catch (error) {
            console.log("User2 withdrawal failed as expected (task not completed)");
        }

        // Print final balances
        console.log("\nFinal Balances:");
        await printBalances(users, labels);

        // Print contract balance
        const contractBalance = await ethers.provider.getBalance(DREAMS_ADDRESS);
        console.log("Contract Balance:", ethers.utils.formatEther(contractBalance), "ETH");

        // Print summary
        console.log("\nTransaction Summary:");
        console.log("==================");
        console.log("Task Creation:", createReceipt.transactionHash);
        console.log("User1 Stake:", stake1Receipt.transactionHash);
        console.log("User2 Stake:", stake2Receipt.transactionHash);
        console.log("Task Completion:", completeReceipt.transactionHash);
        console.log("Reward Distribution:", distributeReceipt.transactionHash);

    } catch (error) {
        console.error("\nError during interaction:", error);
        if (error.data) {
            console.error("Error data:", error.data);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });