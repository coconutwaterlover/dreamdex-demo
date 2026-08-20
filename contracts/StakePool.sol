// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The slice of DeskArena this pool needs. It only ever *reads* the arena, so
/// staking can be added to a running arena without redeploying or migrating it.
interface IDeskArena {
    struct DeskView {
        uint256 deskId;
        address owner;
        string name;
        int256 cashE6;
        int256 baseE6;
        int256 pnlE6;
        int256 seasonPnlE6;
        int256 equityE6;
        uint64 createdRound;
        uint32 roundsTraded;
        uint32 wins;
        bool armed;
        bool wantsLive;
        bool retired;
        uint32 bid;
        uint32 ask;
        uint32 hold;
    }

    function ROUND_SECONDS() external view returns (uint256);
    function currentRound() external view returns (uint256);
    function roundEndsAt(uint256 roundId) external pure returns (uint256);
    function deskCount() external view returns (uint256);
    function deskView(uint256 deskId, uint256 roundId) external view returns (DeskView memory);

    /// @dev bidPts is +clamp(bps) and askPts is its negation, so the sign of bidPts is
    /// the arena's own answer to "which direction was right".
    function roundScore(uint256 roundId)
        external
        view
        returns (int64 bidPts, int64 askPts, int64 holdPts, bool settled);
}

/**
 * @title StakePool
 * @notice Parimutuel staking on a desk's next move. Winners are paid by losers.
 *
 * The three things this design turns on:
 *
 * 1. **Nothing is paid out of profit.** The payout is the losing side's stake, which is
 *    already in the contract. No round can ever distribute money it does not hold, so
 *    there is no unrealized-gain problem and no owner capital backing the payouts.
 *
 * 2. **Sybil is strictly negative EV.** Staking every side costs the rake on every
 *    round: pay `3S`, receive `S + (losers − rake)`. Splitting yourself across wallets
 *    only pays the rake more times. The defence is arithmetic, not detection.
 *
 * 3. **"Winner" means right, not popular.** Settlement reads the arena's own price
 *    scoring, so a lone staker on the correct side beats a crowd on the wrong one. It
 *    is a prediction, not a beauty contest.
 *
 * Staking is directional only — Hold stays a free vote — because in a quiet market a
 * "no meaningful move" side wins constantly and the pools go dead.
 */
contract StakePool {
    // ---------------------------------------------------------------- config

    uint8 public constant NONE = 0;
    uint8 public constant BID = 1;
    uint8 public constant ASK = 2;

    /// @dev Stakes close before the boundary so the last staker can't lean on drift
    /// nobody else saw.
    uint256 public constant LOCK_SECONDS = 60;
    uint256 public constant MIN_STAKE = 0.001 ether;
    /// @dev A rake that eats the edge kills the game; parimutuel racing takes 15–20%
    /// and is punishing. This is capped far below that.
    uint16 public constant MAX_TOTAL_RAKE_BPS = 500;

    uint16 public ownerRakeBps = 200;
    uint16 public treasuryRakeBps = 100;

    IDeskArena public immutable arena;
    address public admin;
    address public treasury;

    // ---------------------------------------------------------------- storage

    struct Pool {
        uint128 bid;
        uint128 ask;
        /// @dev Carried in from rounds nobody won. Rolls until somebody is right.
        uint128 rollover;
        /// @dev Losing side + rollover, net of rake, fixed at settlement.
        uint128 payout;
        /// @dev Winning side's total stake, fixed at settlement.
        uint128 winningStake;
        uint8 winner;
        bool settled;
        /// @dev Flat round: nobody was right, but nobody was wrong either — stakes go back.
        bool refunded;
    }

    struct Stake {
        uint128 bid;
        uint128 ask;
        bool claimed;
    }

    mapping(uint256 => mapping(uint256 => Pool)) private _pools; // round => desk => pool
    mapping(uint256 => mapping(uint256 => mapping(address => Stake))) private _stakes;

    mapping(uint256 => uint256) public ownerAccrued; // deskId => claimable rake
    uint256 public treasuryAccrued;

    /// @notice Lifetime realized winnings per staker, for the board.
    mapping(address => int256) public netWinnings;
    mapping(address => uint256) public stakedTotal;
    /// @dev Distinct (round, desk) positions taken, not distinct rounds.
    mapping(address => uint256) public positionsStaked;
    address[] private _stakers;
    mapping(address => bool) private _known;

    // ---------------------------------------------------------------- events

    event Staked(uint256 indexed roundId, uint256 indexed deskId, address indexed staker, uint8 side, uint256 amount);
    event Settled(
        uint256 indexed roundId,
        uint256 indexed deskId,
        uint8 winner,
        uint256 winningStake,
        uint256 payout,
        uint256 ownerRake,
        uint256 treasuryRake
    );
    event RolledOver(uint256 indexed fromRound, uint256 indexed toRound, uint256 indexed deskId, uint256 amount);
    event Claimed(uint256 indexed roundId, uint256 indexed deskId, address indexed staker, uint256 amount, int256 pnl);
    event RakeWithdrawn(address indexed to, uint256 amount, uint256 deskId, bool isTreasury);
    event RakeChanged(uint16 ownerBps, uint16 treasuryBps);

    // ---------------------------------------------------------------- errors

    error BadSide();
    error BelowMinimum();
    error StakingClosed();
    error NoDesk();
    error DeskRetired();
    error NotScoredYet();
    error AlreadySettled();
    error NotSettled();
    error NothingToClaim();
    error AlreadyClaimed();
    error OnlyAdmin();
    error OnlyDeskOwner();
    error RakeTooHigh();
    error TransferFailed();
    error ZeroAddress();

    constructor(address arena_, address treasury_) {
        if (arena_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        arena = IDeskArena(arena_);
        admin = msg.sender;
        treasury = treasury_;
    }

    // ---------------------------------------------------------------- timing

    function currentRound() public view returns (uint256) {
        return arena.currentRound();
    }

    /// @notice The instant staking closes for a round — a minute before it ends.
    function lockAt(uint256 roundId) public view returns (uint256) {
        return arena.roundEndsAt(roundId) - LOCK_SECONDS;
    }

    function stakingOpen(uint256 roundId) public view returns (bool) {
        return roundId == currentRound() && block.timestamp < lockAt(roundId);
    }

    function secondsToLock() external view returns (uint256) {
        uint256 lock = lockAt(currentRound());
        return block.timestamp >= lock ? 0 : lock - block.timestamp;
    }

    // ---------------------------------------------------------------- staking

    function stake(uint256 deskId, uint8 side) external payable {
        if (side != BID && side != ASK) revert BadSide();
        if (msg.value < MIN_STAKE) revert BelowMinimum();
        if (deskId >= arena.deskCount()) revert NoDesk();

        uint256 roundId = currentRound();
        if (!stakingOpen(roundId)) revert StakingClosed();
        if (arena.deskView(deskId, roundId).retired) revert DeskRetired();

        Pool storage p = _pools[roundId][deskId];
        Stake storage s = _stakes[roundId][deskId][msg.sender];

        if (side == BID) {
            p.bid += uint128(msg.value);
            s.bid += uint128(msg.value);
        } else {
            p.ask += uint128(msg.value);
            s.ask += uint128(msg.value);
        }

        if (!_known[msg.sender]) {
            _known[msg.sender] = true;
            _stakers.push(msg.sender);
        }
        stakedTotal[msg.sender] += msg.value;
        if (s.bid + s.ask == msg.value) positionsStaked[msg.sender] += 1;

        emit Staked(roundId, deskId, msg.sender, side, msg.value);
    }

    // ---------------------------------------------------------------- settlement

    /// @notice Which side the arena's own price scoring says was right, or NONE.
    function winningSide(uint256 roundId) public view returns (uint8) {
        (int64 bidPts, , , bool scored) = arena.roundScore(roundId);
        if (!scored) return NONE;
        if (bidPts > 0) return BID;
        if (bidPts < 0) return ASK;
        return NONE; // flat round — nobody was right, the pot rolls
    }

    /// @notice Permissionless. Anyone can settle any scored round for any desk.
    function settle(uint256 roundId, uint256 deskId) public {
        Pool storage p = _pools[roundId][deskId];
        if (p.settled) revert AlreadySettled();
        (, , , bool scored) = arena.roundScore(roundId);
        if (!scored) revert NotScoredYet();

        uint8 winner = winningSide(roundId);
        uint256 staked = uint256(p.bid) + uint256(p.ask);
        uint256 pot = staked + uint256(p.rollover);

        p.settled = true;
        p.winner = winner;

        // Flat round — the mid did not move, so neither side called it wrong. On a book
        // this quiet that happens often, and wiping both sides for it would be punitive
        // rather than a result. Stakes go back untaken; any rollover keeps riding.
        if (winner == NONE) {
            p.refunded = staked > 0;
            p.payout = 0;
            p.winningStake = 0;
            if (p.rollover > 0) {
                uint256 target = _rollTarget(roundId);
                uint128 carried = p.rollover;
                p.rollover = 0;
                _pools[target][deskId].rollover += carried;
                emit RolledOver(roundId, target, deskId, carried);
            }
            emit Settled(roundId, deskId, winner, 0, 0, 0, 0);
            return;
        }

        uint256 winStake = winner == BID ? p.bid : p.ask;

        // A side was right and nobody backed it. The whole pot rolls — this is what
        // builds a jackpot, and it is the one case where being absent costs you.
        if (winStake == 0) {
            p.payout = 0;
            p.winningStake = 0;
            if (pot > 0) {
                uint256 target = _rollTarget(roundId);
                p.rollover = 0;
                _pools[target][deskId].rollover += uint128(pot);
                emit RolledOver(roundId, target, deskId, pot);
            }
            emit Settled(roundId, deskId, winner, 0, 0, 0, 0);
            return;
        }

        uint256 losing = pot - winStake;
        uint256 ownerRake = (losing * ownerRakeBps) / 10_000;
        uint256 treasuryRake = (losing * treasuryRakeBps) / 10_000;

        p.winningStake = uint128(winStake);
        p.payout = uint128(losing - ownerRake - treasuryRake);

        if (ownerRake > 0) ownerAccrued[deskId] += ownerRake;
        if (treasuryRake > 0) treasuryAccrued += treasuryRake;

        emit Settled(roundId, deskId, winner, winStake, p.payout, ownerRake, treasuryRake);
    }

    /// @dev Roll into a round that cannot already be settled, so a pot is never stranded.
    function _rollTarget(uint256 roundId) internal view returns (uint256) {
        uint256 next = roundId + 1;
        uint256 now_ = currentRound();
        return next > now_ ? next : now_;
    }

    function settleMany(uint256 roundId, uint256[] calldata deskIds) external {
        for (uint256 i; i < deskIds.length; ++i) {
            Pool storage p = _pools[roundId][deskIds[i]];
            if (p.settled) continue;
            settle(roundId, deskIds[i]);
        }
    }

    // ---------------------------------------------------------------- claiming

    function claimable(uint256 roundId, uint256 deskId, address staker) public view returns (uint256) {
        Pool storage p = _pools[roundId][deskId];
        Stake storage s = _stakes[roundId][deskId][staker];
        if (!p.settled || s.claimed) return 0;

        // Flat round: take your stake back.
        if (p.refunded) return uint256(s.bid) + uint256(s.ask);
        // A side was right and nobody backed it — the pot has rolled onward.
        if (p.winningStake == 0) return 0;

        uint256 mine = p.winner == BID ? s.bid : s.ask;
        if (mine == 0) return 0;
        return mine + (uint256(p.payout) * mine) / uint256(p.winningStake);
    }

    function claim(uint256 roundId, uint256 deskId) public returns (uint256) {
        Pool storage p = _pools[roundId][deskId];
        if (!p.settled) revert NotSettled();
        Stake storage s = _stakes[roundId][deskId][msg.sender];
        if (s.claimed) revert AlreadyClaimed();

        uint256 amount = claimable(roundId, deskId, msg.sender);
        uint256 staked = uint256(s.bid) + uint256(s.ask);
        if (amount == 0 && staked == 0) revert NothingToClaim();

        s.claimed = true;
        netWinnings[msg.sender] += int256(amount) - int256(staked);

        if (amount > 0) {
            (bool ok, ) = msg.sender.call{value: amount}("");
            if (!ok) revert TransferFailed();
        }
        emit Claimed(roundId, deskId, msg.sender, amount, int256(amount) - int256(staked));
        return amount;
    }

    function claimMany(uint256[] calldata roundIds, uint256[] calldata deskIds) external returns (uint256 total) {
        for (uint256 i; i < roundIds.length; ++i) {
            Pool storage p = _pools[roundIds[i]][deskIds[i]];
            Stake storage s = _stakes[roundIds[i]][deskIds[i]][msg.sender];
            if (!p.settled || s.claimed) continue;
            if (uint256(s.bid) + uint256(s.ask) == 0) continue;
            total += claim(roundIds[i], deskIds[i]);
        }
    }

    // ---------------------------------------------------------------- rake

    function withdrawOwnerRake(uint256 deskId) external returns (uint256 amount) {
        address owner = arena.deskView(deskId, currentRound()).owner;
        if (msg.sender != owner) revert OnlyDeskOwner();
        amount = ownerAccrued[deskId];
        if (amount == 0) revert NothingToClaim();
        ownerAccrued[deskId] = 0;
        (bool ok, ) = owner.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit RakeWithdrawn(owner, amount, deskId, false);
    }

    function withdrawTreasuryRake() external returns (uint256 amount) {
        amount = treasuryAccrued;
        if (amount == 0) revert NothingToClaim();
        treasuryAccrued = 0;
        (bool ok, ) = treasury.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit RakeWithdrawn(treasury, amount, 0, true);
    }

    function setRake(uint16 ownerBps, uint16 treasuryBps) external {
        if (msg.sender != admin) revert OnlyAdmin();
        if (uint256(ownerBps) + uint256(treasuryBps) > MAX_TOTAL_RAKE_BPS) revert RakeTooHigh();
        ownerRakeBps = ownerBps;
        treasuryRakeBps = treasuryBps;
        emit RakeChanged(ownerBps, treasuryBps);
    }

    function setTreasury(address treasury_) external {
        if (msg.sender != admin) revert OnlyAdmin();
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
    }

    function setAdmin(address admin_) external {
        if (msg.sender != admin) revert OnlyAdmin();
        if (admin_ == address(0)) revert ZeroAddress();
        admin = admin_;
    }

    /// @notice Seed a desk's pool so early rounds aren't dust. Unrecoverable by design.
    function seed(uint256 deskId) external payable {
        uint256 r = currentRound();
        _pools[r][deskId].rollover += uint128(msg.value);
        emit RolledOver(r, r, deskId, msg.value);
    }

    // ---------------------------------------------------------------- views

    struct PoolView {
        uint256 roundId;
        uint256 deskId;
        uint256 bid;
        uint256 ask;
        uint256 rollover;
        uint256 pot;
        uint256 payout;
        uint256 winningStake;
        uint8 winner;
        bool settled;
        bool refunded;
        bool open;
        uint256 lockAt;
        /// @dev What one wei on each side returns if that side wins, scaled 1e18.
        uint256 bidOddsE18;
        uint256 askOddsE18;
    }

    function poolView(uint256 roundId, uint256 deskId) public view returns (PoolView memory v) {
        Pool storage p = _pools[roundId][deskId];
        uint256 pot = uint256(p.bid) + uint256(p.ask) + uint256(p.rollover);
        uint256 net = 10_000 - uint256(ownerRakeBps) - uint256(treasuryRakeBps);
        v = PoolView({
            roundId: roundId,
            deskId: deskId,
            bid: p.bid,
            ask: p.ask,
            rollover: p.rollover,
            pot: pot,
            payout: p.payout,
            winningStake: p.winningStake,
            winner: p.winner,
            settled: p.settled,
            refunded: p.refunded,
            open: stakingOpen(roundId),
            lockAt: lockAt(roundId),
            bidOddsE18: p.bid == 0 ? 0 : 1e18 + (((pot - p.bid) * net * 1e18) / 10_000) / p.bid,
            askOddsE18: p.ask == 0 ? 0 : 1e18 + (((pot - p.ask) * net * 1e18) / 10_000) / p.ask
        });
    }

    function poolsForRound(uint256 roundId) external view returns (PoolView[] memory out) {
        uint256 n = arena.deskCount();
        out = new PoolView[](n);
        for (uint256 i; i < n; ++i) out[i] = poolView(roundId, i);
    }

    function stakeOf(uint256 roundId, uint256 deskId, address staker)
        external
        view
        returns (uint256 bid, uint256 ask, bool claimed, uint256 payable_)
    {
        Stake storage s = _stakes[roundId][deskId][staker];
        return (s.bid, s.ask, s.claimed, claimable(roundId, deskId, staker));
    }

    struct StakerView {
        address wallet;
        int256 netWinnings;
        uint256 stakedTotal;
        uint256 positionsStaked;
    }

    function stakerCount() external view returns (uint256) {
        return _stakers.length;
    }

    function stakerBoard(uint256 offset, uint256 limit) external view returns (StakerView[] memory out) {
        uint256 n = _stakers.length;
        if (offset >= n) return new StakerView[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        out = new StakerView[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            address w = _stakers[i];
            out[i - offset] = StakerView({
                wallet: w,
                netWinnings: netWinnings[w],
                stakedTotal: stakedTotal[w],
                positionsStaked: positionsStaked[w]
            });
        }
    }

    struct Config {
        uint256 lockSeconds;
        uint256 minStake;
        uint16 ownerRakeBps;
        uint16 treasuryRakeBps;
        uint256 treasuryAccrued;
        address arena;
    }

    function config() external view returns (Config memory) {
        return
            Config({
                lockSeconds: LOCK_SECONDS,
                minStake: MIN_STAKE,
                ownerRakeBps: ownerRakeBps,
                treasuryRakeBps: treasuryRakeBps,
                treasuryAccrued: treasuryAccrued,
                arena: address(arena)
            });
    }
}
