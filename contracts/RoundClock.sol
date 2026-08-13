// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice ISomniaEventHandler for DreamDesk round expiry.
/// The session key owns a one-shot Schedule subscription; this contract receives the callback.
contract RoundClock {
    address public constant PRECOMPILE = 0x0000000000000000000000000000000000000100;
    bytes4 private constant IERC165_ID = 0x01ffc9a7;
    bytes4 private constant HANDLER_ID = bytes4(keccak256("onEvent(address,bytes32[],bytes)"));

    event RoundFired(uint256 indexed timestampMs, uint256 fireCount);

    uint256 public fireCount;
    uint256 public lastTimestampMs;

    error OnlyReactivityPrecompile();

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == IERC165_ID || interfaceId == HANDLER_ID;
    }

    function onEvent(address, bytes32[] calldata eventTopics, bytes calldata) external {
        if (msg.sender != PRECOMPILE) revert OnlyReactivityPrecompile();
        uint256 ts = eventTopics.length > 1 ? uint256(eventTopics[1]) : 0;
        lastTimestampMs = ts;
        unchecked {
            fireCount += 1;
        }
        emit RoundFired(ts, fireCount);
    }
}
