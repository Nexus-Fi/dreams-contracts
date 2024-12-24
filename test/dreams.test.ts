// test/Dreams.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Dreams Contract - Rewards", function() {
    let dreams;
    let owner;
    let admin;
    let validator;
    let user1;
    let user2;
    let user3;

    beforeEach(async function() {
        [owner, admin, validator, user1, user2, user3] = await ethers.getSigners();

        const Dreams = await ethers.getContractFactory("Dreams");
        dreams = await Dreams.deploy(admin.address);
        await dreams.deployed();

        // Grant validator role
        await dreams.connect(admin).grantRole(await dreams.VALIDATOR_ROLE(), validator.address);

        // Create a task
        const taskId = 1;
        const oneDay = 24 * 60 * 60;
        const deadline = (await ethers.provider.getBlock("latest")).timestamp + oneDay;
        await dreams.connect(admin).createTask(taskId, deadline);
    });

    it("should correctly distribute rewards after deadline", async function() {
        const taskId = 1;
        const stakeAmount = ethers.utils.parseEther("1.0");

        // Users stake ETH
        await dreams.connect(user1).deposit(taskId, stakeAmount, ethers.constants.AddressZero, { value: stakeAmount });
        await dreams.connect(user2).deposit(taskId, stakeAmount, ethers.constants.AddressZero, { value: stakeAmount });
        await dreams.connect(user3).deposit(taskId, stakeAmount, ethers.constants.AddressZero, { value: stakeAmount });

        // Record initial balances
        const initialBalance1 = await ethers.provider.getBalance(user1.address);
        const initialBalance2 = await ethers.provider.getBalance(user2.address);
        const initialBalance3 = await ethers.provider.getBalance(user3.address);

        // Only user1 completes the task
        await dreams.connect(validator).completeTask(taskId, user1.address);

        // Move forward in time past deadline
        await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine", []);

        // Distribute rewards
        await dreams.connect(admin).distributeRewards(taskId, [user1.address], [100]);

        // User1 withdraws (should get original stake + rewards)
        await dreams.connect(user1).withdraw(taskId);

        // Get final balances
        const finalBalance1 = await ethers.provider.getBalance(user1.address);
        const finalBalance2 = await ethers.provider.getBalance(user2.address);
        const finalBalance3 = await ethers.provider.getBalance(user3.address);

        // User1 should have received their stake back plus rewards
        // (minus gas costs)
        expect(finalBalance1).to.be.gt(initialBalance1);
        
        // User2 and User3 should have less due to forfeited stakes
        expect(finalBalance2).to.be.lt(initialBalance2);
        expect(finalBalance3).to.be.lt(initialBalance3);
    });

    it("should fail to distribute rewards if no stakes are forfeited", async function() {
        const taskId = 1;
        const stakeAmount = ethers.utils.parseEther("1.0");

        // Users stake
        await dreams.connect(user1).deposit(taskId, stakeAmount, ethers.constants.AddressZero, { value: stakeAmount });
        
        // User completes task
        await dreams.connect(validator).completeTask(taskId, user1.address);

        // Move time forward
        await ethers.provider.send("evm_increaseTime", [24 * 60 * 60 + 1]);
        await ethers.provider.send("evm_mine", []);

        // Should fail as no forfeited stakes
        await expect(
            dreams.connect(admin).distributeRewards(taskId, [user1.address], [100])
        ).to.be.revertedWith("No forfeited stakes to distribute");
    });
});