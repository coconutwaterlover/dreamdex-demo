# DreamDesk Arena

A public trading arena on Somnia. **Anyone opens a desk. The crowd votes its next move
every five minutes. The desk with the best profit wins the season.**

Two soulbound leaderboards keep score: one for the desks, one for the people calling
them. Voting is free, so the leaderboard is the sport — and the desks that want it can
have the crowd's winning move posted as a *real* order on dreamDEX.

Live on Somnia Shannon testnet · [dreamdesk-demo.vercel.app](https://dreamdesk-demo.vercel.app)

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

`rearm()` is `public` and takes no arguments, so if a beat is ever dropped **anyone** can
restart the heartbeat — and `tick()` is idempotent, so a double fire is harmless. There is
no cron in this repo. The `/api/keeper/tick` route exists only to heal a miss and to place
the real dreamDEX orders that a contract cannot place on an owner's behalf.

### 3. An on-chain CLOB you can read from a contract

The arena never trusts a price. It reads the SOMI:USDso book directly, in the same
transaction that settles the round:

```solidity
// contracts/DeskArena.sol
try pool.getBookLevels(true, 1) returns (ISpotPool.Level[] memory bids) { ... }
try pool.getBookLevels(false, 1) returns (ISpotPool.Level[] memory asks) { ... }
// mid = (bestBid + bestAsk) / 2
```

No oracle, no keeper-supplied price, no signed feed. Because the order book *is* a smart
contract, the mid that ranks every desk is as verifiable as the votes that produced it.

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
| Wait | `max(0, 10 − |bps|)` |

You score on whether *you* were right, not on whether the crowd agreed with you. Points are
clamped so a single violent candle can't decide a season. Consecutive positive rounds build
a streak; a season is 288 rounds (24h) and is a *slice* of your lifetime total, so nothing
you earn is ever wiped.

**Settlement can't wedge.** Scores are stored per round, not per voter, so a round that
moves every leaderboard is one `O(1)` write. Voters then walk their own ballots — and a
round that missed its tick is skipped at zero rather than blocking the cursor forever.

## Contracts

| Contract | What it holds |
| --- | --- |
| `DeskArena.sol` | Desks, ballots, round mids, paper books, points, streaks, seasons |
| `ArenaClock.sol` | The self-rescheduling Reactivity heartbeat |
| `ArenaBadge.sol` | Soulbound ERC-721, deployed twice: desk owners and contributors |

Badges never store a score — `scoreOf` reads through to the arena at call time. A round that
moves every leaderboard costs **zero** token writes; the only write either collection ever
does is the mint, inside the holder's own `createDesk` / `vote` transaction.

## Run it

```bash
cp .env.example .env.local     # fill in the RPC and SESSION_PRIVATE_KEY
npm install
npm run deploy:arena           # deploys all four, funds and arms the clock
# paste the printed addresses into .env.local
npm run dev
```

`npm run deploy:arena` needs the deployer to hold ~50 STT: 45 goes into the clock so it can
own its subscription, the rest is gas. Get testnet STT from the
[Somnia faucet](https://testnet.somnia.network/).

| Script | |
| --- | --- |
| `npm run compile` | Compile the contracts and check them against the EIP-170 limit |
| `npm run abis` | Regenerate `src/lib/chain/*-abi.ts` from `contracts/` |
| `npm run deploy:arena` | Deploy the arena, both badges and the clock |
| `npm run arena:e2e` | Full live proof against Shannon: create, vote, follow the clock, settle |
| `node scripts/arm-desk.mjs <id>` | Grant the session key + approve the quote token for a desk |
| `node scripts/live-order-test.mjs <id>` | Prove an armed desk's move becomes a real order |

`npm run arena:e2e` runs against the real chain and takes about twenty minutes, because it
waits out real five-minute rounds and asserts the clock re-armed itself each time.

## Notes

- **Testnet only, for now.** Every address is env-driven and the chain is defined in one
  place (`src/lib/chain/config.ts`), so a mainnet run is a redeploy plus an env swap —
  substitute the mainnet `OperatorPermissionsRegistry`
  (`0xE7a190736B6024a4DbafadC04E283075877005ce`) and the mainnet pool.
- **No cron required.** The clock ticks itself. Any page load also heals a missed beat via
  `/api/keeper/tick`. If you want a third belt, point a scheduler at that route.
- **The server is not load-bearing.** Ballots, tallies, mids, books, points and badges are
  all on-chain. Turn the app off and the arena keeps running.

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
