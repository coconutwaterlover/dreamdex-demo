/**
 * Proves the parimutuel maths against live Shannon: two wallets take opposite sides,
 * the round settles from the arena's own price scoring, and the winner is paid by the
 * loser. Asserts conservation — everything paid out plus rake equals the pot.
 */
import { formatEther, parseEther } from "viem";
import { compile } from "./lib/compile.mjs";
import { publicClient, send, walletFor, explorerTx } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";

loadEnv();
const POOL = process.env.NEXT_PUBLIC_STAKE_POOL_ADDRESS;
const ARENA = process.env.NEXT_PUBLIC_ARENA_ADDRESS;
const deskId = BigInt(process.argv[2] ?? "0");
const STAKE = parseEther("0.05");
const BID = 1, ASK = 2;

const { abi } = compile("StakePool.sol", "StakePool");
const arenaAbi = compile("DeskArena.sol", "DeskArena").abi;
const a = walletFor(requireKey("SESSION_PRIVATE_KEY"));
const b = walletFor(requireKey("HOUSE_OWNER_PRIVATE_KEY"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) fails.push(label);
};
const read = (fn, args = []) => publicClient.readContract({ address: POOL, abi, functionName: fn, args });
const eth = (v) => Number(formatEther(v)).toFixed(6);

// --- wait for a round with enough time left to stake
let round = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "currentRound" });
let toLock = await read("secondsToLock");
if (toLock < 40n) {
  console.log(`only ${toLock}s to lock — waiting for the next window`);
  await sleep((Number(toLock) + 70) * 1000);
  round = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "currentRound" });
  toLock = await read("secondsToLock");
}
console.log(`staking in round ${round}, ${toLock}s until lock\n`);
check("staking window is open", await read("stakingOpen", [round]));

// --- opposite sides
await send(a, { address: POOL, abi, functionName: "stake", args: [deskId, BID], value: STAKE });
console.log(`  A ${a.account.address.slice(0, 10)} staked ${eth(STAKE)} on Buy`);
await send(b, { address: POOL, abi, functionName: "stake", args: [deskId, ASK], value: STAKE });
console.log(`  B ${b.account.address.slice(0, 10)} staked ${eth(STAKE)} on Sell`);

let pv = await read("poolView", [round, deskId]);
console.log(`\npool: bid ${eth(pv.bid)}  ask ${eth(pv.ask)}  rollover ${eth(pv.rollover)}  pot ${eth(pv.pot)}`);
console.log(`odds: buy ${(Number(pv.bidOddsE18) / 1e18).toFixed(3)}x  sell ${(Number(pv.askOddsE18) / 1e18).toFixed(3)}x`);
check("both sides recorded", pv.bid === STAKE && pv.ask === STAKE);
check("pot includes the seed", pv.pot === STAKE * 2n + pv.rollover);

// --- lock
console.log(`\nwaiting ${await read("secondsToLock")}s for the lock…`);
await sleep((Number(await read("secondsToLock")) + 5) * 1000);
check("staking is closed after the lock", !(await read("stakingOpen", [round])));

// --- wait for the arena to score that round (it settles at tick(round + 2))
console.log("\nwaiting for the arena to score the round (two boundaries)…");
for (let i = 0; i < 40; i++) {
  const score = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "roundScore", args: [round] });
  if (score[3]) {
    console.log(`scored: bidPts ${score[0]}  askPts ${score[1]}  holdPts ${score[2]}`);
    break;
  }
  await sleep(20_000);
}
const score = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "roundScore", args: [round] });
check("arena scored the round", score[3]);

// --- settle
const side = await read("winningSide", [round]);
console.log(`\nwinning side: ${side} (0 none, 1 buy, 2 sell)`);
const potBefore = (await read("poolView", [round, deskId])).pot;
const balBefore = await publicClient.getBalance({ address: POOL });
const { hash } = await send(a, { address: POOL, abi, functionName: "settle", args: [round, deskId] });
console.log(`settled  ${explorerTx(hash)}`);
pv = await read("poolView", [round, deskId]);
check("pool is settled", pv.settled);

const ownerRake = await read("ownerAccrued", [deskId]);
const treasuryRake = await read("treasuryAccrued");

if (side === 0) {
  check("flat round refunds both sides", pv.refunded, `refunded=${pv.refunded}`);
  const [cA, cB] = await Promise.all([
    read("claimable", [round, deskId, a.account.address]),
    read("claimable", [round, deskId, b.account.address]),
  ]);
  check("A gets its stake back", cA === STAKE, eth(cA));
  check("B gets its stake back", cB === STAKE, eth(cB));
  check("no rake taken on a flat round", ownerRake === 0n && treasuryRake === 0n);
} else {
  const winner = side === 1 ? a : b;
  const loser = side === 1 ? b : a;
  const [cWin, cLose] = await Promise.all([
    read("claimable", [round, deskId, winner.account.address]),
    read("claimable", [round, deskId, loser.account.address]),
  ]);
  console.log(`winner claimable ${eth(cWin)}  loser claimable ${eth(cLose)}`);
  console.log(`rake: owner ${eth(ownerRake)}  treasury ${eth(treasuryRake)}`);
  check("loser is paid nothing", cLose === 0n);
  check("winner is paid more than its stake", cWin > STAKE, `${eth(cWin)} > ${eth(STAKE)}`);
  check("winner's payout is the losing side plus rollover, net of rake",
    cWin === STAKE + (potBefore - STAKE - ownerRake - treasuryRake), eth(cWin));
  check("rake is 3% of what the winners took",
    ownerRake + treasuryRake === ((potBefore - STAKE) * 300n) / 10_000n,
    `${eth(ownerRake + treasuryRake)}`);

  // conservation: everything owed out of this pool plus rake equals the pot
  check("pot is fully accounted for", cWin + ownerRake + treasuryRake === potBefore,
    `${eth(cWin + ownerRake + treasuryRake)} vs pot ${eth(potBefore)}`);

  // --- claim
  const before = await publicClient.getBalance({ address: winner.account.address });
  const { hash: ch } = await send(winner, { address: POOL, abi, functionName: "claim", args: [round, deskId] });
  const after = await publicClient.getBalance({ address: winner.account.address });
  console.log(`claimed  ${explorerTx(ch)}  wallet ${eth(before)} -> ${eth(after)}`);
  check("winner's wallet actually grew", after > before);
  check("claiming twice is refused", await read("claimable", [round, deskId, winner.account.address]) === 0n);

  await send(loser, { address: POOL, abi, functionName: "claim", args: [round, deskId] });
  const [nwWin, nwLose] = await Promise.all([
    read("netWinnings", [winner.account.address]),
    read("netWinnings", [loser.account.address]),
  ]);
  console.log(`net winnings: winner ${eth(nwWin)}  loser ${eth(nwLose)}`);
  check("loser records a loss of exactly its stake", nwLose === -STAKE, eth(nwLose));
}

const balAfter = await publicClient.getBalance({ address: POOL });
console.log(`\npool balance ${eth(balBefore)} -> ${eth(balAfter)} (rake + unclaimed remain)`);
check("pool never pays out more than it holds", balAfter >= ownerRake + treasuryRake);

console.log(`\n${fails.length ? "FAILURES: " + fails.join(", ") : "all checks passed"}`);
process.exit(fails.length ? 1 : 0);
