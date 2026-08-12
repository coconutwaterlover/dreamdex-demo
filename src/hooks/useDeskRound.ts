"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cloneSeedVoters,
  EMPTY_TALLY,
  INITIAL_MID,
  MOCK_TX,
  pickCrowdVote,
  ROUND_SECONDS,
  stamp,
  tallyWinner,
} from "@/lib/desk/round";
import { scoreVoters } from "@/lib/desk/scoring";
import type { DeskView, Phase, TapeItem, Vote, VoteTally, Voter } from "@/lib/desk/types";

type HouseActions = {
  ownerLabel: string;
  sessionLabel: string;
  chainEnabled: boolean;
  ownerConnected: boolean;
  isHouseOwner: boolean;
  wrongOwner: boolean;
  approved: boolean | undefined;
  connectOwner: () => Promise<{ address?: string; isHouseOwner: boolean }>;
  grantSession: () => Promise<unknown>;
  revokeDesk: () => Promise<unknown>;
};

export function useDeskRound(house: HouseActions) {
  const [phase, setPhase] = useState<Phase>("boot");
  const [busy, setBusy] = useState(false);
  const [autoplaying, setAutoplaying] = useState(false);
  const [mid, setMid] = useState(INITIAL_MID);
  const [roundMid, setRoundMid] = useState(INITIAL_MID);
  const [secs, setSecs] = useState(ROUND_SECONDS);
  const [votes, setVotes] = useState<VoteTally>(EMPTY_TALLY);
  const votesRef = useRef(votes);
  const [myVote, setMyVote] = useState<Vote | null>(null);
  const [winner, setWinner] = useState<Vote | null>(null);
  const [signProgress, setSignProgress] = useState(0);
  const [voters, setVoters] = useState<Voter[]>(cloneSeedVoters);
  const [round, setRound] = useState(0);
  const stopRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crowdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoplayingRef = useRef(false);

  const [tape, setTape] = useState<TapeItem[]>([
    { id: "t0", t: "00:00", label: "Desk cold — grant a hot key to open Swarm", tone: "neutral" },
  ]);

  const chainArmed = house.approved === true;

  const desk: DeskView = useMemo(() => {
    const revoked = phase === "revoked" || phase === "blocked";
    const approved = chainArmed && !revoked
      ? true
      : ["armed", "voting", "resolving", "signing", "scored"].includes(phase);
    const owner = house.ownerConnected || phase !== "boot" || chainArmed;
    const session = chainArmed || (phase !== "boot" && phase !== "connected");
    return {
      owner,
      session,
      approved: approved && !revoked,
      revoked,
      live: approved && !revoked,
    };
  }, [chainArmed, house.ownerConnected, phase]);

  useEffect(() => {
    votesRef.current = votes;
  }, [votes]);

  useEffect(() => {
    autoplayingRef.current = autoplaying;
  }, [autoplaying]);

  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (crowdRef.current) clearInterval(crowdRef.current);
    tickRef.current = null;
    crowdRef.current = null;
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const log = useCallback((label: string, tone: TapeItem["tone"] = "neutral") => {
    setTape((prev) => [{ id: `tape-${Date.now()}-${Math.random()}`, t: stamp(), label, tone }, ...prev].slice(0, 12));
  }, []);

  async function wait(ms = 420) {
    setBusy(true);
    await new Promise((r) => setTimeout(r, ms));
    if (stopRef.current) throw new Error("stopped");
    setBusy(false);
  }

  useEffect(() => {
    if (!desk.live) return;
    const id = setInterval(() => {
      setMid((m) => {
        const delta = (Math.random() - 0.5) * 0.0003;
        return Math.max(0.17, Math.min(0.2, +(m + delta).toFixed(4)));
      });
    }, 900);
    return () => clearInterval(id);
  }, [desk.live]);

  const prevApproved = useRef(house.approved);
  useEffect(() => {
    if (autoplaying || house.approved === undefined) return;
    const prev = prevApproved.current;
    prevApproved.current = house.approved;
    if (prev === house.approved) return;
    if (house.approved) {
      setPhase((p) =>
        p === "boot" || p === "connected" || p === "revoked" || p === "blocked" ? "armed" : p,
      );
      return;
    }
    setPhase((p) => {
      if (p === "voting" || p === "resolving" || p === "signing" || p === "armed" || p === "scored") {
        clearTimers();
        return "revoked";
      }
      if (house.ownerConnected && house.isHouseOwner && p === "boot") return "connected";
      return p;
    });
  }, [autoplaying, clearTimers, house.approved, house.isHouseOwner, house.ownerConnected]);

  async function connect() {
    if (house.chainEnabled) {
      setBusy(true);
      try {
        const result = await house.connectOwner();
        if (!result.isHouseOwner) {
          log("Connected wallet is not the house owner", "warn");
          return;
        }
        log(`Owner ${house.ownerLabel} connected`, "live");
        if (house.approved) setPhase("armed");
        else setPhase("connected");
      } catch (err) {
        log(err instanceof Error ? err.message : "Connect failed", "warn");
      } finally {
        setBusy(false);
      }
      return;
    }
    await wait(450);
    setPhase("connected");
    log(`Owner ${house.ownerLabel} connected`, "live");
  }

  async function armDesk() {
    if (house.chainEnabled) {
      if (!house.isHouseOwner) {
        log("Only the house owner can grant the session key", "warn");
        return;
      }
      setBusy(true);
      try {
        log("Granting place · cancel · reduce on registry…", "live");
        await house.grantSession();
        setPhase("armed");
        log(`Session ${house.sessionLabel} granted place · cancel · reduce`, "ok");
      } catch (err) {
        log(err instanceof Error ? err.message : "Grant failed", "warn");
      } finally {
        setBusy(false);
      }
      return;
    }
    await wait(500);
    setPhase("armed");
    log(`Session ${house.sessionLabel} granted place · cancel · reduce`, "ok");
  }

  function castVote(v: Vote) {
    if (phase !== "voting" || myVote || busy || autoplaying) return;
    setMyVote(v);
    setVotes((prev) => ({ ...prev, [v]: prev[v] + 1 }));
    setVoters((list) => list.map((u) => (u.id === "you" ? { ...u, vote: v } : u)));
    log(`You voted ${v.toUpperCase()}`, "live");
  }

  function startRound(opts?: { preVote?: Vote }) {
    if (house.chainEnabled && !autoplaying && house.approved === false) {
      log("Desk is not armed on-chain", "warn");
      return;
    }
    clearTimers();
    const n = round + 1;
    setRound(n);
    setPhase("voting");
    setSecs(ROUND_SECONDS);
    setVotes({ bid: 2, ask: 1, hold: 1 });
    setMyVote(opts?.preVote ?? null);
    setWinner(null);
    setSignProgress(0);
    setRoundMid(mid);
    setVoters((list) =>
      list.map((u) => ({
        ...u,
        vote: u.id === "you" ? opts?.preVote : undefined,
        delta: undefined,
      })),
    );
    if (opts?.preVote) {
      setVotes((prev) => ({ ...prev, [opts.preVote!]: prev[opts.preVote!] + 1 }));
      setVoters((list) => list.map((u) => (u.id === "you" ? { ...u, vote: opts.preVote } : u)));
    }
    log(`Round ${n} open — Bid / Ask / Hold (5:00 → demo clock)`, "live");

    crowdRef.current = setInterval(() => {
      setVotes((prev) => {
        const pick = pickCrowdVote();
        return { ...prev, [pick]: prev[pick] + 1 };
      });
      setVoters((list) => {
        const undecided = list.filter((u) => u.id !== "you" && !u.vote);
        if (!undecided.length) return list;
        const target = undecided[Math.floor(Math.random() * undecided.length)];
        const pick = pickCrowdVote();
        return list.map((u) => (u.id === target.id ? { ...u, vote: pick } : u));
      });
    }, 1400);

    tickRef.current = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          clearTimers();
          void resolveRound();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function resolveRound() {
    if (stopRef.current) return;
    clearTimers();
    if (!autoplayingRef.current && house.chainEnabled && house.approved === false) {
      setPhase("blocked");
      log("Round resolve blocked — OnlyApprovedContracts", "warn");
      return;
    }
    setPhase("resolving");
    setBusy(true);
    await new Promise((r) => setTimeout(r, 350));
    if (stopRef.current) return;

    const snapshot = votesRef.current;
    const w = tallyWinner(snapshot);
    setWinner(w);
    log(`Round resolved → ${w.toUpperCase()} (${snapshot.bid}B / ${snapshot.ask}A / ${snapshot.hold}H)`, "ok");
    await afterResolve(w);
  }

  async function afterResolve(w: Vote) {
    try {
      if (w === "hold") {
        await wait(500);
        log("Hold — no order", "neutral");
        await scoreRound(w, false);
        return;
      }
      setPhase("signing");
      setSignProgress(0);
      log(`Session key executing ${w.toUpperCase()}…`, "live");
      for (let i = 1; i <= 5; i++) {
        await wait(140);
        setSignProgress(i);
      }
      log(`placeOrderFor ${w} · ${MOCK_TX}`, "ok");
      const bump = w === "bid" ? 0.0012 : -0.0012;
      setMid((m) => +(m + bump).toFixed(4));
      await wait(600);
      await scoreRound(w, true);
    } catch {
      setBusy(false);
    }
  }

  async function scoreRound(w: Vote, traded: boolean) {
    setPhase("scored");
    setVoters((list) => scoreVoters(list, w, { mid0: roundMid, mid1: mid, traded }));
    log("Leaderboard updated — right calls +10, wrong −6", "live");
    setBusy(false);
  }

  async function revoke() {
    clearTimers();
    if (house.chainEnabled && !autoplaying) {
      if (!house.isHouseOwner) {
        log("Only the house owner can revoke", "warn");
        return;
      }
      setBusy(true);
      try {
        log("Revoking operator grants…", "warn");
        await house.revokeDesk();
        setPhase("revoked");
        log("KILL · operator grants wiped", "warn");
      } catch (err) {
        log(err instanceof Error ? err.message : "Revoke failed", "warn");
      } finally {
        setBusy(false);
      }
      return;
    }
    await wait(280);
    setPhase("revoked");
    log("KILL · operator grants wiped", "warn");
  }

  async function tryBlocked() {
    await wait(450);
    setPhase("blocked");
    log("Round resolve blocked — OnlyApprovedContracts", "warn");
  }

  function reset() {
    stopRef.current = true;
    clearTimers();
    setAutoplaying(false);
    setBusy(false);
    setSecs(ROUND_SECONDS);
    setVotes(EMPTY_TALLY);
    setMyVote(null);
    setWinner(null);
    setSignProgress(0);
    setRound(0);
    setMid(INITIAL_MID);
    setRoundMid(INITIAL_MID);
    setVoters(cloneSeedVoters());
    setTape([{ id: "t-reset", t: stamp(), label: "Desk cold", tone: "neutral" }]);
    if (house.approved) setPhase("armed");
    else if (house.ownerConnected && house.isHouseOwner) setPhase("connected");
    else setPhase("boot");
    setTimeout(() => {
      stopRef.current = false;
    }, 80);
  }

  async function playDemo() {
    if (autoplaying || busy) return;
    stopRef.current = false;
    setAutoplaying(true);
    try {
      clearTimers();
      setPhase("boot");
      setVotes(EMPTY_TALLY);
      setMyVote(null);
      setWinner(null);
      setRound(0);
      setMid(INITIAL_MID);
      setVoters(cloneSeedVoters());
      setTape([{ id: "t-play", t: stamp(), label: "Autoplay — Swarm Desk story (no chain txs)", tone: "live" }]);
      await new Promise((r) => setTimeout(r, 280));
      await wait(450);
      setPhase("connected");
      log(`Owner ${house.ownerLabel} connected`, "live");
      await wait(500);
      setPhase("armed");
      log(`Session ${house.sessionLabel} granted place · cancel · reduce`, "ok");
      startRound({ preVote: "bid" });
      await new Promise((r) => setTimeout(r, (ROUND_SECONDS + 6) * 1000));
      if (stopRef.current) return;
      await wait(280);
      setPhase("revoked");
      log("KILL · operator grants wiped", "warn");
      await tryBlocked();
    } catch {
      // stopped
    } finally {
      setAutoplaying(false);
      setBusy(false);
    }
  }

  const totalVotes = votes.bid + votes.ask + votes.hold || 1;
  const bid = +(mid - 0.0001).toFixed(4);
  const ask = +(mid + 0.0001).toFixed(4);
  const levels = [
    { side: "ask" as const, px: +(ask + 0.0003).toFixed(4), sz: 420 },
    { side: "ask" as const, px: +(ask + 0.0002).toFixed(4), sz: 180 },
    { side: "ask" as const, px: ask, sz: 95 },
    { side: "bid" as const, px: bid, sz: 110 },
    { side: "bid" as const, px: +(bid - 0.0002).toFixed(4), sz: 260 },
    { side: "bid" as const, px: +(bid - 0.0003).toFixed(4), sz: 510 },
  ];

  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");

  const primary = (() => {
    if (autoplaying) return { label: "Playing demo…", action: undefined as undefined | (() => void) };
    if (busy && phase !== "voting") return { label: "Working…", action: undefined as undefined | (() => void) };
    if (house.wrongOwner && phase === "boot") {
      return { label: "Not house owner", action: undefined };
    }
    switch (phase) {
      case "boot":
        return { label: "Connect owner wallet", action: connect };
      case "connected":
        return { label: "Grant session key", action: armDesk };
      case "armed":
      case "scored":
        return { label: "Open next 5-min round", action: () => startRound() };
      case "voting":
        return { label: myVote ? `Voted ${myVote.toUpperCase()} — waiting…` : "Cast a vote above", action: undefined };
      case "revoked":
        return { label: "Try resolve without grant", action: tryBlocked };
      case "blocked":
        return { label: "Reset demo", action: reset };
      default:
        return { label: "…", action: undefined };
    }
  })();

  return {
    phase,
    busy,
    autoplaying,
    mid,
    roundMid,
    secs,
    votes,
    myVote,
    winner,
    signProgress,
    voters,
    round,
    tape,
    desk,
    totalVotes,
    bid,
    ask,
    levels,
    clock: `${mm}:${ss}`,
    primary,
    connect,
    armDesk,
    castVote,
    startRound,
    revoke,
    reset,
    playDemo,
  };
}
