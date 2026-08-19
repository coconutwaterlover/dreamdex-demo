/**
 * Deploys the whole arena to Shannon in one shot:
 *   DeskArena -> two soulbound badges -> wire them -> ArenaClock (funded + armed).
 *
 * Idempotent-ish: pass --skip-clock to redeploy just the arena stack.
 */
import { formatEther, parseEther } from "viem";
import { compile } from "./lib/compile.mjs";
import { publicClient, send, shannon, walletFor, explorerAddress } from "./lib/chain.mjs";
import { requireKey } from "./lib/env.mjs";

const POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4";
const REGISTRY = "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A";
/** Reactivity's sybil bond is 32 STT; fund above it so callback fees have headroom. */
const CLOCK_FUNDING = parseEther(process.env.CLOCK_FUNDING_STT ?? "45");

const skipClock = process.argv.includes("--skip-clock");

const wallet = walletFor(requireKey("SESSION_PRIVATE_KEY"));
const me = wallet.account.address;
const balance = await publicClient.getBalance({ address: me });
console.log(`deployer / session key ${me}  ${formatEther(balance)} STT`);
if (balance < CLOCK_FUNDING + parseEther("5")) {
  throw new Error(`need at least ${formatEther(CLOCK_FUNDING + parseEther("5"))} STT to deploy and fund the clock`);
}

async function deploy(file, name, args, value = 0n) {
  const { abi, bytecode } = compile(file, name);
  const nonce = await publicClient.getTransactionCount({ address: me, blockTag: "pending" });
  const hash = await wallet.deployContract({ abi, bytecode, args, value, nonce });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`${name} deploy mined without an address (${hash})`);
  console.log(`${name.padEnd(11)} ${receipt.contractAddress}  ${explorerAddress(receipt.contractAddress)}`);
  return { address: receipt.contractAddress, abi };
}

const arena = await deploy("DeskArena.sol", "DeskArena", [POOL, REGISTRY, me]);

const deskBadge = await deploy("ArenaBadge.sol", "ArenaBadge", [
  "DreamDesk Desk",
  "DDESK",
  0, // Kind.Desk
  arena.address,
  me,
]);
const contributorBadge = await deploy("ArenaBadge.sol", "ArenaBadge", [
  "DreamDesk Contributor",
  "DCONTRIB",
  1, // Kind.Contributor
  arena.address,
  me,
]);

await send(wallet, {
  address: arena.address,
  abi: arena.abi,
  functionName: "setBadges",
  args: [deskBadge.address, contributorBadge.address],
});
console.log("badges wired into the arena");

const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
if (origin) {
  for (const [label, badge, path] of [
    ["desk", deskBadge, "/api/nft/desk/"],
    ["contributor", contributorBadge, "/api/nft/contributor/"],
  ]) {
    await send(wallet, {
      address: badge.address,
      abi: badge.abi,
      functionName: "setBaseURI",
      args: [origin + path],
    });
    console.log(`${label} badge baseURI -> ${origin + path}`);
  }
} else {
  console.log("NEXT_PUBLIC_APP_URL unset — run scripts/set-badge-uri.mjs once the app has a domain");
}

let clock = null;
if (!skipClock) {
  clock = await deploy("ArenaClock.sol", "ArenaClock", [arena.address, me], CLOCK_FUNDING);
  const clockBalance = await publicClient.getBalance({ address: clock.address });
  console.log(`clock funded with ${formatEther(clockBalance)} STT (Reactivity needs >= 32)`);
  const { hash } = await send(wallet, {
    address: clock.address,
    abi: clock.abi,
    functionName: "rearm",
    args: [],
  });
  const subId = await publicClient.readContract({
    address: clock.address,
    abi: clock.abi,
    functionName: "subscriptionId",
  });
  const armedFor = await publicClient.readContract({
    address: clock.address,
    abi: clock.abi,
    functionName: "armedForMs",
  });
  console.log(`clock armed  subscription ${subId}  fires ${new Date(Number(armedFor)).toISOString()}  ${hash}`);
}

const state = await publicClient.readContract({
  address: arena.address,
  abi: arena.abi,
  functionName: "arenaState",
});
console.log("\narena state:", {
  round: state.roundId.toString(),
  endsAt: new Date(Number(state.endsAt) * 1000).toISOString(),
  mid: state.mid.toString(),
  season: state.season.toString(),
});

console.log(`
Add to .env.local (and to the Vercel project env):

NEXT_PUBLIC_ARENA_ADDRESS=${arena.address}
NEXT_PUBLIC_DESK_BADGE_ADDRESS=${deskBadge.address}
NEXT_PUBLIC_CONTRIBUTOR_BADGE_ADDRESS=${contributorBadge.address}
NEXT_PUBLIC_ARENA_CLOCK_ADDRESS=${clock?.address ?? "<unchanged>"}
NEXT_PUBLIC_SESSION_ADDRESS=${me}
`);
