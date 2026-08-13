import type { Vote } from "./types";

export type Fruit = {
  id: string;
  label: string;
  src: string;
};

export const FRUITS: Fruit[] = [
  { id: "banana", label: "Banana", src: "/badges/banana.svg" },
  { id: "coconut", label: "Coconut", src: "/badges/coconut.svg" },
  { id: "watermelon", label: "Watermelon", src: "/badges/watermelon.svg" },
  { id: "kiwi", label: "Kiwi", src: "/badges/kiwi.svg" },
  { id: "pineapple", label: "Pineapple", src: "/badges/pineapple.svg" },
  { id: "papaya", label: "Papaya", src: "/badges/papaya.svg" },
  { id: "dragonfruit", label: "Dragon fruit", src: "/badges/dragonfruit.svg" },
  { id: "mango", label: "Mango", src: "/badges/mango.svg" },
];

/** Bid = kiwi, Ask = watermelon, Hold = banana. */
export const VOTE_FRUIT: Record<Vote, Fruit> = {
  bid: FRUITS[3],
  ask: FRUITS[2],
  hold: FRUITS[0],
};

/** One fruit per token, cycling the eight pixel arts. */
export function fruitForToken(tokenId: number | bigint | null | undefined): Fruit | null {
  if (tokenId == null) return null;
  const id = Number(tokenId);
  if (!Number.isFinite(id) || id < 1) return null;
  return FRUITS[(id - 1) % FRUITS.length];
}

export function appOrigin(requestUrl?: string): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin;
    } catch {
      // ignore
    }
  }
  return "http://localhost:3000";
}
