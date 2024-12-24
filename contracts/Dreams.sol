// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract Dreams is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    struct Task {
        uint256 deadline;
        bool rewardsDistributed;
        mapping(address => bool) completed;
        mapping(address => bool) hasStaked;  // Track if user has staked
        uint256 completedCount;  // Track number of completions
        uint256 totalParticipants;  // Track total participants
    }

    struct Stake {
        uint256 amount;
        address token;
        bool withdrawn;
        uint256 depositTime;  // Track when stake was made
    }

    // State variables
    mapping(address => mapping(uint256 => Stake)) public stakes;
    mapping(uint256 => Task) public tasks;
    mapping(uint256 => uint256) public totalStakes;
    mapping(uint256 => uint256) public rewardPool;
    mapping(uint256 => address[]) public stakeholders;
    
    // Emergency withdrawal timelock
    uint256 public constant EMERGENCY_WITHDRAW_TIMELOCK = 30 days;
    mapping(uint256 => uint256) public emergencyWithdrawRequestTime;

    // Events
    event TaskCreated(uint256 indexed taskId, uint256 deadline);
    event TaskCompleted(address indexed user, uint256 indexed taskId);
    event Deposit(address indexed user, uint256 indexed taskId, uint256 amount, address token);
    event Withdraw(address indexed user, uint256 indexed taskId, uint256 amount);
    event RewardsDistributed(uint256 indexed taskId, uint256 totalRewardPool);
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event EmergencyWithdrawRequested(uint256 indexed taskId, uint256 unlockTime);
    event StakeForfeited(address indexed user, uint256 indexed taskId, uint256 amount);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    function createTask(uint256 taskId, uint256 deadline) external whenNotPaused onlyRole(ADMIN_ROLE) {
        require(taskId > 0, "Invalid task ID");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(tasks[taskId].deadline == 0, "Task already exists");

        tasks[taskId].deadline = deadline;
        emit TaskCreated(taskId, deadline);
    }

    function deposit(uint256 taskId, uint256 amount, address token) external payable whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be greater than zero");
        require(taskId > 0, "Invalid task ID");
        require(tasks[taskId].deadline > 0, "Task does not exist");
        require(block.timestamp < tasks[taskId].deadline, "Task deadline passed");
        require(!tasks[taskId].hasStaked[msg.sender], "Already staked for this task");

        if (token == address(0)) {
            require(msg.value == amount, "Mismatched ETH value");
        } else {
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "ERC20 transfer failed");
        }

        stakes[msg.sender][taskId] = Stake({
            amount: amount,
            token: token,
            withdrawn: false,
            depositTime: block.timestamp
        });

        tasks[taskId].hasStaked[msg.sender] = true;
        tasks[taskId].totalParticipants++;
        stakeholders[taskId].push(msg.sender);
        totalStakes[taskId] += amount;
        
        emit Deposit(msg.sender, taskId, amount, token);
    }

    function completeTask(uint256 taskId, address user) external whenNotPaused onlyRole(VALIDATOR_ROLE) {
        require(taskId > 0, "Invalid task ID");
        require(block.timestamp <= tasks[taskId].deadline, "Task deadline passed");
        require(!tasks[taskId].completed[user], "Task already completed");
        require(stakes[user][taskId].amount > 0, "No stake found");

        tasks[taskId].completed[user] = true;
        tasks[taskId].completedCount++;
        emit TaskCompleted(user, taskId);
    }

    function distributeRewards(uint256 taskId, address[] calldata winners, uint256[] calldata completionRates) 
        external 
        whenNotPaused
        onlyRole(ADMIN_ROLE) 
        nonReentrant
    {
        require(block.timestamp > tasks[taskId].deadline, "Task deadline not passed");
        require(!tasks[taskId].rewardsDistributed, "Rewards already distributed");
        require(winners.length == completionRates.length, "Invalid input lengths");
        
        uint256 forfeitedAmount = calculateForfeitedStakes(taskId);
        
        if (winners.length == 0 && forfeitedAmount > 0) {
            // If no winners but there are forfeited stakes, funds go to admin-controlled pool
            rewardPool[taskId] = forfeitedAmount;
            emit RewardsDistributed(taskId, 0);
        } else if (winners.length > 0) {
            uint256 totalCompletionRate = 0;
            for (uint256 i = 0; i < completionRates.length; i++) {
                totalCompletionRate += completionRates[i];
            }
            
            rewardPool[taskId] = forfeitedAmount;
            for (uint256 i = 0; i < winners.length; i++) {
                require(tasks[taskId].completed[winners[i]], "Winner did not complete task");
                uint256 reward = (forfeitedAmount * completionRates[i]) / totalCompletionRate;
                stakes[winners[i]][taskId].amount += reward;
                emit StakeForfeited(winners[i], taskId, reward);
            }
            
            emit RewardsDistributed(taskId, forfeitedAmount);
        }
        
        tasks[taskId].rewardsDistributed = true;
    }

    function withdraw(uint256 taskId) external whenNotPaused nonReentrant {
        require(block.timestamp > tasks[taskId].deadline, "Task deadline not passed");
        require(tasks[taskId].rewardsDistributed, "Rewards not distributed yet");
        
        Stake storage stakeData = stakes[msg.sender][taskId];
        require(stakeData.amount > 0, "No stake found");
        require(!stakeData.withdrawn, "Stake already withdrawn");

        uint256 totalAmount = stakeData.amount;
        stakeData.withdrawn = true;
        totalStakes[taskId] -= stakeData.amount;

        // If user completed the task, they get their stake (+ any rewards if allocated)
        // If user didn't complete, they only get their stake if everyone completed
        require(
            tasks[taskId].completed[msg.sender] || rewardPool[taskId] == 0,
            "Cannot withdraw: task not completed and rewards exist"
        );

        if (stakeData.token == address(0)) {
            (bool success, ) = msg.sender.call{value: totalAmount}("");
            require(success, "ETH transfer failed");
        } else {
            require(IERC20(stakeData.token).transfer(msg.sender, totalAmount), "ERC20 transfer failed");
        }

        emit Withdraw(msg.sender, taskId, totalAmount);
    }

    function calculateForfeitedStakes(uint256 taskId) internal view returns (uint256) {
        uint256 totalForfeited = 0;
        for (uint256 i = 0; i < stakeholders[taskId].length; i++) {
            address user = stakeholders[taskId][i];
            Stake storage userStake = stakes[user][taskId];
            if (!tasks[taskId].completed[user] && !userStake.withdrawn && userStake.amount > 0) {
                totalForfeited += userStake.amount;
            }
        }
        return totalForfeited;
    }

    // Emergency Functions
    function requestEmergencyWithdraw(uint256 taskId) external onlyRole(ADMIN_ROLE) {
        require(emergencyWithdrawRequestTime[taskId] == 0, "Emergency withdraw already requested");
        
        emergencyWithdrawRequestTime[taskId] = block.timestamp;
        emit EmergencyWithdrawRequested(taskId, block.timestamp + EMERGENCY_WITHDRAW_TIMELOCK);
    }

    function executeEmergencyWithdraw(uint256 taskId) external onlyRole(ADMIN_ROLE) {
        require(emergencyWithdrawRequestTime[taskId] > 0, "No emergency withdraw requested");
        require(block.timestamp >= emergencyWithdrawRequestTime[taskId] + EMERGENCY_WITHDRAW_TIMELOCK, 
                "Timelock not expired");
                
        uint256 amount = rewardPool[taskId];
        rewardPool[taskId] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Emergency withdraw failed");
    }

    // Pause/Unpause functions
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // View Functions
    function isTaskCompleted(uint256 taskId, address user) external view returns (bool) {
        return tasks[taskId].completed[user];
    }

    function canWithdraw(uint256 taskId, address user) external view returns (bool) {
        return block.timestamp > tasks[taskId].deadline && 
               tasks[taskId].rewardsDistributed &&
               stakes[user][taskId].amount > 0 &&
               !stakes[user][taskId].withdrawn &&
               tasks[taskId].completed[user];
    }

    function getStakeholders(uint256 taskId) external view returns (address[] memory) {
        return stakeholders[taskId];
    }

    function getTaskDetails(uint256 taskId) external view returns (
        uint256 deadline,
        bool rewardsDistributed,
        uint256 totalStakeAmount,
        uint256 rewardPoolAmount,
        uint256 completedCount,
        uint256 totalParticipants
    ) {
        Task storage task = tasks[taskId];
        return (
            task.deadline,
            task.rewardsDistributed,
            totalStakes[taskId],
            rewardPool[taskId],
            task.completedCount,
            task.totalParticipants
        );
    }

    receive() external payable {}
    fallback() external payable {}
}