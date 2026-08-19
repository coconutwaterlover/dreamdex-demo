/**
 * Proves the hybrid path: an armed desk's winning move becomes a real dreamDEX order
 * owned by the desk owner. Votes Sell on the armed desk, waits for the boundary, then
 * asks the keeper to mirror it and checks the pool for the resting order.
 */
import { formatUnits } from "viem";
import { compile } from "./lib/compile.mjs";
import { publicClient, send, walletFor, explorerTx } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";

loadEnv();

const ARENA = process.env.NEXT_PUBLIC_ARENA_ADDRESS;
const KEEPER_URL = process.env.KEEPER_URL ?? "http://localhost:3000/api/keeper/tick";
const deskId = BigInt(process.argv[2] ?? "1");
const ASK = 2;

const { abi: arenaAbi } = compile("DeskArena.sol", "DeskArena");
const keeper = walletFor(requireKey("SESSION_PRIVATE_KEY"));
const owner = walletFor(requireKey("HOUSE_OWNER_PRIVATE_KEY"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const read = (fn, args = []) =>
  publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: fn, args });

const armed = await read("deskIsArmed", [deskId]);
console.log(`desk #${deskId} armed: ${armed}`);
if (!armed) throw new Error("desk is not armed — run scripts/arm-desk.mjs first");

let round = await read("currentRound");
let state = await read("arenaState");
let left = Number(state.endsAt) - Math.floor(Date.now() / 1000);
// Don't cast into the last seconds of a window; wait for a fresh one.
if (left < 45) {
  console.log(`only ${left}s left in round ${round} — waiting for the next window`);
  await sleep((left + 8) * 1000);
  round = await read("currentRound");
  state = await read("arenaState");
  left = Number(state.endsAt) - Math.floor(Date.now() / 1000);
}
console.log(`voting Sell in round ${round} (${left}s left)`);

for (const w of [keeper, owner]) {
  const already = await read("myVote", [round, deskId, w.account.address]);
  if (already !== 0) {
    console.log(`  ${w.account.address.slice(0, 10)} already voted (${already})`);
    continue;
  }
  const { hash } = await send(w, { address: ARENA, abi: arenaAbi, functionName: "vote", args: [deskId, ASK] });
  console.log(`  ${w.account.address.slice(0, 10)} -> Sell  ${explorerTx(hash)}`);
}
const winner = await read("winnerOf", [round, deskId]);
console.log(`round winner for desk ${deskId}: ${winner} (2 = Sell)`);

state = await read("arenaState");
const waitMs = (Number(state.endsAt) - Math.floor(Date.now() / 1000) + 12) * 1000;
console.log(`waiting ${Math.round(waitMs / 1000)}s for the boundary…`);
await sleep(waitMs);

// The on-chain clock should already have ticked; the keeper only heals + mirrors.
for (let attempt = 0; attempt < 6; attempt++) {
  const res = await fetch(KEEPER_URL, { method: "POST" });
  const report = await res.json();
  console.log(`keeper pass ${attempt + 1}:`, JSON.stringify(report, null, 2));
  if (report.mirrored?.length) {
    const hit = report.mirrored.find((m) => Number(m.deskId) === Number(deskId));
    if (hit?.txHash) {
      console.log(`\nREAL ORDER PLACED for desk ${deskId} owner ${hit.owner}`);
      console.log(explorerTx(hit.txHash));
      const receipt = await publicClient.getTransactionReceipt({ hash: hit.txHash });
      console.log(`status ${receipt.status}  gas ${receipt.gasUsed}  logs ${receipt.logs.length}`);
      process.exit(receipt.status === "success" ? 0 : 1);
    }
    if (hit?.error) {
      console.log(`\nmirror reported: ${hit.error}`);
      process.exit(1);
    }
  }
  await sleep(10_000);
}
console.log("\nno mirror observed within the window");
process.exit(1);
