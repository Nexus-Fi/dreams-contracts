// scripts/quick-test.ts
import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const DREAMS_ADDRESS = "0x61B03bBECA034D161212e295D6EAb0800DadCeB1";
    
    // Setup provider
    const provider = new ethers.providers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC);

    // Setup signers
    const adminSigner = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
    const userSigner = new ethers.Wallet(process.env.USER_PRIVATE_KEY!, provider);
    const validatorSigner = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY!, provider);

    // Get contract
    const dreams = await ethers.getContractAt("Dreams", DREAMS_ADDRESS, adminSigner);

    async function printBalances() {
        const adminBalance = await provider.getBalance(adminSigner.address);
        const userBalance = await provider.getBalance(userSigner.address);
        console.log("\nCurrent Balances:");
        console.log("Admin:", ethers.utils.formatEther(adminBalance), "ETH");
        console.log("User:", ethers.utils.formatEther(userBalance), "ETH");
    }

    try {
        console.log("\nStarting Quick Test...");
        console.log("Admin:", adminSigner.address);
        console.log("User:", userSigner.address);
        console.log("Validator:", validatorSigner.address);
        await printBalances();

        // 1. Create task with 2-minute deadline
        const taskId = Math.floor(Date.now() / 1000);
        const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now

        console.log("\n1. Creating task...");
        const createTx = await dreams.connect(adminSigner).createTask(taskId, deadline, {
            gasLimit: 500000
        });
        await createTx.wait();
        console.log("Task created - ID:", taskId);
        console.log("Deadline:", new Date(deadline * 1000).toISOString());
        console.log("Tx Hash:", createTx.hash);

        // 2. Make deposit
        console.log("\n2. Making deposit...");
        const depositAmount = ethers.utils.parseEther("0.001");
        const depositTx = await dreams.connect(userSigner).deposit(
            taskId,
            depositAmount,
            ethers.constants.AddressZero,
            {
                value: depositAmount,
                gasLimit: 500000
            }
        );
        await depositTx.wait();
        console.log("Deposited:", ethers.utils.formatEther(depositAmount), "ETH");
        console.log("Tx Hash:", depositTx.hash);

        // 3. Mark task as completed
        console.log("\n3. Marking task as completed...");
        const completeTx = await dreams.connect(validatorSigner).completeTask(taskId, userSigner.address, {
            gasLimit: 500000
        });
        await completeTx.wait();
        console.log("Task marked complete");
        console.log("Tx Hash:", completeTx.hash);

        // 4. Wait for deadline
        const timeToWait = deadline - Math.floor(Date.now() / 1000);
        console.log(`\n4. Waiting ${timeToWait} seconds for deadline...`);
        while (Math.floor(Date.now() / 1000) <= deadline) {
            process.stdout.write(".");
            await sleep(1000);
        }
        console.log("\nDeadline passed!");

        // 5. Distribute rewards
        console.log("\n5. Distributing rewards...");
        const distributeTx = await dreams.connect(adminSigner).distributeRewards(
            taskId,
            [userSigner.address],
            [100],
            { gasLimit: 500000 }
        );
        await distributeTx.wait();
        console.log("Rewards distributed");
        console.log("Tx Hash:", distributeTx.hash);

        // 6. Withdraw
        console.log("\n6. Withdrawing stake and rewards...");
        const withdrawTx = await dreams.connect(userSigner).withdraw(taskId, {
            gasLimit: 500000
        });
        await withdrawTx.wait();
        console.log("Withdrawal complete");
        console.log("Tx Hash:", withdrawTx.hash);

        // Print final balances
        await printBalances();

        // Print transaction summary
        console.log("\nTransaction Summary:");
        console.log("===================");
        console.log("Task Creation:", createTx.hash);
        console.log("Deposit:", depositTx.hash);
        console.log("Task Completion:", completeTx.hash);
        console.log("Reward Distribution:", distributeTx.hash);
        console.log("Withdrawal:", withdrawTx.hash);

    } catch (error) {
        console.error("\nError:", error);
        if (error.error && error.error.message) {
            console.error("Error message:", error.error.message);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });