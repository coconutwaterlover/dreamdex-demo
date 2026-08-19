/**
 * Arms a desk for real orders: grants the arena's session key in dreamDEX's
 * OperatorPermissionsRegistry, approves the quote token for the pool, and flips the
 * desk's wantsLive flag. Run as the desk owner.
 *
 *   node scripts/arm-desk.mjs <deskId>
 */
import { formatUnits, maxUint256 } from "viem";
import { compile } from "./lib/compile.mjs";
import { publicClient, send, walletFor, explorerTx } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";

loadEnv();

const POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4";
const REGISTRY = "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A";
const SELECTORS = ["0x80054449", "0xe37b444b", "0x364c2587"];
const ARENA = process.env.NEXT_PUBLIC_ARENA_ADDRESS;
const SESSION = process.env.NEXT_PUBLIC_SESSION_ADDRESS;
const deskId = BigInt(process.argv[2] ?? "1");

const { abi: arenaAbi } = compile("DeskArena.sol", "DeskArena");

const registryAbi = [
  {
    type: "function",
    name: "setOperatorApprovalGlobal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "selectors", type: "bytes4[]" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isGloballyApproved",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];
const poolAbi = [
  {
    type: "function",
    name: "getPoolParams",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "baseToken_", type: "address" },
      { name: "quoteToken_", type: "address" },
      { name: "makerFeeBpsTimes1k_", type: "uint256" },
      { name: "takerFeeBpsTimes1k_", type: "uint256" },
      { name: "tickSize_", type: "uint256" },
      { name: "minQuantity_", type: "uint256" },
      { name: "lotSize_", type: "uint256" },
    ],
  },
];
const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
];

const owner = walletFor(requireKey("HOUSE_OWNER_PRIVATE_KEY"));
const me = owner.account.address;
console.log(`desk owner ${me}`);

const desk = await publicClient.readContract({
  address: ARENA,
  abi: arenaAbi,
  functionName: "deskView",
  args: [deskId, await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "currentRound" })],
});
if (desk.owner.toLowerCase() !== me.toLowerCase()) {
  throw new Error(`desk ${deskId} belongs to ${desk.owner}, not ${me}`);
}
console.log(`desk #${deskId} "${desk.name}"  wantsLive=${desk.wantsLive}  armed=${desk.armed}`);

const params = await publicClient.readContract({ address: POOL, abi: poolAbi, functionName: "getPoolParams" });
const [baseToken, quoteToken, , , tickSize, minQuantity, lotSize] = params;
const [symbol, decimals, balance, allowance] = await Promise.all([
  publicClient.readContract({ address: quoteToken, abi: erc20Abi, functionName: "symbol" }).catch(() => "?"),
  publicClient.readContract({ address: quoteToken, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
  publicClient.readContract({ address: quoteToken, abi: erc20Abi, functionName: "balanceOf", args: [me] }),
  publicClient.readContract({ address: quoteToken, abi: erc20Abi, functionName: "allowance", args: [me, POOL] }),
]);
console.log(`base  ${baseToken}`);
console.log(`quote ${quoteToken} (${symbol})  balance ${formatUnits(balance, decimals)}  allowance ${allowance > 0n ? "set" : "none"}`);
console.log(`tick ${tickSize}  minQuantity ${formatUnits(minQuantity, 18)}  lot ${formatUnits(lotSize, 18)}`);

const granted = await publicClient.readContract({
  address: REGISTRY,
  abi: registryAbi,
  functionName: "isGloballyApproved",
  args: [me, SESSION, SELECTORS[0]],
});
if (!granted) {
  const { hash } = await send(owner, {
    address: REGISTRY,
    abi: registryAbi,
    functionName: "setOperatorApprovalGlobal",
    args: [SESSION, SELECTORS, true],
  });
  console.log(`granted session key ${SESSION}  ${explorerTx(hash)}`);
} else {
  console.log("session key already granted");
}

if (allowance === 0n) {
  const { hash } = await send(owner, {
    address: quoteToken,
    abi: erc20Abi,
    functionName: "approve",
    args: [POOL, maxUint256],
  });
  console.log(`approved ${symbol} for the pool  ${explorerTx(hash)}`);
}

if (!desk.wantsLive) {
  const { hash } = await send(owner, {
    address: ARENA,
    abi: arenaAbi,
    functionName: "setWantsLive",
    args: [deskId, true],
  });
  console.log(`desk set live  ${explorerTx(hash)}`);
}

const armed = await publicClient.readContract({ address: ARENA, abi: arenaAbi, functionName: "deskIsArmed", args: [deskId] });
console.log(`\ndesk #${deskId} armed on-chain: ${armed}`);
if (balance === 0n) {
  console.log(`NOTE: owner holds no ${symbol}, so a winning Buy cannot auto-pull. Sells still work (the session key attaches msg.value).`);
}
