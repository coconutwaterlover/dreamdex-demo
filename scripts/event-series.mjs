/** Registers the SOMI five-minute series on our creator, funds it, and arms the first
 * roll. Each step reports separately so a failure names itself. */
import { parseAbi, parseEther, formatEther } from "viem";
import { publicClient, send, walletFor, explorerTx } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";
loadEnv();

const CREATOR = process.env.MARKET_CREATOR ?? "0xD1ab8e8AF68124974a96B5CD122c204ad4fb5237";
const COLLATERAL = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E";
const SERIES = 305;
const INTERVAL = 300n;

const abi = parseAbi([
  "function registerSeries(uint32 seriesId, (address collateral, string asset, uint64 numericDecimals, uint64 intervalSec, uint64 settlementWindow) s)",
  "function armFirstRoll(uint32 seriesId, uint256 firesAtSec)",
  "function firstRollArmed(uint32 seriesId) view returns (bool armed)",
  "function seriesById(uint32 seriesId) view returns (address collateral, string asset, uint64 numericDecimals, uint64 intervalSec, uint64 settlementWindow)",
  "function latestExpiryBySeriesId(uint32 seriesId) view returns (uint64 expiry)",
  "function marketCount() view returns (uint256)",
  "function armedBoundary() view returns (uint256)",
  "function setReactivityGasParams(uint64 priorityFeePerGas, uint64 maxFeePerGas, uint64 gasLimit)",
]);

const w = walletFor(requireKey("SESSION_PRIVATE_KEY"));
const step = async (label, fn) => {
  try { const r = await fn(); console.log(`OK    ${label}${r ? "  " + r : ""}`); return true; }
  catch (e) { console.log(`FAIL  ${label}: ${(e.shortMessage || e.message).split("\n")[0].slice(0, 160)}`); return false; }
};

const existing = await publicClient.readContract({ address: CREATOR, abi, functionName: "seriesById", args: [SERIES] });
if (!existing[1]) {
  await step("registerSeries SOMI @ 300s", async () => {
    const { hash } = await send(w, { address: CREATOR, abi, functionName: "registerSeries",
      args: [SERIES, { collateral: COLLATERAL, asset: "SOMI", numericDecimals: 8n, intervalSec: INTERVAL, settlementWindow: 300n }] });
    return explorerTx(hash);
  });
} else console.log(`OK    series ${SERIES} already registered: ${existing[1]} every ${existing[3]}s`);

// The creator owns its own Reactivity subscription, exactly like our ArenaClock — so it
// needs the 32 STT bond plus headroom for callbacks and oracle scheduling.
const bal = await publicClient.getBalance({ address: CREATOR });
console.log(`      creator balance ${formatEther(bal)} STT`);
if (bal < parseEther("40")) {
  await step("fund the creator with 45 STT", async () => {
    const hash = await w.sendTransaction({ to: CREATOR, value: parseEther("45") });
    await publicClient.waitForTransactionReceipt({ hash });
    return explorerTx(hash);
  });
}

await step("setReactivityGasParams", async () => {
  const { hash } = await send(w, { address: CREATOR, abi, functionName: "setReactivityGasParams", args: [1n, 0n, 30_000_000n] });
  return explorerTx(hash);
});

const now = Math.floor(Date.now() / 1000);
const firesAt = BigInt(Math.ceil((now + 90) / Number(INTERVAL)) * Number(INTERVAL));
console.log(`      arming first roll for ${new Date(Number(firesAt) * 1000).toISOString()}`);
await step("armFirstRoll", async () => {
  const { hash } = await send(w, { address: CREATOR, abi, functionName: "armFirstRoll", args: [SERIES, firesAt] });
  return explorerTx(hash);
});

console.log(`\narmed=${await publicClient.readContract({ address: CREATOR, abi, functionName: "firstRollArmed", args: [SERIES] })}`);
console.log(`armedBoundary=${await publicClient.readContract({ address: CREATOR, abi, functionName: "armedBoundary" })}`);
console.log(`marketCount=${await publicClient.readContract({ address: CREATOR, abi, functionName: "marketCount" })}`);
