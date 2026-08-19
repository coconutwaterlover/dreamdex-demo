import { type Address, type Hex } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000";

export function isHexAddress(value: string | undefined): value is Address {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value) && value.toLowerCase() !== ZERO;
}

export const OPERATOR_REGISTRY = "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A" as const satisfies Address;

/** SOMI:USDso SpotPool on Shannon — the arena marks every desk against this book. */
export const SOMI_USDSO_POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4" as const satisfies Address;

export const PLACE_ORDER_FOR = "0x80054449" as const satisfies Hex;
export const CANCEL_ORDER_FOR = "0xe37b444b" as const satisfies Hex;
export const REDUCE_ORDER_FOR = "0x364c2587" as const satisfies Hex;

export const OPERATOR_SELECTORS = [PLACE_ORDER_FOR, CANCEL_ORDER_FOR, REDUCE_ORDER_FOR] as const;

export const DEFAULT_RPC = "https://api.infra.testnet.somnia.network";
export const SHANNON_EXPLORER = "https://shannon-explorer.somnia.network";

/** Where a contributor goes to trade their own call for real. */
export const DREAMDEX_APP_URL = "https://app.dreamdex.io";
export const DREAMDEX_DOCS_URL = "https://docs.dreamdex.io";

/**
 * The live Shannon deployment. These are public contract addresses, not secrets, so
 * they ship as defaults — the app is fully readable with no environment at all, and
 * an env var still wins for anyone pointing at their own deployment.
 */
export const SHANNON_DEPLOYMENT = {
  arena: "0x86913db4d9a49848e6480d09b0ece612ff2b431e",
  deskBadge: "0x765e2b5bf6548ac514f31130ca07babd4dbb56b8",
  contributorBadge: "0xee84b5fc635d590e5a9b0ce7396d4eb8bb8d0966",
  clock: "0x5d299bd6f63546b14e3b4367974ad94819e1a643",
  sessionKey: "0x4b051B5D2038B5054f73020bE1F99b738D539580",
} as const;

function configured(value: string | undefined, fallback: string): Address | undefined {
  const chosen = isHexAddress(value) ? value : fallback;
  return isHexAddress(chosen) ? chosen : undefined;
}

export const ARENA_ADDRESS = configured(process.env.NEXT_PUBLIC_ARENA_ADDRESS, SHANNON_DEPLOYMENT.arena);
export const DESK_BADGE_ADDRESS = configured(
  process.env.NEXT_PUBLIC_DESK_BADGE_ADDRESS,
  SHANNON_DEPLOYMENT.deskBadge,
);
export const CONTRIBUTOR_BADGE_ADDRESS = configured(
  process.env.NEXT_PUBLIC_CONTRIBUTOR_BADGE_ADDRESS,
  SHANNON_DEPLOYMENT.contributorBadge,
);
export const ARENA_CLOCK_ADDRESS = configured(
  process.env.NEXT_PUBLIC_ARENA_CLOCK_ADDRESS,
  SHANNON_DEPLOYMENT.clock,
);

export const HOUSE_OWNER_ADDRESS = process.env.NEXT_PUBLIC_HOUSE_OWNER_ADDRESS as Address | undefined;
export const SESSION_ADDRESS = configured(
  process.env.NEXT_PUBLIC_SESSION_ADDRESS,
  SHANNON_DEPLOYMENT.sessionKey,
);
export const SOMNIA_RPC_URL = process.env.NEXT_PUBLIC_SOMNIA_RPC_URL ?? DEFAULT_RPC;

export const ROUND_SECONDS = 300;
export const SEASON_ROUNDS = 288;

export function isArenaConfigured(): boolean {
  return isHexAddress(ARENA_ADDRESS);
}

export function isDeskBadgeConfigured(): boolean {
  return isHexAddress(DESK_BADGE_ADDRESS);
}

export function isContributorBadgeConfigured(): boolean {
  return isHexAddress(CONTRIBUTOR_BADGE_ADDRESS);
}

export function isClockConfigured(): boolean {
  return isHexAddress(ARENA_CLOCK_ADDRESS);
}

export function addressHref(address: string | undefined): string | null {
  return address ? `${SHANNON_EXPLORER}/address/${address}` : null;
}

export function txHref(hash: string | undefined | null): string | null {
  return hash ? `${SHANNON_EXPLORER}/tx/${hash}` : null;
}

export function badgeTokenHref(collection: Address | undefined, tokenId: number | bigint): string | null {
  if (!collection) return null;
  return `${SHANNON_EXPLORER}/token/${collection}/instance/${tokenId.toString()}`;
}
