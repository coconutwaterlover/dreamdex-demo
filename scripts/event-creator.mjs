/**
 * Stands up our own dreamDEX MarketCreator and tries to register a SOMI series on the
 * arena's five-minute cadence. Read-only probes first, then the real deploy.
 */
import { parseAbi, padHex, stringToHex, formatEther } from "viem";
import { publicClient, send, walletFor, explorerAddress } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";
loadEnv();

const FACTORY = "0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B";
const CORE = "0x2802504314685D89bF6C992CA5a8e7cC78bc0294";
const HUB = "0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b";
const COLLATERAL = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E"; // testUsdc on 50312

const factoryAbi = parseAbi([
  "function createMarketCreator(address owner, address core, address adapter, uint32 operatorId, bytes32 venueId, (uint256 tickSize, uint256 minQuantity, uint256 lotSize) defaultBookParams) returns (address creator, address policy)",
  "function creatorCount() view returns (uint256)",
]);
const creatorAbi = parseAbi([
  "function registerSeries(uint32 seriesId, (address collateral, string asset, uint64 numericDecimals, uint64 intervalSec, uint64 settlementWindow) s)",
  "function armFirstRoll(uint32 seriesId, uint256 firesAtSec)",
  "function triggerRoll(uint32 seriesId)",
  "function seriesById(uint32 seriesId) view returns (address collateral, string asset, uint64 numericDecimals, uint64 intervalSec, uint64 settlementWindow)",
  "function latestExpiryBySeriesId(uint32 seriesId) view returns (uint64 expiry)",
  "function marketCount() view returns (uint256)",
  "function owner() view returns (address)",
  "function setReactivityGasParams(uint64 priorityFeePerGas, uint64 maxFeePerGas, uint64 gasLimit)",
]);

const wallet = walletFor(requireKey("SESSION_PRIVATE_KEY"));
const me = wallet.account.address;
const venueId = padHex(stringToHex("dreamdesk"), { size: 32 });
const bookParams = { tickSize: 1_000_000_000_000n, minQuantity: 10n ** 18n, lotSize: 10n ** 18n };

console.log(`deployer ${me}  ${formatEther(await publicClient.getBalance({ address: me }))} STT`);
console.log(`factory creatorCount before: ${await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "creatorCount" })}`);

const { receipt } = await send(wallet, {
  address: FACTORY,
  abi: factoryAbi,
  functionName: "createMarketCreator",
  args: [me, CORE, HUB, 0, venueId, bookParams],
});
console.log(`createMarketCreator mined in block ${receipt.blockNumber}`);

const count = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: "creatorCount" });
const creator = await publicClient.readContract({
  address: FACTORY,
  abi: parseAbi(["function creators(uint256) view returns (address)"]),
  functionName: "creators",
  args: [count - 1n],
});
console.log(`\nour MarketCreator ${creator}  ${explorerAddress(creator)}`);
console.log(`  owner ${await publicClient.readContract({ address: creator, abi: creatorAbi, functionName: "owner" })}`);

// Can we register the arena's cadence — SOMI, five minutes?
for (const [label, asset, intervalSec] of [
  ["SOMI @ 300s", "SOMI", 300n],
  ["BTC  @ 300s", "BTC", 300n],
  ["SOMI @ 900s", "SOMI", 900n],
]) {
  const seriesId = Number(intervalSec) + asset.length;
  try {
    await publicClient.simulateContract({
      account: wallet.account,
      address: creator,
      abi: creatorAbi,
      functionName: "registerSeries",
      args: [seriesId, { collateral: COLLATERAL, asset, numericDecimals: 8n, intervalSec, settlementWindow: 300n }],
    });
    console.log(`  registerSeries ${label}: SIMULATES OK`);
  } catch (e) {
    console.log(`  registerSeries ${label}: ${(e.shortMessage || e.message).split("\n")[0].slice(0, 120)}`);
  }
}
console.log(`\nNEXT_PUBLIC_MARKET_CREATOR=${creator}`);
