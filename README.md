# DreamDesk — Swarm Desk (Day 2)

House-funded desk on Somnia Shannon: the owner grants a session key on-chain, wallets sign Bid / Ask / Hold each round, and the server-held session key calls `placeOrderFor`.

## Run locally

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_HOUSE_OWNER_ADDRESS, NEXT_PUBLIC_SESSION_ADDRESS, SESSION_PRIVATE_KEY
npm install
npm run dev
```

Without owner/session addresses the UI stays in theater mode. **Play demo** never hits the chain.

## House setup (Shannon testnet)

1. Create two EOAs: **owner** (cold) and **session** (hot). Put both *addresses* in `.env.local`. Put the session **private key** in `SESSION_PRIVATE_KEY` (server only).
2. Fund the **owner** with testnet gas and USDso. After connecting as owner, click **Approve USDso** so the pool can auto-pull on Bids.
3. Fund the **session** with STT for gas. Asks sell native SOMI, so the session also needs a little native for `msg.value` (credited to the owner).
4. Add Shannon (chain ID `50312`, RPC `https://api.infra.testnet.somnia.network`) in the wallet.
5. Connect the **house owner**, **Grant session key** (`setOperatorApprovalGlobal` on `0x15C7…F20A`).
6. Anyone with a wallet can **Open next 5-min round** (once armed) and sign one vote. Clock zero → session key `placeOrderFor` (PostOnly, min lot) or Hold.
7. **Revoke desk** wipes the grant. The next resolve should fail `OnlyApprovedContracts`.

Votes are 1-per-wallet in memory on this Node process (not shared across Vercel instances).

## Demo flow

1. Connect owner → grant session key (on-chain) → approve USDso
2. Open round → connect any wallet → sign Bid / Ask / Hold
3. Clock hits zero → session key `placeOrderFor` (or Hold)
4. Leaderboard updates (± points, still Day-1 stub scoring)
5. Revoke desk → next execute blocked

Or hit **Play demo** (local narrative; no chain, no session key).

## Later (Spec §9)

- **Day 3:** lagged mark-to-mid scoring + revoke polish

## Spec

Google Drive: *DreamDesk Spec v2 — Swarm Desk*
