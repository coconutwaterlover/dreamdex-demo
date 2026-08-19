// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {SomniaEventHandler} from "@somnia-chain/reactivity-contracts/contracts/SomniaEventHandler.sol";
import {SomniaExtensions} from "@somnia-chain/reactivity-contracts/contracts/interfaces/SomniaExtensions.sol";

interface IDeskArena {
    function tick() external;
    function currentRound() external view returns (uint256);
    function roundEndsAt(uint256 roundId) external view returns (uint256);
    function ROUND_SECONDS() external view returns (uint256);
}

/**
 * @title ArenaClock
 * @notice A five-minute heartbeat that keeps itself alive.
 *
 * Somnia Reactivity only requires the *subscription owner* to hold the 32 STT sybil
 * bond — and the owner can be a contract. So this clock funds itself, and every time
 * the chain calls it back it ticks the arena and immediately schedules its own next
 * firing. No cron, no keeper, no server: once armed it runs until the balance runs out.
 *
 * `rearm()` is permissionless so a missed callback can always be healed, and
 * `DeskArena.tick()` is idempotent, so a double fire is harmless.
 */
contract ArenaClock is SomniaEventHandler {
    IDeskArena public immutable arena;
    address public immutable admin;

    uint64 public constant CALLBACK_GAS_LIMIT = 30_000_000;
    uint64 public constant PRIORITY_FEE_PER_GAS = 1;
    /// @dev Fire just after the boundary: landing on it exactly risks a callback whose
    /// block.timestamp is still in the old round, which would silently skip a tick.
    uint256 public constant BOUNDARY_OFFSET = 2;

    uint256 public fireCount;
    uint256 public lastFiredAtMs;
    uint256 public armedForMs;
    uint256 public subscriptionId;

    event ClockArmed(uint256 indexed subscriptionId, uint256 timestampMs);
    event ClockFired(uint256 indexed fireCount, uint256 timestampMs);
    event ClockRearmFailed(uint256 timestampMs, bytes reason);
    event Funded(address indexed from, uint256 amount);

    error OnlyAdmin();
    error NothingToWithdraw();
    error WithdrawFailed();
    error AlreadyArmed();

    constructor(address arena_, address admin_) payable {
        arena = IDeskArena(arena_);
        admin = admin_;
    }

    /// @notice The bond Reactivity checks before it will accept a subscription.
    function minimumBalance() external pure returns (uint256) {
        return SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE;
    }

    function isFunded() public view returns (bool) {
        return address(this).balance >= SomniaExtensions.SUBSCRIPTION_OWNER_MINIMUM_BALANCE;
    }

    /// @notice Next round boundary, in the milliseconds Reactivity schedules on.
    function nextBoundaryMs() public view returns (uint256) {
        uint256 period = arena.ROUND_SECONDS();
        uint256 next = ((block.timestamp / period) + 1) * period + BOUNDARY_OFFSET;
        // Schedule must be strictly in the future; skip a boundary if we are on top of it.
        while (next * 1000 < ((block.timestamp + 1) * 1000) + 1) next += period;
        return next * 1000;
    }

    /// @notice Arms (or re-arms) the clock for the next boundary. Permissionless: if a
    /// callback is ever dropped, anyone can restart the heartbeat.
    function rearm() public returns (uint256) {
        uint256 target = nextBoundaryMs();
        if (armedForMs == target) revert AlreadyArmed();
        subscriptionId = SomniaExtensions.scheduleSubscriptionAtTimestamp(
            address(this),
            target,
            SomniaExtensions.SubscriptionOptions({
                priorityFeePerGas: PRIORITY_FEE_PER_GAS,
                maxFeePerGas: 0,
                gasLimit: CALLBACK_GAS_LIMIT
            })
        );
        armedForMs = target;
        emit ClockArmed(subscriptionId, target);
        return subscriptionId;
    }

    function _onEvent(address, bytes32[] calldata eventTopics, bytes calldata) internal override {
        uint256 ts = eventTopics.length > 1 ? uint256(eventTopics[1]) : block.timestamp * 1000;
        lastFiredAtMs = ts;
        unchecked {
            fireCount += 1;
        }

        // Close the round that just ended. Never let a tick revert take the clock down.
        try arena.tick() {} catch {}

        // Re-arm for the next boundary — this is what makes the clock perpetual.
        armedForMs = 0;
        try this.rearm() {} catch (bytes memory reason) {
            emit ClockRearmFailed(ts, reason);
        }

        emit ClockFired(fireCount, ts);
    }

    /// @notice Top up the subscription bond so the heartbeat keeps paying for itself.
    function fund() external payable {
        emit Funded(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        if (msg.sender != admin) revert OnlyAdmin();
        if (amount == 0 || amount > address(this).balance) revert NothingToWithdraw();
        (bool ok, ) = admin.call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }
}
