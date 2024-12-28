// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract Dreams is AccessControl, ReentrancyGuard, Pausable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");

    // Constants
    uint256 public constant MIN_STAKE = 0.01 ether;
    uint256 public constant MAX_DEADLINE = 365 days;
    uint256 public constant EMERGENCY_WITHDRAW_TIMELOCK = 30 days;

    struct Task {
        address owner;           // Task owner
        uint256 deadline;        // Task deadline timestamp
        bool rewardsDistributed; // Whether rewards have been distributed
        bool completed;          // Task completion status
        uint256 stakeAmount;    // Amount staked for this task
        bool withdrawn;         // Whether rewards were withdrawn
    }

    // State variables
    mapping(uint256 => Task) public tasks;
    uint256[] public allTaskIds;                      // Array to track all task IDs
    mapping(uint256 => uint256) public taskIdToIndex; // Map taskId to its index in allTaskIds
    uint256 public totalCompletedTasks;               // Total number of completed tasks
    uint256 public globalRewardPool;                  // Pool for distributing rewards
    mapping(uint256 => uint256) public emergencyWithdrawRequestTime;

    // Events
    event TaskCreated(uint256 indexed taskId, address indexed owner, uint256 deadline);
    event TaskCompleted(uint256 indexed taskId, address indexed owner);
    event StakeDeposited(uint256 indexed taskId, address indexed owner, uint256 amount);
    event StakeWithdrawn(uint256 indexed taskId, address indexed owner, uint256 amount);
    event RewardsDistributed(uint256 totalRewardPool, uint256 completedTaskCount);
    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event EmergencyWithdrawRequested(uint256 indexed taskId, uint256 unlockTime);
    event StakeForfeited(uint256 indexed taskId, address indexed owner, uint256 amount);

    // Constructor
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // Main Functions
    function createTask(uint256 taskId, uint256 deadline) external payable whenNotPaused nonReentrant {
        require(taskId > 0, "Invalid task ID");
        require(msg.value >= MIN_STAKE, "Stake amount too low");
        require(deadline > block.timestamp, "Deadline must be in future");
        require(deadline <= block.timestamp + MAX_DEADLINE, "Deadline too far");
        require(tasks[taskId].owner == address(0), "Task ID taken");

        tasks[taskId] = Task({
            owner: msg.sender,
            deadline: deadline,
            rewardsDistributed: false,
            completed: false,
            stakeAmount: msg.value,
            withdrawn: false
        });

        // Add to task tracking
        taskIdToIndex[taskId] = allTaskIds.length;
        allTaskIds.push(taskId);

        emit TaskCreated(taskId, msg.sender, deadline);
        emit StakeDeposited(taskId, msg.sender, msg.value);
    }

    function completeTask(uint256 taskId) external whenNotPaused onlyRole(VALIDATOR_ROLE) {
        Task storage task = tasks[taskId];
        require(task.owner != address(0), "Task doesn't exist");
        require(block.timestamp <= task.deadline, "Task deadline passed");
        require(!task.completed, "Task already completed");
        require(!task.rewardsDistributed, "Rewards already distributed");

        task.completed = true;
        totalCompletedTasks++;
        
        emit TaskCompleted(taskId, task.owner);
    }

    function distributeRewards() external whenNotPaused nonReentrant onlyRole(ADMIN_ROLE) {
        uint256 totalForfeitedStakes = 0;
        uint256[] memory tasksToRemove = new uint256[](allTaskIds.length);
        uint256 removeCount = 0;

        // Identify failed tasks and calculate forfeited stakes
        for (uint256 i = 0; i < allTaskIds.length; i++) {
            uint256 taskId = allTaskIds[i];
            Task storage task = tasks[taskId];
            
            // Find failed tasks (not completed + deadline passed)
            if (!task.completed && 
                !task.rewardsDistributed && 
                block.timestamp > task.deadline) {
                
                totalForfeitedStakes += task.stakeAmount;
                task.rewardsDistributed = true;
                
                // Add to global reward pool
                globalRewardPool += task.stakeAmount;
                
                // Mark task for removal
                tasksToRemove[removeCount] = taskId;
                removeCount++;
                
                emit StakeForfeited(taskId, task.owner, task.stakeAmount);
            }
        }
        
        require(totalForfeitedStakes > 0, "No stakes to distribute");
        require(totalCompletedTasks > 0, "No completed tasks");

        // Clean up failed tasks
        for (uint256 i = 0; i < removeCount; i++) {
            uint256 taskId = tasksToRemove[i];
            _removeTask(taskId);
        }
        
        emit RewardsDistributed(globalRewardPool, totalCompletedTasks);
    }

    function withdraw(uint256 taskId) external whenNotPaused nonReentrant {
        Task storage task = tasks[taskId];
        
        require(task.owner == msg.sender, "Not task owner");
        require(task.completed, "Task not completed");
        require(!task.withdrawn, "Already withdrawn");
        require(block.timestamp > task.deadline, "Deadline not passed");
        
        uint256 reward = task.stakeAmount;
        if (globalRewardPool > 0 && totalCompletedTasks > 0) {
            reward += (globalRewardPool / totalCompletedTasks);
            globalRewardPool -= (globalRewardPool / totalCompletedTasks);
        }
        
        task.withdrawn = true;
        totalCompletedTasks--;
        
        // Remove task from storage
        _removeTask(taskId);
        
        // Transfer rewards
        (bool success, ) = payable(msg.sender).call{value: reward}("");
        require(success, "Transfer failed");
        
        emit StakeWithdrawn(taskId, msg.sender, reward);
    }

    // Internal Functions
    function _removeTask(uint256 taskId) internal {
        // Remove from allTaskIds array using swap and pop
        uint256 lastIndex = allTaskIds.length - 1;
        uint256 taskIndex = taskIdToIndex[taskId];
        
        if (taskIndex != lastIndex) {
            uint256 lastTaskId = allTaskIds[lastIndex];
            allTaskIds[taskIndex] = lastTaskId;
            taskIdToIndex[lastTaskId] = taskIndex;
        }
        
        allTaskIds.pop();
        delete taskIdToIndex[taskId];
        delete tasks[taskId];
    }

    // Emergency Functions
    function requestEmergencyWithdraw(uint256 taskId) external onlyRole(ADMIN_ROLE) {
        require(emergencyWithdrawRequestTime[taskId] == 0, "Already requested");
        emergencyWithdrawRequestTime[taskId] = block.timestamp;
        emit EmergencyWithdrawRequested(taskId, block.timestamp + EMERGENCY_WITHDRAW_TIMELOCK);
    }

    function executeEmergencyWithdraw(uint256 taskId) external onlyRole(ADMIN_ROLE) {
        uint256 requestTime = emergencyWithdrawRequestTime[taskId];
        require(requestTime > 0, "Not requested");
        require(block.timestamp >= requestTime + EMERGENCY_WITHDRAW_TIMELOCK, "Timelock active");
        
        Task storage task = tasks[taskId];
        uint256 amount = task.stakeAmount;
        
        _removeTask(taskId);
        
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "Withdraw failed");
    }

    // Admin Functions
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function addValidator(address validator) external onlyRole(ADMIN_ROLE) {
        grantRole(VALIDATOR_ROLE, validator);
        emit ValidatorAdded(validator);
    }

    function removeValidator(address validator) external onlyRole(ADMIN_ROLE) {
        revokeRole(VALIDATOR_ROLE, validator);
        emit ValidatorRemoved(validator);
    }

    // View Functions
    function getTaskDetails(uint256 taskId) external view returns (
        address owner,
        uint256 deadline,
        bool completed,
        uint256 stakeAmount,
        bool withdrawn
    ) {
        Task storage task = tasks[taskId];
        return (
            task.owner,
            task.deadline,
            task.completed,
            task.stakeAmount,
            task.withdrawn
        );
    }

    function getAllTaskIds() external view returns (uint256[] memory) {
        return allTaskIds;
    }

    function getTaskCount() external view returns (uint256) {
        return allTaskIds.length;
    }

    // Fallback Functions
    receive() external payable {}
    fallback() external payable {}
}