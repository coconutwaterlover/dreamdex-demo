/** Casts a Sell on an armed desk so the next boundary produces a real order to look at. */
import { compile } from "./lib/compile.mjs";
import { publicClient, send, walletFor, explorerTx } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";
loadEnv();
const ARENA = process.env.NEXT_PUBLIC_ARENA_ADDRESS;
const { abi } = compile("DeskArena.sol", "DeskArena");
const deskId = BigInt(process.argv[2] ?? "1");
const choice = Number(process.argv[3] ?? 2); // 2 = Sell
const round = await publicClient.readContract({ address: ARENA, abi, functionName: "currentRound" });
for (const key of ["SESSION_PRIVATE_KEY", "HOUSE_OWNER_PRIVATE_KEY"]) {
  const w = walletFor(requireKey(key));
  const already = await publicClient.readContract({ address: ARENA, abi, functionName: "myVote", args: [round, deskId, w.account.address] });
  if (already !== 0) { console.log(`${w.account.address.slice(0,10)} already voted`); continue; }
  const { hash } = await send(w, { address: ARENA, abi, functionName: "vote", args: [deskId, choice] });
  console.log(`${w.account.address.slice(0,10)} -> desk ${deskId} choice ${choice}  ${explorerTx(hash)}`);
}
const winner = await publicClient.readContract({ address: ARENA, abi, functionName: "winnerOf", args: [round, deskId] });
console.log(`round ${round} winner for desk ${deskId}: ${winner}`);
