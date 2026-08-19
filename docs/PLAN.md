# DreamDesk Arena — plan

Turns the single house desk into a **public arena**: anyone opens a desk, every desk
trades the same synchronized 5-minute round, the crowd votes the next move, and two
soulbound leaderboards (desk owners + contributors) keep score.

Addresses Emre's Slack feedback (user-created desks, voter bond, onramp to DreamDEX,
retention via leaderboard/streaks/seasons, docs) plus the requested arena mechanics.

---

## 1. Core model

**One global clock.** `roundId = block.timestamp / 300`. Every desk shares the exact
same 5-minute window — no per-desk timers, no drift, nothing to sync across Vercel
instances. The whole arena is one countdown.

**Round lifecycle**
```
[ round R opens ]  --- 5 min: crowd votes on every desk ---  [ round R closes ]
                                                              |
                              mid snapped on-chain from the SOMI:USDso book
                              each desk executes its majority move at that mid
                              round R-1's ballots settle (points, streaks, badges)
```
Voting is a prediction for the *next* window, so the settlement lag is one round —
which is also the retention hook: come back in 5 minutes to see if you were right
*and* to vote again.

**Desk PnL (the ranking metric).** Every desk gets an on-chain paper book: 1,000 USDso
cash, 0 SOMI. Each round the winning move trades a fixed lot at the mid the contract
reads itself from the pool. Equity = `cash + position x mid`. Profit = equity - 1000.
Same starting capital, same window, same price feed → desks are directly comparable.
**Best profit wins the season.**

**Real orders on top (hybrid).** A desk whose owner also grants the session key and
approves USDso is flagged **LIVE**: the keeper mirrors its winning move as a real
`placeOrderFor` on the DreamDEX SpotPool. Paper PnL still ranks it; the real fill is
the proof. Opening a desk stays cheap, the session-key showcase survives.

**Contributor points.** Settled against the realized move of the window your vote
covered, in bps, so you're scored on *your* call — not on whether the crowd agreed:
```
bps = (mid_end - mid_start) * 10000 / mid_start
bid  -> +clamp(bps, -50, +50)
ask  -> -clamp(bps, -50, +50)
hold -> max(0, 10 - |bps|)
```
Streak = consecutive settled rounds with positive points. Season = fixed block of
rounds; scores archive and the board resets.

**Bond.** `createDesk` posts a small STT bond, refunded on retire. Gates spam desks
and bad-crowd risk, per Emre.

---

## 2. Contracts (Shannon testnet, 50312)

| Contract | Role |
| --- | --- |
| `DeskArena.sol` | Desks, rounds, votes, mids, paper PnL, points, streaks, seasons. Reads the SpotPool book directly for its price — no oracle, no trusted feed. |
| `ArenaClock.sol` | Somnia Reactivity handler. Fires at each round boundary, calls `arena.tick()`, then **re-schedules itself** for the next boundary. |
| `DeskBadge.sol` | Soulbound, one per **desk owner**. Score = desk PnL. Minted by the arena on `createDesk`. |
| `ContributorBadge.sol` | Soulbound, one per **voter**. Points, rounds voted, best streak. Minted by the arena on first vote. |

Two things worth calling out:

- **The clock is self-perpetuating.** `SomniaExtensions._subscribe` only requires the
  *subscription owner* to hold >= 32 STT — and the owner can be the contract. So
  `ArenaClock` funds itself, and inside `onEvent` it schedules its own next firing.
  A 5-minute heartbeat that runs with no server, no cron, no keeper. This is the
  Reactivity showcase.
- **The arena mints its own badges.** No keeper signature in the mint path: your vote
  transaction mints your contributor SBT, your createDesk transaction mints the owner
  SBT. Trustless.

`tick()` is also **permissionless and idempotent** — any wallet, any page load, or the
keeper can advance the arena if a callback is ever missed. Belt and braces.

---

## 3. Frontend

| Route | What it is |
| --- | --- |
| `/` | **The Arena.** Global countdown, live desk leaderboard by PnL, vote inline on any desk, your position, contributors preview, "Open your desk" CTA. |
| `/desk/[id]` | Desk detail — PnL curve, position, ballots, round history, vote panel, owner controls (grant session key, approve USDso, go LIVE, retire). |
| `/create` | Open a desk: name, bond, optional LIVE wizard. |
| `/leaderboard` | Full desk board + contributor board, streaks, season standing. |
| `/orchard` | Both soulbound collections, on-chain art. |
| `/api/nft/desk/[id]`, `/api/nft/contributor/[id]` | SVG + metadata for explorers. |
| `/api/keeper/tick` | Advances the arena and mirrors LIVE desks' moves as real orders. |

**Onramp (Emre).** Every settled round shows what your call was worth and links out to
DreamDEX to trade it for real; a winning streak surfaces a "trade this yourself"
prompt and the bot-builder link. Voting is the funnel, trading is the exit.

---

## 4. Milestones (each one commits + pushes)

1. **Contracts** — write, compile, unit-check the maths.
2. **Deploy to Shannon** — deploy all four, fund the clock, seed two desks with the two
   test wallets, prove a full round end-to-end from scripts (vote -> tick -> settle -> badges).
3. **Frontend** — arena, desk page, create flow, both leaderboards, badges.
4. **Keeper + LIVE desks** — real `placeOrderFor` mirroring, session-key grant UI.
5. **Polish** — streaks, seasons, onramp links, README "how the primitives work".
6. **Ship** — push branch, merge master, verify the Vercel production deploy.

## 5. Shipped

Live on Shannon, deployed to production:

| | |
| --- | --- |
| App | https://dreamdex-arena.vercel.app |
| `DeskArena` | `0x86913db4d9a49848e6480d09b0ece612ff2b431e` |
| `ArenaBadge` (desk) | `0x765e2b5bf6548ac514f31130ca07babd4dbb56b8` |
| `ArenaBadge` (contributor) | `0xee84b5fc635d590e5a9b0ce7396d4eb8bb8d0966` |
| `ArenaClock` | `0x5d299bd6f63546b14e3b4367974ad94819e1a643` |

Verified live, not just built:

- The clock has re-armed itself every five minutes since deploy, through a container
  restart on our side. It costs about 0.08 STT/hour, so its 45 STT funds it for weeks.
- An armed desk's Sell became a real `placeOrderFor` owned by the desk owner —
  [tx](https://shannon-explorer.somnia.network/tx/0xb2ecdfd59c186b5183045e261a6657acb3058356c436472abac80ca9fd86b042).
- `npm run arena:e2e` passes end to end against the real chain.

### Two deploy gotchas worth remembering

- The project's original production hostname was `dreamdex-demo`, while `dreamdesk-demo`
  was a stale alias pinned to a six-day-old deployment — which is why the site looked
  like it had not redeployed when it actually had. The arena now lives at
  `dreamdex-arena.vercel.app`; the older hostnames still resolve to the same deployment.
  Renaming the domain also means re-pointing both badges' `tokenURI` base on-chain
  (`node scripts/set-badge-uri.mjs`), or explorers keep resolving metadata at the old
  host.
- The project carried env vars from the previous build — an old `DESK_BADGE_ADDRESS`
  and a *different* session key — which silently overrode the committed defaults. They
  have been rewritten to the current deployment.
