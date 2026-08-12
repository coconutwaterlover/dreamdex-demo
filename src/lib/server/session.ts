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

export function getSessionAccount() {
  const account = privateKeyToAccount(sessionKey());
  if (SESSION_ADDRESS && account.address.toLowerCase() !== SESSION_ADDRESS.toLowerCase()) {
    throw new Error(
      `SESSION_PRIVATE_KEY address ${account.address} does not match NEXT_PUBLIC_SESSION_ADDRESS`,
    );
  }
  return account;
}

export function getPublicClient() {
  return createPublicClient({
    chain: somniaShannon,
    transport: http(SOMNIA_RPC_URL),
  });
}

export function getSessionWallet() {
  const account = getSessionAccount();
  return createWalletClient({
    account,
    chain: somniaShannon,
    transport: http(SOMNIA_RPC_URL),
  });
}
