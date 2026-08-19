/**
 * Repoints both badge collections' tokenURI base at the current app origin.
 * Run after the app moves domain, otherwise explorers resolve metadata at the old host.
 *
 *   NEXT_PUBLIC_APP_URL=https://... node scripts/set-badge-uri.mjs
 */
import { compile } from "./lib/compile.mjs";
import { publicClient, send, walletFor, explorerTx } from "./lib/chain.mjs";
import { loadEnv, requireKey } from "./lib/env.mjs";

loadEnv();

const origin = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
if (!origin) throw new Error("Set NEXT_PUBLIC_APP_URL to the public origin");

const { abi } = compile("ArenaBadge.sol", "ArenaBadge");
const admin = walletFor(requireKey("SESSION_PRIVATE_KEY"));

const targets = [
  ["desk", process.env.NEXT_PUBLIC_DESK_BADGE_ADDRESS, "/api/nft/desk/"],
  ["contributor", process.env.NEXT_PUBLIC_CONTRIBUTOR_BADGE_ADDRESS, "/api/nft/contributor/"],
];

for (const [label, address, path] of targets) {
  if (!address) {
    console.log(`${label}: address not set, skipping`);
    continue;
  }
  const want = origin + path;
  const current = await publicClient.readContract({ address, abi, functionName: "baseURI" });
  if (current === want) {
    console.log(`${label}: already ${want}`);
    continue;
  }
  const { hash } = await send(admin, { address, abi, functionName: "setBaseURI", args: [want] });
  console.log(`${label}: ${current || "(unset)"} -> ${want}  ${explorerTx(hash)}`);
}
