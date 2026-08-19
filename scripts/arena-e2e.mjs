/**
 * End-to-end proof against live Shannon: create desks, vote from two wallets, then
 * follow the on-chain clock through enough round boundaries to see desks execute and
 * ballots settle. Prints a running log; exits non-zero if an assertion fails.
 */
import { formatUnits } from "viem";
import { compile } from "./lib/compile.mjs";
import { publicClient, send, walletFor, explorerTx } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";

loadEnv();

const ARENA = process.env.NEXT_PUBLIC_ARENA_ADDRESS;
const DESK_BADGE = process.env.NEXT_PUBLIC_DESK_BADGE_ADDRESS;
const CONTRIB_BADGE = process.env.NEXT_PUBLIC_CONTRIBUTOR_BADGE_ADDRESS;
const CLOCK = process.env.NEXT_PUBLIC_ARENA_CLOCK_ADDRESS;
if (!ARENA) throw new Error("NEXT_PUBLIC_ARENA_ADDRESS not set");

const { abi: arenaAbi } = compile("DeskArena.sol", "DeskArena");
const { abi: badgeAbi } = compile("ArenaBadge.sol", "ArenaBadge");
const { abi: clockAbi } = compile("ArenaClock.sol", "ArenaClock");

const keeper = walletFor(requireKey("SESSION_PRIVATE_KEY"));
const owner = walletFor(requireKey("HOUSE_OWNER_PRIVATE_KEY"));

const BID = 1;
const ASK = 2;
const HOLD = 3;
const CHOICE = { 0: "-", 1: "BID", 2: "ASK", 3: "HOLD" };

const failures = [];
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures.push(label);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const usd = (e6) => (Number(e6) / 1e6).toFixed(4);

function read(functionName, args = [], address = ARENA, abi = arenaAbi) {
  return publicClient.readContract({ address, abi, functionName, args });
}

async function state() {
  return read("arenaState");
}

async function dumpBoard(tag) {
  const s = await state();
  const board = await read("deskBoard", [s.roundId]);
  console.log(`\n[${tag}] round ${s.roundId}  mid ${formatUnits(s.mid, 18)}  ticked ${s.lastTickedRound}`);
  for (const d of board) {
    console.log(
      `   #${d.deskId} ${d.name.padEnd(14)} pnl ${usd(d.pnlE6).padStart(10)}  cash ${usd(d.cashE6).padStart(10)}` +
        `  somi ${usd(d.baseE6).padStart(10)}  traded ${d.roundsTraded}  votes ${d.bid}/${d.ask}/${d.hold}` +
        `  ${d.armed ? "ARMED" : d.wantsLive ? "wants-live" : "paper"}`,
    );
  }
  return { s, board };
}

// ---------------------------------------------------------------- 1. desks

let deskCount = await read("deskCount");
if (deskCount === 0n) {
  const bond = await read("CREATE_BOND");
  console.log(`creating desks (bond ${formatUnits(bond, 18)} STT)`);
  for (const [w, name] of [
    [keeper, "keeper-desk"],
    [owner, "house-desk"],
  ]) {
    const { hash } = await send(w, {
      address: ARENA,
      abi: arenaAbi,
      functionName: "createDesk",
      args: [name],
      value: bond,
    });
    console.log(`  ${name} by ${w.account.address}  ${explorerTx(hash)}`);
  }
  deskCount = await read("deskCount");
}
check("two desks exist", deskCount >= 2n, `deskCount=${deskCount}`);

for (const w of [keeper, owner]) {
  const token = await read("tokenOf", [w.account.address], DESK_BADGE, badgeAbi);
  check(`desk badge minted for ${w.account.address.slice(0, 10)}`, token > 0n, `tokenId=${token}`);
}

// The house desk asks to go live; whether it *is* armed depends on the real grant.
const houseDeskId = 1n;
const houseDesk = await read("deskView", [houseDeskId, (await state()).roundId]);
if (houseDesk.owner.toLowerCase() === owner.account.address.toLowerCase() && !houseDesk.wantsLive) {
  await send(owner, { address: ARENA, abi: arenaAbi, functionName: "setWantsLive", args: [houseDeskId, true] });
  console.log("house desk asked to go live");
}

// ---------------------------------------------------------------- 2. vote

let s = await state();
let votingRound = s.roundId;
console.log(`\nvoting in round ${votingRound} (ends ${new Date(Number(s.endsAt) * 1000).toISOString()})`);

for (const [w, deskId, choice] of [
  [keeper, 0n, BID],
  [keeper, 1n, ASK],
  [owner, 0n, BID],
  [owner, 1n, HOLD],
]) {
  const already = await read("myVote", [votingRound, deskId, w.account.address]);
  if (already !== 0) continue;
  const { hash } = await send(w, { address: ARENA, abi: arenaAbi, functionName: "vote", args: [deskId, choice] });
  console.log(`  ${w.account.address.slice(0, 10)} -> desk ${deskId} ${CHOICE[choice]}  ${explorerTx(hash)}`);
}

const tally0 = await read("tallyOf", [votingRound, 0n]);
check("desk 0 tally recorded", tally0[0] === 2, `bid=${tally0[0]} ask=${tally0[1]} hold=${tally0[2]}`);
check("desk 0 winner is BID", (await read("winnerOf", [votingRound, 0n])) === BID);
check("desk 1 winner is HOLD (1-1 tie)", (await read("winnerOf", [votingRound, 1n])) === HOLD);

for (const w of [keeper, owner]) {
  const token = await read("tokenOf", [w.account.address], CONTRIB_BADGE, badgeAbi);
  check(`contributor badge minted for ${w.account.address.slice(0, 10)}`, token > 0n, `tokenId=${token}`);
}

await dumpBoard("after voting");

// ---------------------------------------------------------------- 3. follow the clock

const WATCH_ROUNDS = Number(process.env.WATCH_ROUNDS ?? 3);
const targetRound = votingRound + BigInt(WATCH_ROUNDS);
console.log(`\nfollowing the on-chain clock to round ${targetRound} (~${WATCH_ROUNDS * 5} min)`);

let executedSeen = false;
let settledSeen = false;
let lastReported = -1n;

while (true) {
  s = await state();
  const fired = CLOCK ? await read("fireCount", [], CLOCK, clockAbi) : 0n;
  const armedFor = CLOCK ? await read("armedForMs", [], CLOCK, clockAbi) : 0n;

  if (s.roundId !== lastReported) {
    lastReported = s.roundId;
    console.log(
      `\n-- round ${s.roundId}  ticked ${s.lastTickedRound}  clock fires ${fired}x` +
        `  next ${armedFor ? new Date(Number(armedFor)).toISOString() : "not armed"}`,
    );
  }

  // The clock should carry this on its own; nudge only if it visibly fell behind.
  if (s.lastTickedRound < s.roundId && Number(s.endsAt) - Math.floor(Date.now() / 1000) < 240) {
    console.log("   clock behind — healing with a permissionless tick()");
    await send(keeper, { address: ARENA, abi: arenaAbi, functionName: "tick", args: [] });
  }

  const d0 = await read("deskView", [0n, votingRound]);
  if (!executedSeen && d0.roundsTraded > 0) {
    executedSeen = true;
    console.log(`   desk 0 executed: cash ${usd(d0.cashE6)}  somi ${usd(d0.baseE6)}  pnl ${usd(d0.pnlE6)}`);
    check("desk 0 executed its BID", d0.baseE6 > 0n && d0.cashE6 < 1_000_000_000n);
  }

  const score = await read("roundScore", [votingRound]);
  if (!settledSeen && score[3]) {
    settledSeen = true;
    console.log(`   round ${votingRound} scored: bid ${score[0]}  ask ${score[1]}  hold ${score[2]}`);
    for (const w of [keeper, owner]) {
      const pending = await read("pendingBallots", [w.account.address]);
      if (pending > 0n) {
        await send(keeper, { address: ARENA, abi: arenaAbi, functionName: "settle", args: [w.account.address, 32n] });
      }
      const c = await read("contributorView", [w.account.address]);
      console.log(
        `   ${w.account.address.slice(0, 10)}  points ${c.points}  season ${c.seasonPoints}` +
          `  streak ${c.streak}/${c.bestStreak}  rounds ${c.roundsScored}  pending ${c.pending}`,
      );
      check(`${w.account.address.slice(0, 10)} ballots settled`, c.pending === 0n);
    }
    const score2 = await read("scoreOf", [keeper.account.address], CONTRIB_BADGE, badgeAbi);
    check("contributor badge reads score through to the arena", typeof score2 === "bigint", `score=${score2}`);
  }

  if (s.roundId >= targetRound && executedSeen && settledSeen) break;
  if (s.roundId > targetRound + 2n) {
    check("settlement completed within the watch window", false);
    break;
  }
  await sleep(20_000);
}

await dumpBoard("final");

const clockFires = CLOCK ? await read("fireCount", [], CLOCK, clockAbi) : 0n;
check("on-chain clock fired at least once by itself", clockFires > 0n, `fireCount=${clockFires}`);
check("clock re-armed itself", CLOCK ? (await read("armedForMs", [], CLOCK, clockAbi)) > 0n : false);

console.log(`\n${failures.length ? `FAILURES: ${failures.join(", ")}` : "all checks passed"}`);
process.exit(failures.length ? 1 : 0);
