import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";

const require = createRequire(import.meta.url);
const solc = require("solc");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const rpc = process.env.NEXT_PUBLIC_SOMNIA_RPC_URL ?? "https://api.infra.testnet.somnia.network";
const rawKey = (process.env.SESSION_PRIVATE_KEY ?? process.env.PRIVATE_KEY ?? "").trim();
if (!rawKey) {
  console.error("Set SESSION_PRIVATE_KEY (or PRIVATE_KEY) in .env.local");
  process.exit(1);
}
const privateKey = /** @type {`0x${string}`} */ (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);

const source = readFileSync(join(root, "contracts/RoundClock.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "RoundClock.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors?.some((e) => e.severity === "error")) {
  console.error(output.errors.map((e) => e.formattedMessage).join("\n"));
  process.exit(1);
}
const artifact = output.contracts["RoundClock.sol"].RoundClock;
const bytecode = /** @type {`0x${string}`} */ (`0x${artifact.evm.bytecode.object}`);
if (bytecode === "0x") {
  console.error("Compiler returned empty bytecode");
  process.exit(1);
}

const chain = defineChain({
  id: 50312,
  name: "Somnia Shannon",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const account = privateKeyToAccount(privateKey);
const wallet = createWalletClient({ account, chain, transport: http(rpc) });
const publicClient = createPublicClient({ chain, transport: http(rpc) });

const hash = await wallet.deployContract({
  abi: artifact.abi,
  bytecode,
  account,
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) {
  console.error("Deploy tx mined without a contract address", hash);
  process.exit(1);
}

console.log("RoundClock deployed");
console.log("tx     ", hash);
console.log("address", receipt.contractAddress);
console.log("\nAdd to .env.local:\nNEXT_PUBLIC_ROUND_CLOCK_ADDRESS=" + receipt.contractAddress);
