"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ROUND_SECONDS } from "@/lib/chain/constants";
import type { ArenaSnapshot, Choice, MyStake } from "@/lib/arena/types";
import { CODE_CHOICE } from "@/lib/arena/types";

export type ArenaFeed = ArenaSnapshot & {
  myVotes: Record<number, Choice>;
  myStakes: MyStake[];
  error: string | null;
  loading: boolean;
  /** Ticks down locally between polls so the clock never looks frozen. */
  secondsLeft: number;
  refresh: () => Promise<void>;
};

const POLL_MS = 4000;

function emptyFeed(): ArenaSnapshot {
  const now = Math.floor(Date.now() / 1000);
  const roundId = Math.floor(now / ROUND_SECONDS);
  return {
    configured: false,
    state: {
      roundId,
      endsAt: (roundId + 1) * ROUND_SECONDS,
      lastTickedRound: roundId,
      mid: 0,
      season: 0,
      seasonRound: 0,
      deskCount: 0,
      voterCount: 0,
      createBondWei: "0",
      sessionKey: "",
      behind: false,
    },
    desks: [],
    contributors: [],
    clock: null,
    scale: null,
    realBooks: [],
    stake: null,
    pools: [],
    stakers: [],
    mirror: { entries: [], since: Date.now() },
    addresses: {
      arena: null,
      deskBadge: null,
      contributorBadge: null,
      pool: "",
      registry: "",
    },
  };
}

export function useArena(voter?: string): ArenaFeed {
  const [snapshot, setSnapshot] = useState<ArenaSnapshot>(emptyFeed);
  const [myVotes, setMyVotes] = useState<Record<number, Choice>>({});
  const [myStakes, setMyStakes] = useState<MyStake[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const query = voter ? `?voter=${voter}` : "";
      const res = await fetch(`/api/arena${query}`, { cache: "no-store" });
      const data = (await res.json()) as ArenaSnapshot & {
        myVotes?: Record<string, number>;
        myStakes?: MyStake[];
        error?: string;
      };
      setSnapshot(data);
      const votes: Record<number, Choice> = {};
      for (const [deskId, code] of Object.entries(data.myVotes ?? {})) {
        votes[Number(deskId)] = CODE_CHOICE[code] ?? "none";
      }
      setMyVotes(votes);
      setMyStakes(data.myStakes ?? []);
      setError(data.error ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the arena");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [voter]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Local second hand: the poll is every few seconds, the countdown is every one.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = useMemo(() => {
    return Math.max(0, snapshot.state.endsAt - Math.floor(now / 1000));
  }, [snapshot.state.endsAt, now]);

  // The round rolled over locally — pull the new one immediately rather than waiting.
  const rolled = useRef(snapshot.state.roundId);
  useEffect(() => {
    if (secondsLeft === 0 && rolled.current === snapshot.state.roundId) {
      rolled.current = -1;
      void refresh();
    }
    if (secondsLeft > 0) rolled.current = snapshot.state.roundId;
  }, [secondsLeft, snapshot.state.roundId, refresh]);

  return { ...snapshot, myVotes, myStakes, error, loading, secondsLeft, refresh };
}
