# Rebuilding the arena on dreamDEX event contracts

Findings from probing the live contracts on Shannon, and what a migration would look
like. Everything below was checked on-chain, not read off the docs.

---

## 1. The mapping is almost 1:1

We hand-built most of this. Event contracts already have it, as venue infrastructure:

| DreamDesk today | dreamDEX event contracts |
| --- | --- |
| `StakePool` — stake Buy / Sell | Buy Up / Down outcome tokens (ERC-6909 `OutcomeToken6909`) |
| Parimutuel pool, odds fixed at settlement | A real CLOB — the price *is* the live probability, and you can exit before expiry |
| `DeskArena.roundScore` as the oracle | `OracleHub` — committee, median, auditable `oracleQuestionId` |
| `ArenaClock` re-arming itself via Reactivity | `MarketCreator.armFirstRoll` / `triggerRoll` — **also Reactivity-driven, same pattern** |
| `ROUND_SECONDS = 300` | `registerSeries(..., intervalSec, settlementWindow)` |
| `claim()` from the pool | Winners redeem at face value; 1 collateral ⇄ 1 Up + 1 Down |
| `_readMid()` on the SpotPool | `binaryPool.getBookLevels(bool,uint64)` — **identical signature** |

That last row matters more than it looks: `DeskArena._readMid()` would compile against a
binary pool **unchanged**. On a binary market the mid is the probability, so "what does
the crowd think" stops being something we compute and becomes something we read.

Theirs is strictly better in one respect: **a staker can exit before settlement.** Our
parimutuel locks capital until the round resolves; an outcome token can be sold at any
time. That gives a secondary market and a continuously-updating probability, which a
pool cannot.

## 2. What is actually live on Shannon

| Check | Result |
| --- | --- |
| `marketCreator(0x138CfA6b…).marketCount` | **6,080** markets created historically |
| Registered series | BTC & ETH at `intervalSec` 900 / 3600 / 14400 |
| `latestExpiryBySeriesId` on all five | **2026-08-04** |
| `armedBoundary` | 2026-08-04 |
| `MarketBound` events in the last 4M blocks | **none** |

**The venue is dormant on testnet.** Nothing has rolled since 4 August, so there is no
live market to trade against or even read today.

## 3. Creating our own series is *not* permissioned

This was the surprise, and it changes the plan. `MarketCreatorFactory` at
`0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B` is open:

```
createMarketCreator(owner, core, adapter, operatorId, venueId, defaultBookParams)
  -> (address creator, address policy)
```

We called it. `creatorCount` went **0 → 1**: we own the first MarketCreator ever created
on Shannon. The `MarketCreatorPolicy` it returns is **ours** — it gates who may create
markets *through our creator*, it is not a gate on us creating one. (Read the other way
round at first; corrected here.)

And the arena's cadence registers cleanly:

```
registerSeries(305, { collateral: testUsdc, asset: "SOMI",
                      numericDecimals: 8, intervalSec: 300, settlementWindow: 300 })
```

`SOMI @ 300s`, `BTC @ 300s` and `SOMI @ 900s` all simulate OK. **A five-minute SOMI
series is expressible** — nothing in the contracts objects to it, even though nothing has
ever run at that cadence.

The creator also self-rolls: fund it, `setReactivityGasParams`, `armFirstRoll(seriesId,
firesAtSec)`, and Reactivity does the rest — the same trick `ArenaClock` uses, and for
the same reason.

## 4. Where it stops

We armed a real roll for `2026-08-20T08:00:00Z`. The callback **fired** — `armedBoundary`
reset to 0 and ~0.14 STT of callback gas was consumed — but `marketCount` stayed 0. The
roll reverts inside.

Calling `triggerRoll` directly reverts with custom error **`0x360f0e2b`**, which is not
in the published SDK's error ABIs, so it is not decoded here. The likely cause, from what
*is* readable:

```
OracleHub.creditOf(operatorId)        = 0
OracleHub.payerCreditOf(ourCreator)   = 0
```

`scheduleQuestion` is `payable` and the hub tracks credit per **operator**. Our creator
has native balance but no oracle credit, and `operatorId` is a registered venue identity
— the live creator uses `operatorId = 2` with a hashed `venueId`, while a fresh one
defaults to whatever we pass. Re-deploying with `core = BinaryMarketsModule` (the live
creator's configuration; `MarketsCore` was wrong) did not change the revert.

**So the wall is operator identity and oracle credit, not market creation.**

## 5. The ask

Short, and worth putting to the team directly:

1. **An operator id + venue id for DreamDesk**, or confirmation that we may use an
   existing one on testnet.
2. **Oracle credit** against that operator — or the deposit path, which is not obvious
   from the published ABI (the hub exposes `withdraw`, `withdrawMyCredit`, `creditOf`,
   but no `deposit`).
3. **Confirmation that the oracle can price `SOMI`** at all. Every live series is BTC or
   ETH; `registerSeries` accepting the string proves nothing about whether a committee
   can answer it.
4. The meaning of custom error **`0x360f0e2b`**.
5. Whether the testnet series are dormant deliberately, or whether the roll can be
   restarted.

## 6. What changes if we get it

The desk layer does not move. Only the money layer does.

- **Desks stay** — the crowd, the calls, the leaderboards, the badges. A desk is a
  crowd with a track record, which an event contract is not.
- **`StakePool` is replaced.** Staking becomes buying Up / Down on a real book, with an
  exit before expiry.
- **The paper book disappears.** Desk PnL becomes redeemed collateral. The whole
  modelled-vs-real problem that started this thread stops existing.
- **`ArenaClock` becomes redundant** — the MarketCreator rolls its own windows.
- **`roundScore` as an oracle becomes redundant** — `OracleHub` resolves.
- **The desk earns a builder fee** on the flow it routes. Already first-class:
  `placeOrderFor` takes `builder` and `builderFeeBpsTimes1k`, and the binary pool exposes
  `getMaxBuilderFeeBpsTimes1k` / `getBuilderApproval`.

That deletes a great deal of what we wrote, which is the right outcome — it means the
venue supports the thing natively.

One product consequence to decide deliberately: all desks on a series share **one** book.
That is good for liquidity and bad for per-desk isolation — desks would differentiate on
their crowd and their calls, not on their own private market.

## 7. Deployed during this investigation

Testnet only, ours, harmless if abandoned:

| | |
| --- | --- |
| MarketCreator #1 | `0xD1ab8e8AF68124974a96B5CD122c204ad4fb5237` (`core` = MarketsCore — wrong) |
| MarketCreator #2 | `0x62627805965705Cc303A7F6282DD5059921980aD` (`core` = BinaryMarketsModule, `operatorId` 2) |

Both hold STT that `withdrawNative(to, amount)` can reclaim.

Repro: `node scripts/event-creator.mjs` then `node scripts/event-series.mjs`.
