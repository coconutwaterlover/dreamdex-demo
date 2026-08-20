/** Deploys the parimutuel StakePool against the running arena. Read-only layer — the
 * arena is untouched, so no migration and no redeploy of anything already live. */
import { formatEther, parseEther } from "viem";
import { compile } from "./lib/compile.mjs";
import { publicClient, send, walletFor, explorerAddress } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";

loadEnv();
const ARENA = process.env.NEXT_PUBLIC_ARENA_ADDRESS;
if (!ARENA) throw new Error("NEXT_PUBLIC_ARENA_ADDRESS not set");

const wallet = walletFor(requireKey("SESSION_PRIVATE_KEY"));
const me = wallet.account.address;
const treasury = (process.env.TREASURY_ADDRESS || me);
console.log(`deployer ${me}  ${formatEther(await publicClient.getBalance({ address: me }))} STT`);
console.log(`arena    ${ARENA}\ntreasury ${treasury}`);

const { abi, bytecode } = compile("StakePool.sol", "StakePool");
const nonce = await publicClient.getTransactionCount({ address: me, blockTag: "pending" });
const hash = await wallet.deployContract({ abi, bytecode, args: [ARENA, treasury], nonce });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const address = receipt.contractAddress;
console.log(`\nStakePool ${address}  ${explorerAddress(address)}`);

const cfg = await publicClient.readContract({ address, abi, functionName: "config" });
console.log("config:", {
  lockSeconds: cfg.lockSeconds.toString(),
  minStake: formatEther(cfg.minStake) + " STT",
  ownerRakeBps: cfg.ownerRakeBps,
  treasuryRakeBps: cfg.treasuryRakeBps,
});

// Seed each live desk so the first rounds aren't dust.
const seedPer = parseEther(process.env.SEED_STT ?? "0.2");
if (seedPer > 0n) {
  const arenaAbi = compile("DeskArena.sol", "DeskArena").abi;
  const count = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "deskCount" });
  for (let i = 0n; i < count; i++) {
    const { hash: h } = await send(wallet, { address, abi, functionName: "seed", args: [i], value: seedPer });
    console.log(`seeded desk ${i} with ${formatEther(seedPer)} STT  ${h}`);
  }
}

console.log(`\nAdd to .env.local and Vercel:\nNEXT_PUBLIC_STAKE_POOL_ADDRESS=${address}`);
