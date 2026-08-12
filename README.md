# DreamDesk — Swarm Desk (Day 1)

House-funded desk on Somnia Shannon: the owner grants a session key on-chain, the crowd votes Bid / Ask / Hold each round, resolve still mocks `placeOrderFor`.

## Run locally

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_HOUSE_OWNER_ADDRESS and NEXT_PUBLIC_SESSION_ADDRESS
npm install
npm run dev
```

Without those addresses the UI stays in theater mode (Play demo + mocked connect/grant).

## House setup (Shannon testnet)

1. Create two EOAs: **owner** (cold) and **session** (hot). Put the owner and session *addresses* in `.env.local`. Do not put the session private key in the client — that is Day 2.
2. Fund the owner with testnet gas ([Somnia faucet](https://testnet.somnia.network/) or [Google Cloud Web3 faucet](https://cloud.google.com/web3/faucet?network=somnia)).
3. Add Shannon (chain ID `50312`, RPC `https://api.infra.testnet.somnia.network`) in the owner wallet.
4. Open the app, connect the **house owner** wallet, then **Grant session key**. That sends `setOperatorApprovalGlobal` on `OperatorPermissionsRegistry` (`0x15C7…F20A`) for place / cancel / reduce.
5. **Revoke desk** sets the same grant to `false`. The strip reads `isGloballyApproved`.

Non-owner wallets cannot arm or revoke. Visitors can still Play demo (no chain txs) and, once the desk is armed on-chain, run the local round theater.

## Demo flow

1. Connect owner → grant session key (on-chain)
2. Open round → vote Bid / Ask / Hold (crowd votes simulate)
3. Clock hits zero → resolve → session key signing theater
4. Leaderboard updates (± points)
5. Revoke desk → execute blocked

Or hit **Play demo** (local narrative; skips real txs).

## Day 1 checklist

- [ ] House owner connects on Shannon and grant/revoke lands on the registry
- [ ] Strip shows real truncated addresses and on-chain approval
- [ ] Non-owner cannot arm the desk
- [ ] Round clock → majority → mock execute → leaderboard still works
- [ ] After revoke, UI blocks the execute path

## Later (Spec §9)

- **Day 2:** real `placeOrderFor` on resolve + auth’d votes (session private key on a server)
- **Day 3:** lagged mark-to-mid scoring + revoke polish

## Spec

Google Drive: *DreamDesk Spec v2 — Swarm Desk*
