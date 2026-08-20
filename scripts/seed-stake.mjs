/** Puts real stake on both sides of a desk so the panel has something to show. */
import { parseEther, formatEther } from "viem";
import { compile } from "./lib/compile.mjs";
import { publicClient, send, walletFor } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";
loadEnv();
const POOL = process.env.NEXT_PUBLIC_STAKE_POOL_ADDRESS;
const { abi } = compile("StakePool.sol", "StakePool");
const deskId = BigInt(process.argv[2] ?? "1");
const open = await publicClient.readContract({ address: POOL, abi, functionName: "secondsToLock" });
if (open < 20n) { console.log(`only ${open}s to lock — skipping`); process.exit(0); }
for (const [key, side, amt] of [["SESSION_PRIVATE_KEY", 1, "0.08"], ["HOUSE_OWNER_PRIVATE_KEY", 2, "0.03"]]) {
  const w = walletFor(requireKey(key));
  await send(w, { address: POOL, abi, functionName: "stake", args: [deskId, side], value: parseEther(amt) });
  console.log(`${w.account.address.slice(0,10)} staked ${amt} on ${side === 1 ? "Buy" : "Sell"}`);
}
const pv = await publicClient.readContract({ address: POOL, abi, functionName: "poolView", args: [await publicClient.readContract({address:POOL,abi,functionName:"currentRound"}), deskId] });
console.log(`pot ${formatEther(pv.pot)} | buy ${formatEther(pv.bid)} @ ${(Number(pv.bidOddsE18)/1e18).toFixed(2)}x | sell ${formatEther(pv.ask)} @ ${(Number(pv.askOddsE18)/1e18).toFixed(2)}x`);
