// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Minimal view surface of a DreamDEX SpotPool. The arena reads the live book
/// itself so the round price is never supplied by a keeper.
interface ISpotPool {
    struct Level {
        uint256 price;
        uint256 quantity;
    }

    function getBookLevels(bool isBid, uint64 numLevels) external view returns (Level[] memory);
}

/// @notice DreamDEX OperatorPermissionsRegistry — used to prove a desk really granted
/// the arena's session key, rather than trusting an owner-set flag.
interface IOperatorRegistry {
    function isGloballyApproved(address owner, address operator, bytes4 selector)
        external
        view
        returns (bool);
}

/// @notice Badges are soulbound and read their score straight back from the arena,
/// so a score change never costs a token write.
interface IArenaBadge {
    function mint(address to, string calldata handle) external returns (uint256);
    function tokenOf(address wallet) external view returns (uint256);
}

/**
 * @title DeskArena
 * @notice Every desk in the arena trades the same synchronized five-minute round.
 *
 * Round R's voting window is [R*300, (R+1)*300). At the boundary the arena snaps the
 * mid from the SpotPool book, executes each desk's majority move at that mid, and
 * settles the ballots cast in round R-2 against the move they were actually exposed
 * to (mid at R-1 -> mid at R).
 *
 * Desks are ranked on a paper book that starts identical for everyone, so profit is
 * directly comparable. A desk whose owner also granted the session key is `armed`,
 * and the keeper mirrors its winning move as a real order on DreamDEX.
 */
contract DeskArena {
    // ---------------------------------------------------------------- constants

    uint256 public constant ROUND_SECONDS = 300;
    uint256 public constant SEASON_ROUNDS = 288; // 24h of five-minute rounds

    /// @dev Paper book units: USDso cash and SOMI position are both 1e6-scaled.
    int256 public constant START_CASH_E6 = 1_000_000_000; // 1,000.000000 USDso
    int256 public constant LOT_E6 = 1_000_000_000; //     1,000.000000 SOMI per move
    int256 public constant MAX_POSITION_LOTS = 5;

    /// @dev tick() loops every desk, so the desk count is capped to keep the
    /// Reactivity callback inside its gas limit.
    uint256 public constant MAX_DESKS = 256;

    uint256 public constant CREATE_BOND = 0.05 ether;

    /// @dev Points are bps of the realized move, clamped so one violent candle cannot
    /// decide a season.
    int256 public constant MAX_POINTS = 50;
    int256 public constant HOLD_POINTS = 10;

    /// @dev Ballots settled per implicit settle pass, so vote() stays a bounded write.
    uint256 public constant AUTO_SETTLE = 12;

    bytes4 public constant PLACE_ORDER_FOR = 0x80054449;

    uint8 public constant NONE = 0;
    uint8 public constant BID = 1;
    uint8 public constant ASK = 2;
    uint8 public constant HOLD = 3;

    // ---------------------------------------------------------------- immutables

    ISpotPool public immutable pool;
    IOperatorRegistry public immutable registry;
    /// @notice Hot key that mirrors armed desks onto the real book.
    address public immutable sessionKey;
    uint256 public immutable genesisRound;

    // ---------------------------------------------------------------- storage

    struct Desk {
        address owner;
        string name;
        int256 cashE6;
        int256 baseE6;
        int256 lastPnlE6;
        uint64 createdRound;
        uint32 roundsTraded;
        uint32 wins;
        uint256 bond;
        bool wantsLive;
        bool retired;
    }

    struct Tally {
        uint32 bid;
        uint32 ask;
        uint32 hold;
    }

    struct RoundScore {
        int64 bidPts;
        int64 askPts;
        int64 holdPts;
        bool settled;
    }

    struct Ballot {
        uint64 roundId;
        uint32 deskId;
        uint8 choice;
    }

    struct Contributor {
        int256 points; // lifetime
        uint32 ballotsCast;
        uint32 roundsScored;
        uint32 streak;
        uint32 bestStreak;
        uint64 pendingRound; // round currently accumulating inside settle
        int256 pendingPts;
        uint64 lastVotedRound;
        bool joined;
    }

    Desk[] private _desks;
    mapping(address => uint256[]) private _desksOf;

    /// @notice Mid price (1e18) at the START of a round == the close of the round before.
    mapping(uint256 => uint256) public roundMid;
    /// @notice Highest round whose opening mid has been recorded.
    uint256 public lastTickedRound;

    mapping(uint256 => mapping(uint256 => Tally)) private _tally; // round => desk => tally
    mapping(uint256 => mapping(uint256 => mapping(address => uint8))) private _ballot;
    mapping(uint256 => RoundScore) public roundScore;

    mapping(address => Ballot[]) private _ballots;
    mapping(address => uint256) public settleCursor;
    mapping(address => Contributor) private _contributors;
    address[] private _voters;

    /// @notice Lifetime totals captured when a wallet/desk first acts in a season, so
    /// season standings are a pure subtraction and a season roll costs no gas.
    mapping(uint256 => mapping(address => int256)) private _voterSeasonBase;
    mapping(uint256 => mapping(address => bool)) private _voterSeasonSeen;
    mapping(uint256 => mapping(uint256 => int256)) private _deskSeasonBase;
    mapping(uint256 => mapping(uint256 => bool)) private _deskSeasonSeen;

    IArenaBadge public deskBadge;
    IArenaBadge public contributorBadge;
    address public deployer;
    bool public badgesSet;

    // ---------------------------------------------------------------- events

    event DeskCreated(uint256 indexed deskId, address indexed owner, string name, uint256 bond);
    event DeskRetired(uint256 indexed deskId, address indexed owner, uint256 bondReturned);
    event DeskLiveChanged(uint256 indexed deskId, bool wantsLive);
    event Voted(uint256 indexed roundId, uint256 indexed deskId, address indexed voter, uint8 choice);
    event Ticked(uint256 indexed roundId, uint256 mid);
    /// @dev The keeper mirrors this onto the real DreamDEX book for armed desks.
    event DeskExecuted(
        uint256 indexed roundId,
        uint256 indexed deskId,
        uint8 choice,
        uint256 mid,
        int256 cashE6,
        int256 baseE6,
        bool armed
    );
    event RoundScored(uint256 indexed roundId, int256 bps, int64 bidPts, int64 askPts, int64 holdPts);
    event BallotSettled(address indexed voter, uint256 indexed roundId, uint256 indexed deskId, int256 points);

    // ---------------------------------------------------------------- errors

    error ArenaFull();
    error BadBond();
    error BadName();
    error NoDesk();
    error NotOwner();
    error Retired();
    error BadChoice();
    error AlreadyVoted();
    error BadgesAlreadySet();
    error NotDeployer();
    error RefundFailed();

    constructor(address pool_, address registry_, address sessionKey_) {
        pool = ISpotPool(pool_);
        registry = IOperatorRegistry(registry_);
        sessionKey = sessionKey_;
        deployer = msg.sender;
        genesisRound = block.timestamp / ROUND_SECONDS;
        lastTickedRound = genesisRound;
        roundMid[genesisRound] = _readMid();
    }

    /// @notice One-shot wiring; the badges need the arena address in their constructor.
    function setBadges(address desk_, address contributor_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (badgesSet) revert BadgesAlreadySet();
        deskBadge = IArenaBadge(desk_);
        contributorBadge = IArenaBadge(contributor_);
        badgesSet = true;
    }

    // ---------------------------------------------------------------- clock

    function currentRound() public view returns (uint256) {
        return block.timestamp / ROUND_SECONDS;
    }

    function roundEndsAt(uint256 roundId) public pure returns (uint256) {
        return (roundId + 1) * ROUND_SECONDS;
    }

    function secondsLeft() external view returns (uint256) {
        return roundEndsAt(currentRound()) - block.timestamp;
    }

    function seasonOf(uint256 roundId) public view returns (uint256) {
        if (roundId < genesisRound) return 0;
        return (roundId - genesisRound) / SEASON_ROUNDS;
    }

    function currentSeason() public view returns (uint256) {
        return seasonOf(currentRound());
    }

    // ---------------------------------------------------------------- desks

    function deskCount() external view returns (uint256) {
        return _desks.length;
    }

    function createDesk(string calldata name) external payable returns (uint256 deskId) {
        if (_desks.length >= MAX_DESKS) revert ArenaFull();
        if (msg.value != CREATE_BOND) revert BadBond();
        bytes memory raw = bytes(name);
        if (raw.length < 3 || raw.length > 24) revert BadName();

        deskId = _desks.length;
        _desksOf[msg.sender].push(deskId);
        _desks.push(
            Desk({
                owner: msg.sender,
                name: name,
                cashE6: START_CASH_E6,
                baseE6: 0,
                lastPnlE6: 0,
                createdRound: uint64(currentRound()),
                roundsTraded: 0,
                wins: 0,
                bond: msg.value,
                wantsLive: false,
                retired: false
            })
        );

        if (address(deskBadge) != address(0) && deskBadge.tokenOf(msg.sender) == 0) {
            deskBadge.mint(msg.sender, name);
        }
        emit DeskCreated(deskId, msg.sender, name, msg.value);
    }

    function setWantsLive(uint256 deskId, bool wantsLive) external {
        Desk storage d = _deskAt(deskId);
        if (d.owner != msg.sender) revert NotOwner();
        if (d.retired) revert Retired();
        d.wantsLive = wantsLive;
        emit DeskLiveChanged(deskId, wantsLive);
    }

    /// @notice Retires the desk and returns the bond. PnL stays on the board, frozen.
    function retireDesk(uint256 deskId) external {
        Desk storage d = _deskAt(deskId);
        if (d.owner != msg.sender) revert NotOwner();
        if (d.retired) revert Retired();
        d.retired = true;
        uint256 bond = d.bond;
        d.bond = 0;
        if (bond > 0) {
            (bool ok, ) = msg.sender.call{value: bond}("");
            if (!ok) revert RefundFailed();
        }
        emit DeskRetired(deskId, msg.sender, bond);
    }

    /// @notice True only when the owner asked to go live AND the on-chain grant exists.
    function deskIsArmed(uint256 deskId) public view returns (bool) {
        Desk storage d = _deskAt(deskId);
        if (!d.wantsLive || d.retired) return false;
        return _isApproved(d.owner);
    }

    function _isApproved(address owner) internal view returns (bool) {
        if (sessionKey == address(0)) return false;
        try registry.isGloballyApproved(owner, sessionKey, PLACE_ORDER_FOR) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    // ---------------------------------------------------------------- voting

    function vote(uint256 deskId, uint8 choice) external {
        if (choice != BID && choice != ASK && choice != HOLD) revert BadChoice();
        Desk storage d = _deskAt(deskId);
        if (d.retired) revert Retired();

        uint256 r = currentRound();
        if (_ballot[r][deskId][msg.sender] != NONE) revert AlreadyVoted();

        // Keep the clock honest even if no callback landed.
        tick();

        _ballot[r][deskId][msg.sender] = choice;
        Tally storage t = _tally[r][deskId];
        if (choice == BID) t.bid += 1;
        else if (choice == ASK) t.ask += 1;
        else t.hold += 1;

        Contributor storage c = _contributors[msg.sender];
        if (!c.joined) {
            c.joined = true;
            _voters.push(msg.sender);
        }
        c.ballotsCast += 1;
        c.lastVotedRound = uint64(r);
        _ballots[msg.sender].push(Ballot({roundId: uint64(r), deskId: uint32(deskId), choice: choice}));

        _touchVoterSeason(msg.sender);
        _settle(msg.sender, AUTO_SETTLE);

        if (address(contributorBadge) != address(0) && contributorBadge.tokenOf(msg.sender) == 0) {
            contributorBadge.mint(msg.sender, _shortHandle(msg.sender));
        }

        emit Voted(r, deskId, msg.sender, choice);
    }

    function myVote(uint256 roundId, uint256 deskId, address voter) external view returns (uint8) {
        return _ballot[roundId][deskId][voter];
    }

    function tallyOf(uint256 roundId, uint256 deskId) external view returns (uint32, uint32, uint32) {
        Tally storage t = _tally[roundId][deskId];
        return (t.bid, t.ask, t.hold);
    }

    function winnerOf(uint256 roundId, uint256 deskId) public view returns (uint8) {
        return _winner(_tally[roundId][deskId]);
    }

    function _winner(Tally storage t) internal view returns (uint8) {
        if (t.bid == 0 && t.ask == 0 && t.hold == 0) return HOLD;
        if (t.bid > t.ask && t.bid > t.hold) return BID;
        if (t.ask > t.bid && t.ask > t.hold) return ASK;
        return HOLD; // ties resolve to hold — the crowd has to actually agree
    }

    // ---------------------------------------------------------------- tick

    /// @notice Advances the arena to the current round. Permissionless and idempotent:
    /// the Reactivity callback drives it, and any vote or page load can heal a miss.
    function tick() public {
        uint256 r = currentRound();
        if (r <= lastTickedRound) return;
        uint256 mid = _readMid();
        if (mid == 0) return; // empty book — nothing trustworthy to price against

        roundMid[r] = mid;
        uint256 closing = r - 1; // the round whose voting window just ended

        _executeDesks(closing, mid);
        _scoreRound(r);

        lastTickedRound = r;
        emit Ticked(r, mid);
    }

    function _executeDesks(uint256 closing, uint256 mid) internal {
        uint256 n = _desks.length;
        for (uint256 i; i < n; ++i) {
            Desk storage d = _desks[i];
            if (d.retired || d.createdRound > closing) continue;

            uint8 choice = _winner(_tally[closing][i]);
            int256 lots = d.baseE6 / LOT_E6;

            if (choice == BID && lots < MAX_POSITION_LOTS) {
                d.baseE6 += LOT_E6;
                d.cashE6 -= (LOT_E6 * int256(mid)) / 1e18;
                d.roundsTraded += 1;
            } else if (choice == ASK && lots > -MAX_POSITION_LOTS) {
                d.baseE6 -= LOT_E6;
                d.cashE6 += (LOT_E6 * int256(mid)) / 1e18;
                d.roundsTraded += 1;
            } else {
                choice = HOLD;
            }

            _touchDeskSeason(i); // snapshot the season base before this round lands
            int256 pnl = d.cashE6 + (d.baseE6 * int256(mid)) / 1e18 - START_CASH_E6;
            if (pnl > d.lastPnlE6) d.wins += 1;
            d.lastPnlE6 = pnl;

            emit DeskExecuted(closing, i, choice, mid, d.cashE6, d.baseE6, deskIsArmed(i));
        }
    }

    /// @dev Scores the ballots cast in round r-2: they were executed at the mid that
    /// opened r-1 and were exposed until the mid that opens r.
    function _scoreRound(uint256 r) internal {
        if (r < 2) return;
        uint256 scored = r - 2;
        if (roundScore[scored].settled) return;

        uint256 mid0 = roundMid[r - 1];
        uint256 mid1 = roundMid[r];
        if (mid0 == 0 || mid1 == 0) return;

        int256 bps = ((int256(mid1) - int256(mid0)) * 10_000) / int256(mid0);
        int256 clamped = bps > MAX_POINTS ? MAX_POINTS : (bps < -MAX_POINTS ? -MAX_POINTS : bps);
        int256 absBps = bps < 0 ? -bps : bps;
        int256 hold = HOLD_POINTS - absBps;
        if (hold < 0) hold = 0;

        roundScore[scored] = RoundScore({
            bidPts: int64(clamped),
            askPts: int64(-clamped),
            holdPts: int64(hold),
            settled: true
        });
        emit RoundScored(scored, bps, int64(clamped), int64(-clamped), int64(hold));
    }

    function _readMid() internal view returns (uint256) {
        uint256 bid;
        uint256 ask;
        try pool.getBookLevels(true, 1) returns (ISpotPool.Level[] memory bids) {
            if (bids.length > 0) bid = bids[0].price;
        } catch {}
        try pool.getBookLevels(false, 1) returns (ISpotPool.Level[] memory asks) {
            if (asks.length > 0) ask = asks[0].price;
        } catch {}
        if (bid > 0 && ask > 0) return (bid + ask) / 2;
        if (bid > 0) return bid;
        return ask;
    }

    // ---------------------------------------------------------------- settlement

    /// @notice Walks a voter's unsettled ballots. Permissionless — anyone can settle
    /// anyone, and a voter's own next vote settles their backlog.
    function settle(address voter, uint256 maxBallots) public {
        _settle(voter, maxBallots);
    }

    function _settle(address voter, uint256 maxBallots) internal {
        Ballot[] storage list = _ballots[voter];
        Contributor storage c = _contributors[voter];
        uint256 i = settleCursor[voter];
        uint256 processed;

        uint256 nowRound = currentRound();

        while (i < list.length && processed < maxBallots) {
            Ballot storage b = list[i];
            RoundScore storage rs = roundScore[b.roundId];
            // A round is only ever scored at tick(round + 2). If that moment has passed
            // without a score, no future tick will supply one — walk past it at zero so
            // one missed callback cannot wedge a voter's cursor forever.
            if (!rs.settled && nowRound <= b.roundId + 2) break;

            if (c.pendingRound != b.roundId) {
                _flushRound(c);
                c.pendingRound = b.roundId;
                c.pendingPts = 0;
            }

            int256 pts = !rs.settled
                ? int256(0)
                : (b.choice == BID
                    ? int256(rs.bidPts)
                    : (b.choice == ASK ? int256(rs.askPts) : int256(rs.holdPts)));
            c.points += pts;
            c.pendingPts += pts;

            emit BallotSettled(voter, b.roundId, b.deskId, pts);
            unchecked {
                ++i;
                ++processed;
            }
        }

        settleCursor[voter] = i;
        // Every ballot for a scored round already exists (scoring lags voting by two
        // rounds), so reaching the end of the list means the round is complete.
        if (i == list.length) _flushRound(c);
    }

    function _flushRound(Contributor storage c) internal {
        if (c.pendingRound == 0) return;
        c.roundsScored += 1;
        if (c.pendingPts > 0) {
            c.streak += 1;
            if (c.streak > c.bestStreak) c.bestStreak = c.streak;
        } else if (c.pendingPts < 0) {
            c.streak = 0;
        }
        c.pendingRound = 0;
        c.pendingPts = 0;
    }

    function pendingBallots(address voter) external view returns (uint256) {
        return _ballots[voter].length - settleCursor[voter];
    }

    // ---------------------------------------------------------------- seasons

    function _touchVoterSeason(address voter) internal {
        uint256 s = currentSeason();
        if (!_voterSeasonSeen[s][voter]) {
            _voterSeasonSeen[s][voter] = true;
            _voterSeasonBase[s][voter] = _contributors[voter].points;
        }
    }

    function _touchDeskSeason(uint256 deskId) internal {
        uint256 s = currentSeason();
        if (!_deskSeasonSeen[s][deskId]) {
            _deskSeasonSeen[s][deskId] = true;
            _deskSeasonBase[s][deskId] = _desks[deskId].lastPnlE6;
        }
    }

    function seasonPointsOf(address voter) public view returns (int256) {
        uint256 s = currentSeason();
        int256 base = _voterSeasonSeen[s][voter] ? _voterSeasonBase[s][voter] : _contributors[voter].points;
        return _contributors[voter].points - base;
    }

    function seasonPnlOf(uint256 deskId) public view returns (int256) {
        uint256 s = currentSeason();
        int256 pnl = _desks[deskId].lastPnlE6;
        int256 base = _deskSeasonSeen[s][deskId] ? _deskSeasonBase[s][deskId] : pnl;
        return pnl - base;
    }

    // ---------------------------------------------------------------- views

    function _deskAt(uint256 deskId) internal view returns (Desk storage) {
        if (deskId >= _desks.length) revert NoDesk();
        return _desks[deskId];
    }

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

    /// @notice Live mid straight off the book — what every desk is marked against.
    function liveMid() public view returns (uint256) {
        uint256 mid = _readMid();
        return mid == 0 ? roundMid[lastTickedRound] : mid;
    }

    function deskView(uint256 deskId, uint256 roundId) public view returns (DeskView memory) {
        return _deskView(deskId, roundId, liveMid());
    }

    function _deskView(uint256 deskId, uint256 roundId, uint256 mid)
        internal
        view
        returns (DeskView memory v)
    {
        Desk storage d = _deskAt(deskId);
        Tally storage t = _tally[roundId][deskId];
        v = DeskView({
            deskId: deskId,
            owner: d.owner,
            name: d.name,
            cashE6: d.cashE6,
            baseE6: d.baseE6,
            pnlE6: d.lastPnlE6,
            seasonPnlE6: seasonPnlOf(deskId),
            equityE6: d.cashE6 + (d.baseE6 * int256(mid)) / 1e18,
            createdRound: d.createdRound,
            roundsTraded: d.roundsTraded,
            wins: d.wins,
            armed: deskIsArmed(deskId),
            wantsLive: d.wantsLive,
            retired: d.retired,
            bid: t.bid,
            ask: t.ask,
            hold: t.hold
        });
    }

    function deskBoard(uint256 roundId) external view returns (DeskView[] memory board) {
        uint256 n = _desks.length;
        uint256 mid = liveMid();
        board = new DeskView[](n);
        for (uint256 i; i < n; ++i) board[i] = _deskView(i, roundId, mid);
    }

    struct ContributorView {
        address wallet;
        int256 points;
        int256 seasonPoints;
        uint32 ballotsCast;
        uint32 roundsScored;
        uint32 streak;
        uint32 bestStreak;
        uint64 lastVotedRound;
        uint256 pending;
    }

    function contributorView(address wallet) public view returns (ContributorView memory) {
        Contributor storage c = _contributors[wallet];
        return
            ContributorView({
                wallet: wallet,
                points: c.points,
                seasonPoints: seasonPointsOf(wallet),
                ballotsCast: c.ballotsCast,
                roundsScored: c.roundsScored,
                streak: c.streak,
                bestStreak: c.bestStreak,
                lastVotedRound: c.lastVotedRound,
                pending: _ballots[wallet].length - settleCursor[wallet]
            });
    }

    function voterCount() external view returns (uint256) {
        return _voters.length;
    }

    function contributorBoard(uint256 offset, uint256 limit)
        external
        view
        returns (ContributorView[] memory board)
    {
        uint256 n = _voters.length;
        if (offset >= n) return new ContributorView[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        board = new ContributorView[](end - offset);
        for (uint256 i = offset; i < end; ++i) board[i - offset] = contributorView(_voters[i]);
    }

    struct ArenaState {
        uint256 roundId;
        uint256 endsAt;
        uint256 lastTickedRound;
        uint256 mid;
        uint256 season;
        uint256 seasonRound;
        uint256 deskCount;
        uint256 voterCount;
        uint256 createBond;
        address sessionKey;
    }

    function arenaState() external view returns (ArenaState memory) {
        uint256 r = currentRound();
        return
            ArenaState({
                roundId: r,
                endsAt: roundEndsAt(r),
                lastTickedRound: lastTickedRound,
                mid: liveMid(),
                season: currentSeason(),
                seasonRound: (r - genesisRound) % SEASON_ROUNDS,
                deskCount: _desks.length,
                voterCount: _voters.length,
                createBond: CREATE_BOND,
                sessionKey: sessionKey
            });
    }

    /// @notice Badge score hooks — the SBTs read through instead of storing a copy.
    function deskScoreOf(address owner) external view returns (int256 best) {
        uint256[] storage mine = _desksOf[owner];
        for (uint256 i; i < mine.length; ++i) {
            int256 pnl = _desks[mine[i]].lastPnlE6;
            if (i == 0 || pnl > best) best = pnl;
        }
    }

    function desksOf(address owner) external view returns (uint256[] memory) {
        return _desksOf[owner];
    }

    function contributorScoreOf(address voter) external view returns (int256) {
        return _contributors[voter].points;
    }

    function _shortHandle(address a) internal pure returns (string memory) {
        bytes16 hexd = "0123456789abcdef";
        bytes memory out = new bytes(10);
        out[0] = "0";
        out[1] = "x";
        uint160 v = uint160(a);
        for (uint256 i; i < 4; ++i) {
            uint8 b = uint8(v >> (152 - i * 8));
            out[2 + i * 2] = hexd[b >> 4];
            out[3 + i * 2] = hexd[b & 0x0f];
        }
        return string(out);
    }

    receive() external payable {}
}
