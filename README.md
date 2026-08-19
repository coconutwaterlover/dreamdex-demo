# DreamDesk Arena

A public trading arena on Somnia. **Anyone opens a desk. The crowd votes its next move
every five minutes. The desk with the best profit wins the season.**

Two soulbound leaderboards keep score: one for the desks, one for the people calling
them. Voting is free, so the leaderboard is the sport — and the desks that want it can
have the crowd's winning move posted as a *real* order on dreamDEX.

**Live:** [dreamdex-arena.vercel.app](https://dreamdex-arena.vercel.app) · Somnia Shannon testnet

## What it costs to play

Nothing meaningful. This is the part people guess wrong, so plainly:

| | Cost |
| --- | --- |
| **Vote on any desk** | Free. You pay gas, nothing else. |
| **Open your own desk** | A **0.05 STT** bond, returned in full by `retireDesk`. |
| **The 1,000 USDso book** | **Nobody funds it.** It is a paper book — a number in the contract, identical for every desk so profits are comparable. |
| **Real orders** | Optional. Only if you grant a session key, and then it is *your* funds in *your* wallet, revocable at any time. |

Shannon is a testnet, so the STT for the bond and the gas comes free from the
[faucet](https://testnet.somnia.network/). Opening a desk is two clicks and one
transaction: pick a name, sign, and the same transaction mints your soulbound desk
badge.

The 1,000 USDso is deliberately *not* real money. Making desks put up capital would rank
bankrolls instead of calls, and would gate the thing Emre asked for — many people opening
desks and transacting. The bond gates spam; the paper book keeps the leaderboard fair.

---

## Three things that are not normal

Most "on-chain" apps quietly keep the interesting parts on a server. This one doesn't,
and these are the three places you can check that.

### The clock has no cron and no server

Somnia Reactivity only requires the **subscription owner** to hold the 32 STT sybil
bond — and the owner can be a *contract*. So `ArenaClock` funds itself and re-arms from
inside its own callback. Every five minutes, forever, with nothing running anywhere.

It has not missed a beat since deploy, including through a container restart on the
machine that deployed it. It burns roughly **0.08 STT/hour**, so its 45 STT funds it for
weeks. `fireCount` on the clock is the receipt.

→ [details](#2-reactivity--a-clock-that-keeps-itself-alive)

### The arena reads its own price

`getBookLevels` is called from Solidity, in the same transaction that settles the round.
No oracle, no signed feed, no keeper-supplied mid. Because the order book *is* a smart
contract, the price that ranks every desk is exactly as verifiable as the votes that
produced it.

→ [details](#3-an-on-chain-clob-you-can-read-from-a-contract)

### The badges never write a score

`scoreOf` reads through to the arena at call time, so a round that moves every
leaderboard costs **zero** token writes. The only write either collection ever does is
the mint — and that happens inside your own `createDesk` / `vote` transaction, not in a
keeper's.

→ [details](#contracts)

---

## Live deployment

Somnia Shannon (chain ID `50312`), explorer
[shannon-explorer.somnia.network](https://shannon-explorer.somnia.network).

| | Address |
| --- | --- |
| `DeskArena` | [`0x86913db4d9a49848e6480d09b0ece612ff2b431e`](https://shannon-explorer.somnia.network/address/0x86913db4d9a49848e6480d09b0ece612ff2b431e) |
| `ArenaClock` | [`0x5d299bd6f63546b14e3b4367974ad94819e1a643`](https://shannon-explorer.somnia.network/address/0x5d299bd6f63546b14e3b4367974ad94819e1a643) |
| `ArenaBadge` — desk owners | [`0x765e2b5bf6548ac514f31130ca07babd4dbb56b8`](https://shannon-explorer.somnia.network/address/0x765e2b5bf6548ac514f31130ca07babd4dbb56b8) |
| `ArenaBadge` — contributors | [`0xee84b5fc635d590e5a9b0ce7396d4eb8bb8d0966`](https://shannon-explorer.somnia.network/address/0xee84b5fc635d590e5a9b0ce7396d4eb8bb8d0966) |

Depends on two contracts it does not own:

| | Address |
| --- | --- |
| SOMI:USDso SpotPool | [`0x259fD6559214dd5aD3752322426eA9F9fABEFff4`](https://shannon-explorer.somnia.network/address/0x259fD6559214dd5aD3752322426eA9F9fABEFff4) |
| `OperatorPermissionsRegistry` | [`0x15C7e8CE38F021c5b45d098AaD788f63090bF20A`](https://shannon-explorer.somnia.network/address/0x15C7e8CE38F021c5b45d098AaD788f63090bF20A) |
| Reactivity precompile | `0x0000000000000000000000000000000000000100` |

**Proven live, not just built:**

- `npm run arena:e2e` passes end to end against the real chain — creates desks, votes
  from two wallets, follows the clock through four real boundaries, and asserts the
  desks executed, the ballots settled, and the clock re-armed itself each time.
- An armed desk's Sell became a real `placeOrderFor` owned by the desk owner:
  [`0xb2ecdfd5…`](https://shannon-explorer.somnia.network/tx/0xb2ecdfd59c186b5183045e261a6657acb3058356c436472abac80ca9fd86b042).

---

## How the primitives work

This repo is a small, complete reference for three Somnia/dreamDEX primitives. Each one
does something a normal EVM app has to fake with a server.

### 1. Session keys — a hot key that can trade but can never take

dreamDEX records operator approvals in a shared `OperatorPermissionsRegistry`, granted
**per function selector**:

```solidity
setOperatorApprovalGlobal(sessionKey, [0x80054449, 0xe37b444b, 0x364c2587], true)
//                                     placeOrderFor  cancelOrderFor  reduceOrderFor
```

The grant lets the session key open, cancel and reduce orders **that you own and that
settle to you**. Fills pay the order owner. Deposits, withdrawals and approvals stay
`msg.sender`-scoped. The operator funds nothing and can move nothing.

That is what makes a crowd-run desk safe: the arena's session key executes the vote,
custody never leaves the desk owner's wallet, and `setOperatorApprovalGlobal(..., false)`
kills it instantly.

The arena doesn't take the owner's word for any of this. `deskIsArmed` reads the
registry itself, so a desk is only labelled *live* when the grant genuinely exists:

```solidity
// contracts/DeskArena.sol
registry.isGloballyApproved(desk.owner, sessionKey, PLACE_ORDER_FOR)
```

See `src/lib/server/execute.ts` for the placement path (auto-pull requirements, PostOnly
repricing off the live book, tick/lot quantisation) and
[Operators & Session Keys](https://docs.dreamdex.io/trading/readme-1/operators.md).

### 2. Reactivity — a clock that keeps itself alive

Most "every N minutes" apps are a cron job with a private key. This one isn't.

`SomniaExtensions._subscribe` requires the **subscription owner** to hold the 32 STT
sybil bond — and the owner can be a *contract*. So `ArenaClock` holds its own bond, and
the last thing it does inside its own callback is schedule its next firing:

```solidity
// contracts/ArenaClock.sol
function _onEvent(address, bytes32[] calldata topics, bytes calldata) internal override {
    try arena.tick() {} catch {}      // close the round that just ended
    armedForMs = 0;
    try this.rearm() {} catch (bytes memory reason) { emit ClockRearmFailed(...); }
}
```

Three details make it survivable:

- `rearm()` is `public` and takes no arguments, so if a beat is ever dropped **anyone**
  can restart the heartbeat.
- `tick()` is idempotent, so a double fire is harmless.
- The callback wraps `arena.tick()` in `try/catch`, so a reverting tick can never take
  the clock down with it.

It schedules for the boundary **plus two seconds** — landing exactly on it risks a
callback whose `block.timestamp` is still in the old round, which would silently skip a
tick.

There is no cron in this repo. `/api/keeper/tick` exists only to heal a miss and to
place the real dreamDEX orders that a contract cannot place on an owner's behalf.

### 3. An on-chain CLOB you can read from a contract

The arena never trusts a price. It reads the SOMI:USDso book directly, in the same
transaction that settles the round:

```solidity
// contracts/DeskArena.sol
try pool.getBookLevels(true, 1) returns (ISpotPool.Level[] memory bids) { ... }
try pool.getBookLevels(false, 1) returns (ISpotPool.Level[] memory asks) { ... }
// mid = (bestBid + bestAsk) / 2
```

No oracle, no keeper-supplied price, no signed feed. Both calls are wrapped so an empty
or reverting book skips the round rather than marking every desk against a zero.

---

## The game

**One clock for everyone.** A round is `block.timestamp / 300`. Every desk opens and closes
on the identical boundary, so profit is measured over identical windows — and there is no
per-desk timer to drift and nothing to synchronise between server instances.

**Voting is a transaction.** `vote(deskId, choice)` — one per wallet, per desk, per round.
The tally is the chain's, not a server's. A tie resolves to *Wait*: the crowd has to
actually agree to move a book. Your first ballot mints your contributor badge in the same
transaction.

**Desks are ranked on an identical book.** Every desk starts with 1,000 USDso and trades a
fixed 1,000 SOMI lot in the winning direction at the closing mid, position capped at ±5
lots. Profit is `cash + position × mid − 1000`. Same capital, same lot, same window, same
price — so the leaderboard compares desks, not bankrolls.

**Armed desks also trade for real.** If an owner grants the session key and approves the
quote token, the keeper mirrors that same winning move onto the live dreamDEX book as an
order the owner keeps. Opening a desk stays cheap; going live is opt-in and revocable.

**You are scored on your own call.** One round after your vote executes, the arena knows
what the move was worth and settles your ballot against it in basis points:

| your vote | points |
| --- | --- |
| Buy | `+clamp(bps, −50, +50)` |
| Sell | `−clamp(bps, −50, +50)` |
| Wait | `max(0, 10 − \|bps\|)` |

You score on whether *you* were right, not on whether the crowd agreed with you. Points are
clamped so a single violent candle can't decide a season. Consecutive positive rounds build
a streak; a season is 288 rounds (24h) and is a *slice* of your lifetime total, so nothing
you earn is ever wiped.

**Settlement can't wedge.** Scores are stored per round, not per voter, so a round that
moves every leaderboard is one `O(1)` write. Voters then walk their own ballots — and a
round that missed its tick is skipped at zero rather than blocking the cursor forever.

**Opening a desk posts a bond.** `CREATE_BOND` (0.05 STT) is held by the arena and
returned in full by `retireDesk`. It gates spam desks; a retired desk keeps its profit on
the board, frozen.

### The round, end to end

```
[ round R opens ]  --- 5 min: the crowd votes on every desk ---  [ boundary ]
                                                                     |
   ArenaClock fires (and re-arms itself) ─────────────────────────────┤
                                                                     |
   arena.tick():                                                     |
     roundMid[R+1] = mid read from the SpotPool book                 |
     every desk executes round R's majority move at that mid         |
     round R-1's ballots settle against mid[R] -> mid[R+1]           |
                                                                     |
   keeper (only for armed desks): placeOrderFor on the real book ────┘
```

Your vote is a prediction for the window your desk is actually exposed to, so scoring
lags execution by one round. That lag is also the retention hook: come back in five
minutes to see whether you were right *and* to vote again.

---

## Contracts

| Contract | What it holds |
| --- | --- |
| `DeskArena.sol` | Desks, ballots, round mids, paper books, points, streaks, seasons |
| `ArenaClock.sol` | The self-rescheduling Reactivity heartbeat |
| `ArenaBadge.sol` | Soulbound ERC-721, deployed twice: desk owners and contributors |

Badges never store a score — `scoreOf` reads through to the arena at call time:

```solidity
// contracts/ArenaBadge.sol
function scoreOf(address wallet) public view returns (int256) {
    if (kind == Kind.Desk) return arena.deskScoreOf(wallet);
    return arena.contributorScoreOf(wallet);
}
```

So a round that moves every leaderboard costs **zero** token writes; the only write
either collection ever does is the mint, inside the holder's own `createDesk` / `vote`
transaction. Transfers and approvals all revert `Soulbound()`.

`tokenURI` points back at `/api/nft/desk/{id}` and `/api/nft/contributor/{id}`, which
read the live score off the arena — so an explorer shows current standing, not a
mint-time snapshot.

### Deploy order

The badges need the arena's address and the arena needs theirs, so wiring is one-shot:

1. `DeskArena(pool, registry, sessionKey)`
2. `ArenaBadge` ×2, each constructed with the arena address
3. `arena.setBadges(desk, contributor)` — deployer only, and only once
4. `ArenaClock{value: 45 STT}(arena, admin)`, then `clock.rearm()`

`npm run deploy:arena` does all of it.

---

## What is on-chain, and what the server is for

Everything that decides an outcome is on-chain:

| | Where it lives |
| --- | --- |
| Desks, owners, bonds | `DeskArena` |
| Ballots and tallies | `DeskArena` — every vote is a transaction |
| The round price | Read from the SpotPool inside `tick()` |
| Paper books, profit, ranking | `DeskArena` |
| Points, streaks, seasons | `DeskArena` |
| Badges and their scores | `ArenaBadge` ×2, reading through to the arena |
| The five-minute clock | `ArenaClock`, owning its own subscription |

The Next.js app does exactly two things the chain cannot:

1. **Reads and renders.** `/api/arena` is one batched read of the whole arena. It holds
   no state — turn it off and the arena keeps running.
2. **Runs the keeper.** `/api/keeper/tick` heals a dropped beat and places the real
   dreamDEX orders for armed desks, because a contract cannot call `placeOrderFor` on an
   owner's behalf. Both actions are idempotent and safe to hit from anywhere.

### Repo map

```
contracts/          DeskArena.sol, ArenaClock.sol, ArenaBadge.sol
scripts/            deploy, compile, ABI generation, and the live e2e proofs
src/app/            routes: / · /desk/[id] · /create · /leaderboard · /orchard
src/app/api/        arena (read) · keeper/tick (heal + mirror) · nft/* (metadata)
src/components/     arena UI
src/hooks/          useArena (poll) · useArenaActions (writes) · useDeskOwner (grants)
src/lib/chain/      addresses, chain config, generated ABIs
src/lib/server/     arena reader, keeper, order execution, badge metadata
```

`src/lib/chain/*-abi.ts` is generated — run `npm run abis` after touching a contract
rather than editing it by hand.

---

## Run it

```bash
cp .env.example .env.local     # fill in the RPC and SESSION_PRIVATE_KEY
npm install
npm run deploy:arena           # deploys all four, funds and arms the clock
# paste the printed addresses into .env.local
npm run dev
```

The deployed Shannon addresses ship as defaults in `src/lib/chain/constants.ts`, so the
app is fully readable with **no environment at all** — an env var only overrides them.
You only need your own deployment if you want to change the contracts.

`npm run deploy:arena` needs the deployer to hold ~50 STT: 45 goes into the clock so it
can own its subscription, the rest is gas. Get testnet STT from the
[Somnia faucet](https://testnet.somnia.network/).

| Script | |
| --- | --- |
| `npm run dev` / `build` / `start` | The Next.js app |
| `npm run compile` | Compile the contracts and check them against the EIP-170 limit |
| `npm run abis` | Regenerate `src/lib/chain/*-abi.ts` from `contracts/` |
| `npm run deploy:arena` | Deploy the arena, both badges and the clock |
| `npm run arena:e2e` | Full live proof against Shannon: create, vote, follow the clock, settle |
| `node scripts/arm-desk.mjs <id>` | Grant the session key + approve the quote token for a desk |
| `node scripts/live-order-test.mjs <id>` | Prove an armed desk's move becomes a real order |

`npm run arena:e2e` runs against the real chain and takes about twenty minutes, because
it waits out real five-minute rounds and asserts the clock re-armed itself each time.

Solidity is pinned to **0.8.30** because `@somnia-chain/reactivity-contracts` pins it
exactly; a newer solc will refuse to compile `ArenaClock`.

### Environment

| Variable | Needed for | |
| --- | --- | --- |
| `NEXT_PUBLIC_SOMNIA_RPC_URL` | everything | defaults to the public Shannon RPC |
| `NEXT_PUBLIC_ARENA_ADDRESS` | everything | defaults to the live deployment |
| `NEXT_PUBLIC_DESK_BADGE_ADDRESS` | badges | defaults to the live deployment |
| `NEXT_PUBLIC_CONTRIBUTOR_BADGE_ADDRESS` | badges | defaults to the live deployment |
| `NEXT_PUBLIC_ARENA_CLOCK_ADDRESS` | clock status in the UI | defaults to the live deployment |
| `NEXT_PUBLIC_SESSION_ADDRESS` | the owner grant flow | must match the arena's `sessionKey` |
| `SESSION_PRIVATE_KEY` | the keeper only | **server-only** — never prefix it `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | badge `tokenURI` base | the public origin |
| `DREAMDEX_API_URL` | display quote fallback | optional |

Without `SESSION_PRIVATE_KEY` the app runs read-only: the clock still ticks, voting,
badges and both leaderboards all work — only real-order mirroring and the tick-healing
fallback are off.

---

## Verify it yourself

Nothing here needs to be taken on trust.

```bash
# the clock is beating, and re-armed itself for a future boundary
cast call 0x5d299bd6f63546b14e3b4367974ad94819e1a643 "fireCount()(uint256)"
cast call 0x5d299bd6f63546b14e3b4367974ad94819e1a643 "armedForMs()(uint256)"

# the arena is current: lastTickedRound == roundId
cast call 0x86913db4d9a49848e6480d09b0ece612ff2b431e "arenaState()"

# a desk is armed only if the registry really holds the grant
cast call 0x86913db4d9a49848e6480d09b0ece612ff2b431e "deskIsArmed(uint256)(bool)" 1
```

Or read the same thing through the app: `GET /api/arena` returns the whole arena in one
JSON blob, including `clock.fireCount` and `state.lastTickedRound`.

---

## Known limits

Worth stating plainly, because they are the things to fix before this is more than a
testnet showcase:

- **The mid is a single top-of-book snapshot.** Reading `getBookLevels(_, 1)` at the
  boundary is verifiable but manipulable: someone can widen or shift the touch in the
  block the round settles and move every desk's mark at once. On mainnet this wants a
  depth-weighted mid or a short TWAP, and a sanity band that skips a round whose mid
  jumps implausibly.
- **Free voting is sybil-able.** The bond gates *desks*, not ballots, so nothing stops one
  person running many voting wallets. Points only accrue for being right and splitting
  across wallets splits the score, which blunts it — it doesn't solve it. A ballot bond or
  a stake weight is the real answer.
- **`MAX_DESKS` is 256.** `tick()` walks every desk in one Reactivity callback, so the
  arena is capped to keep that inside the callback's gas limit. Past that it needs a
  cursor that resumes across beats.
- **The keeper's mirror ledger is in memory.** Which `(round, desk)` pairs it already
  mirrored lives in the process, so a cold start can re-attempt one. `placeOrderFor` is
  PostOnly at the touch, so the worst case is a duplicate resting order, not a double
  spend — but a durable ledger is the real fix.

## Notes

- **Testnet only, for now.** Every address is env-driven and the chain is defined in one
  place (`src/lib/chain/config.ts`), so a mainnet run is a redeploy plus an env swap —
  substitute the mainnet `OperatorPermissionsRegistry`
  (`0xE7a190736B6024a4DbafadC04E283075877005ce`) and the mainnet pool.
- **No cron required.** The clock ticks itself. Any page load also heals a missed beat via
  `/api/keeper/tick`. If you want a third belt, point a scheduler at that route.
- **The server is not load-bearing.** Ballots, tallies, mids, books, points and badges are
  all on-chain. Turn the app off and the arena keeps running.
