import type { RoundSnapshot, Vote } from "./types";

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export function fetchRound() {
  return fetch("/api/round", { cache: "no-store" }).then((r) => parse<RoundSnapshot>(r));
}

export function openRound() {
  return fetch("/api/round/open", { method: "POST" }).then((r) => parse<RoundSnapshot>(r));
}

export function postVote(body: { vote: Vote; address: string; message: string; signature: string }) {
  return fetch("/api/round/vote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => parse<RoundSnapshot>(r));
}

export function resolveRound() {
  return fetch("/api/round/resolve", { method: "POST" }).then((r) => parse<RoundSnapshot>(r));
}
