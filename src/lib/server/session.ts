import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@/lib/chain/config";
import { SESSION_ADDRESS, SOMNIA_RPC_URL } from "@/lib/chain/constants";

function sessionKey(): Hex {
  const raw = process.env.SESSION_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("SESSION_PRIVATE_KEY is not set");
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!/^0x[a-fA-F0-9]{64}$/.test(key)) throw new Error("SESSION_PRIVATE_KEY must be a 32-byte hex key");
  return key;
}

export function isExecutorConfigured(): boolean {
  return !!process.env.SESSION_PRIVATE_KEY?.trim();
}

function createSession() {
  const account = privateKeyToAccount(sessionKey());
  if (SESSION_ADDRESS && account.address.toLowerCase() !== SESSION_ADDRESS.toLowerCase()) {
    throw new Error(
      `SESSION_PRIVATE_KEY address ${account.address} does not match NEXT_PUBLIC_SESSION_ADDRESS`,
    );
  }
  const publicClient = createPublicClient({
    chain: somniaShannon,
    transport: http(SOMNIA_RPC_URL),
  });
  const wallet = createWalletClient({
    account,
    chain: somniaShannon,
    transport: http(SOMNIA_RPC_URL),
  });
  return { account, publicClient, wallet, writeChain: Promise.resolve() as Promise<void> };
}

type SessionCache = ReturnType<typeof createSession>;

const g = globalThis as typeof globalThis & { __dreamdeskSession?: SessionCache };

function cache(): SessionCache {
  if (!g.__dreamdeskSession) g.__dreamdeskSession = createSession();
  return g.__dreamdeskSession;
}

export function getSessionAccount() {
  return cache().account;
}

export function getPublicClient() {
  if (!isExecutorConfigured()) {
    return createPublicClient({
      chain: somniaShannon,
      transport: http(SOMNIA_RPC_URL),
    });
  }
  return cache().publicClient;
}

export function getSessionWallet() {
  return cache().wallet;
}

export async function withSessionWrite<T>(fn: () => Promise<T>): Promise<T> {
  const c = cache();
  const prev = c.writeChain;
  let release!: () => void;
  c.writeChain = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

function isNonceError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return /nonce/i.test(msg) && /too low|lower than|already been used|already used|NonceTooLow/i.test(msg);
}

export async function writeSessionContract(params: {
  address: `0x${string}`;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  gas?: bigint;
}): Promise<Hex> {
  return withSessionWrite(async () => {
    const wallet = getSessionWallet();
    const publicClient = getPublicClient();
    const account = getSessionAccount();
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const nonce = await publicClient.getTransactionCount({
          address: account.address,
          blockTag: "pending",
        });
        const hash = await wallet.writeContract({
          address: params.address,
          abi: params.abi,
          functionName: params.functionName,
          args: params.args,
          value: params.value,
          gas: params.gas,
          nonce,
        } as Parameters<typeof wallet.writeContract>[0]);
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "reverted") {
          throw new Error("Session transaction reverted");
        }
        return hash;
      } catch (err) {
        lastErr = err;
        if (!isNonceError(err) || attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Session write failed");
  });
}
