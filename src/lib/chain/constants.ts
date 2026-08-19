import { type Address, type Hex } from "viem";

export const OPERATOR_REGISTRY = "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A" as const satisfies Address;

/** SOMI:USDso SpotPool on Shannon — the arena marks every desk against this book. */
export const SOMI_USDSO_POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4" as const satisfies Address;

export const PLACE_ORDER_FOR = "0x80054449" as const satisfies Hex;
export const CANCEL_ORDER_FOR = "0xe37b444b" as const satisfies Hex;
export const REDUCE_ORDER_FOR = "0x364c2587" as const satisfies Hex;

export const OPERATOR_SELECTORS = [PLACE_ORDER_FOR, CANCEL_ORDER_FOR, REDUCE_ORDER_FOR] as const;

export const DEFAULT_RPC = "https://api.infra.testnet.somnia.network";
export const DEFAULT_DREAMDEX_API = "https://stg.api.dreamdex.io/v0";
export const SHANNON_EXPLORER = "https://shannon-explorer.somnia.network";

/** Where a contributor goes to trade their own call for real. */
export const DREAMDEX_APP_URL = "https://app.dreamdex.io";
export const DREAMDEX_DOCS_URL = "https://docs.dreamdex.io";

export const ARENA_ADDRESS = process.env.NEXT_PUBLIC_ARENA_ADDRESS as Address | undefined;
export const DESK_BADGE_ADDRESS = process.env.NEXT_PUBLIC_DESK_BADGE_ADDRESS as Address | undefined;
export const CONTRIBUTOR_BADGE_ADDRESS = process.env.NEXT_PUBLIC_CONTRIBUTOR_BADGE_ADDRESS as
  | Address
  | undefined;
export const ARENA_CLOCK_ADDRESS = process.env.NEXT_PUBLIC_ARENA_CLOCK_ADDRESS as Address | undefined;

export const HOUSE_OWNER_ADDRESS = process.env.NEXT_PUBLIC_HOUSE_OWNER_ADDRESS as Address | undefined;
export const SESSION_ADDRESS = process.env.NEXT_PUBLIC_SESSION_ADDRESS as Address | undefined;
export const SOMNIA_RPC_URL = process.env.NEXT_PUBLIC_SOMNIA_RPC_URL ?? DEFAULT_RPC;
export const DREAMDEX_API_URL = process.env.DREAMDEX_API_URL ?? DEFAULT_DREAMDEX_API;

export const ROUND_SECONDS = 300;
export const SEASON_ROUNDS = 288;

const ZERO = "0x0000000000000000000000000000000000000000";

export function isHexAddress(value: string | undefined): value is Address {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value) && value.toLowerCase() !== ZERO;
}

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
