import { type Address, type Hex } from "viem";

export const OPERATOR_REGISTRY = "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A" as const satisfies Address;

/** SOMI:USDso SpotPool on Shannon — display / Day-2 execute only */
export const SOMI_USDSO_POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4" as const satisfies Address;

export const PLACE_ORDER_FOR = "0x80054449" as const satisfies Hex;
export const CANCEL_ORDER_FOR = "0xe37b444b" as const satisfies Hex;
export const REDUCE_ORDER_FOR = "0x364c2587" as const satisfies Hex;

export const OPERATOR_SELECTORS = [PLACE_ORDER_FOR, CANCEL_ORDER_FOR, REDUCE_ORDER_FOR] as const;

export const DEFAULT_RPC = "https://api.infra.testnet.somnia.network";

export const HOUSE_OWNER_ADDRESS = process.env.NEXT_PUBLIC_HOUSE_OWNER_ADDRESS as Address | undefined;
export const SESSION_ADDRESS = process.env.NEXT_PUBLIC_SESSION_ADDRESS as Address | undefined;
export const SOMNIA_RPC_URL = process.env.NEXT_PUBLIC_SOMNIA_RPC_URL ?? DEFAULT_RPC;

export const FALLBACK_OWNER_LABEL = "0xA41c…9F2e";
export const FALLBACK_SESSION_LABEL = "0x7Bc1…D04a";

export function isChainConfigured(): boolean {
  return isHexAddress(HOUSE_OWNER_ADDRESS) && isHexAddress(SESSION_ADDRESS);
}

const ZERO = "0x0000000000000000000000000000000000000000";

export function isHexAddress(value: string | undefined): value is Address {
  return !!value && /^0x[a-fA-F0-9]{40}$/.test(value) && value.toLowerCase() !== ZERO;
}
