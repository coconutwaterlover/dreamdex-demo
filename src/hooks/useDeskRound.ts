"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRound, openRound as openRoundApi, postVote, resolveRound as resolveRoundApi } from "@/lib/desk/api";
import {
  cloneSeedVoters,
  EMPTY_TALLY,
  INITIAL_MID,
  MOCK_TX,
  pickCrowdVote,
  ROUND_SECONDS,
  shortAddress,
  stamp,
  tallyWinner,
} from "@/lib/desk/round";
import { scoreVoters } from "@/lib/desk/scoring";
import type { DeskView, Phase, RoundSnapshot, TapeItem, Vote, VoteTally, Voter } from "@/lib/desk/types";
import { voteMessage } from "@/lib/desk/vote";

type HouseActions = {
  ownerLabel: string;
  sessionLabel: string;
  chainEnabled: boolean;
  ownerConnected: boolean;
  isHouseOwner: boolean;
  isConnected: boolean;
  address?: string;
  wrongOwner: boolean;
  approved: boolean | undefined;
  connectWallet: () => Promise<{ address?: string; isHouseOwner: boolean }>;
  grantSession: () => Promise<unknown>;
  revokeDesk: () => Promise<unknown>;
  signVote: (message: string) => Promise<`0x${string}`>;
};

function ballotsToVoters(ballots: RoundSnapshot["ballots"], you?: string): Voter[] {
  return ballots.map((b) => ({
    id: b.address.toLowerCase(),
    name: you && b.address.toLowerCase() === you.toLowerCase() ? "You" : shortAddress(b.address),
    pts: 40,
    vote: b.vote,
  }));
}

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
  const roundRef = useRef(0);
  const [executeHash, setExecuteHash] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [liveBallots, setLiveBallots] = useState<RoundSnapshot["ballots"]>([]);
  const stopRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crowdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoplayingRef = useRef(false);
  const scoredRef = useRef<number | null>(null);
  const resolvingRef = useRef(false);

  const [tape, setTape] = useState<TapeItem[]>([
    { id: "t0", t: "00:00", label: "Desk cold — grant a hot key to open Swarm", tone: "neutral" },
  ]);

  const liveMode = house.chainEnabled && !autoplaying;
  const chainArmed = house.approved === true;

  const desk: DeskView = useMemo(() => {
    const revoked = phase === "revoked" || phase === "blocked";
    const approved = chainArmed && !revoked
      ? true
      : ["armed", "voting", "resolving", "signing", "scored"].includes(phase);
    const owner = house.ownerConnected || house.isConnected || phase !== "boot" || chainArmed;
    const session = chainArmed || (phase !== "boot" && phase !== "connected");
    return {
      owner,
      session,
      approved: approved && !revoked,
      revoked,
      live: approved && !revoked,
    };
  }, [chainArmed, house.isConnected, house.ownerConnected, phase]);

  useEffect(() => {
    votesRef.current = votes;
  }, [votes]);

  useEffect(() => {
    autoplayingRef.current = autoplaying;
  }, [autoplaying]);

  useEffect(() => {
    if (!liveMode) return;
    if (!house.address) {
      setMyVote(null);
      return;
    }
    const mine = liveBallots.find((b) => b.address.toLowerCase() === house.address.toLowerCase());
    setMyVote(mine?.vote ?? null);
  }, [house.address, liveBallots, liveMode]);

  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (crowdRef.current) clearInterval(crowdRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    tickRef.current = null;
    crowdRef.current = null;
    pollRef.current = null;
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
    if (!desk.live || liveMode) return;
    const id = setInterval(() => {
      setMid((m) => {
        const delta = (Math.random() - 0.5) * 0.0003;
        return Math.max(0.17, Math.min(0.2, +(m + delta).toFixed(4)));
      });
    }, 900);
    return () => clearInterval(id);
  }, [desk.live, liveMode]);

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

  async function finishLiveRound(snap: RoundSnapshot) {
    if (!snap.id || scoredRef.current === snap.id) return;
    scoredRef.current = snap.id;
    setWinner(snap.winner);
    setVotes(snap.tally);
    setSecs(0);
    setLiveBallots(snap.ballots);
    setExecuteHash(snap.txHash);
    setExecuteError(snap.error);
    if (snap.mid) setMid(snap.mid);
    if (snap.status === "blocked") {
      setPhase("blocked");
      log("Round resolve blocked — OnlyApprovedContracts", "warn");
      setBusy(false);
      return;
    }
    const w = snap.winner ?? "hold";
    log(`Round resolved → ${w.toUpperCase()} (${snap.tally.bid}B / ${snap.tally.ask}A / ${snap.tally.hold}H)`, "ok");
    if (w === "hold") {
      log("Hold — no order", "neutral");
      await scoreRound(w, false, snap.ballots);
      return;
    }
    if (snap.error && !snap.txHash) {
      log(snap.error, "warn");
      await scoreRound(w, false, snap.ballots);
      return;
    }
    setPhase("signing");
    setSignProgress(5);
    if (snap.txHash) {
      setExecuteHash(snap.txHash);
      log(`placeOrderFor ${w} · ${snap.txHash}`, "ok");
    }
    await scoreRound(w, !!snap.txHash, snap.ballots);
  }

  const applyLiveSnapshot = useCallback(
    async (snap: RoundSnapshot) => {
      if (snap.mid) setMid(snap.mid);
      if (snap.id) {
        setRound(snap.id);
        roundRef.current = snap.id;
      }
      setVotes(snap.tally);
      setWinner(snap.winner);
      setLiveBallots(snap.ballots);
      if (snap.status === "voting") {
        setPhase("voting");
        setSecs(snap.remaining);
        setVoters(ballotsToVoters(snap.ballots, house.address));
        return;
      }
      if (snap.status === "resolving") {
        setPhase("signing");
        return;
      }
      if (snap.status === "scored" || snap.status === "blocked") {
        await finishLiveRound(snap);
      }
    },
    // finishLiveRound is stable enough via scoredRef; include house.address
    [house.address],
  );

  async function connect() {
    if (house.chainEnabled) {
      setBusy(true);
      try {
        const result = await house.connectWallet();
        if (result.isHouseOwner) {
          log(`Owner ${house.ownerLabel} connected`, "live");
          if (house.approved) setPhase("armed");
          else setPhase("connected");
        } else {
          log(`Wallet ${shortAddress(result.address ?? "")} connected — vote when the desk is armed`, "live");
          if (house.approved) setPhase("armed");
        }
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

  async function castVote(v: Vote) {
    if (phase !== "voting" || myVote || busy || autoplaying) return;
    if (liveMode) {
      if (!house.address) {
        log("Connect a wallet to vote", "warn");
        return;
      }
      setBusy(true);
      try {
        const message = voteMessage(roundRef.current || round, v);
        const signature = await house.signVote(message);
        const snap = await postVote({
          vote: v,
          address: house.address,
          message,
          signature,
        });
        setMyVote(v);
        log(`You voted ${v.toUpperCase()}`, "live");
        await applyLiveSnapshot(snap);
      } catch (err) {
        log(err instanceof Error ? err.message : "Vote failed", "warn");
      } finally {
        setBusy(false);
      }
      return;
    }
    setMyVote(v);
    setVotes((prev) => ({ ...prev, [v]: prev[v] + 1 }));
    setVoters((list) => list.map((u) => (u.id === "you" ? { ...u, vote: v } : u)));
    log(`You voted ${v.toUpperCase()}`, "live");
  }

  function startLocalRound(opts?: { preVote?: Vote }) {
    clearTimers();
    const n = round + 1;
    setRound(n);
    roundRef.current = n;
    setPhase("voting");
    setSecs(ROUND_SECONDS);
    setVotes({ bid: 2, ask: 1, hold: 1 });
    setMyVote(opts?.preVote ?? null);
    setWinner(null);
    setSignProgress(0);
    setExecuteHash(null);
    setExecuteError(null);
    setLiveBallots([]);
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
          void resolveLocalRound();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function startRound(opts?: { preVote?: Vote }) {
    if (house.chainEnabled && !autoplayingRef.current && house.approved === false) {
      log("Desk is not armed on-chain", "warn");
      return;
    }
    if (liveMode) {
      setBusy(true);
      try {
        clearTimers();
        scoredRef.current = null;
        resolvingRef.current = false;
        const snap = await openRoundApi();
        setRoundMid(snap.mid || mid);
        setExecuteHash(null);
        setExecuteError(null);
        setSignProgress(0);
        log(`Round ${snap.id} open — Bid / Ask / Hold (signed 1p1v)`, "live");
        await applyLiveSnapshot(snap);
        pollRef.current = setInterval(() => {
          void pollLive();
        }, 1000);
      } catch (err) {
        log(err instanceof Error ? err.message : "Open round failed", "warn");
      } finally {
        setBusy(false);
      }
      return;
    }
    startLocalRound(opts);
  }

  async function pollLive() {
    if (autoplayingRef.current || stopRef.current) return;
    try {
      const snap = await fetchRound();
      if (snap.status === "voting") {
        setVotes(snap.tally);
        setSecs(snap.remaining);
        setVoters(ballotsToVoters(snap.ballots, house.address));
        setLiveBallots(snap.ballots);
        if (snap.mid) setMid(snap.mid);
        if (snap.remaining > 0) return;
        setPhase("resolving");
        setBusy(true);
        if (resolvingRef.current) return;
        resolvingRef.current = true;
        try {
          const resolved = await resolveRoundApi();
          if (resolved.status === "voting") {
            resolvingRef.current = false;
            return;
          }
          clearTimers();
          await applyLiveSnapshot(resolved);
        } catch (err) {
          resolvingRef.current = false;
          log(err instanceof Error ? err.message : "Resolve failed", "warn");
          setBusy(false);
        }
        return;
      }
      if (snap.status === "resolving") {
        setPhase("signing");
        setBusy(true);
        return;
      }
      clearTimers();
      await applyLiveSnapshot(snap);
    } catch {
      // keep polling
    }
  }

  async function resolveLocalRound() {
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
    await afterLocalResolve(w);
  }

  async function afterLocalResolve(w: Vote) {
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
      setExecuteHash(MOCK_TX);
      log(`placeOrderFor ${w} · ${MOCK_TX}`, "ok");
      const bump = w === "bid" ? 0.0012 : -0.0012;
      setMid((m) => +(m + bump).toFixed(4));
      await wait(600);
      await scoreRound(w, true);
    } catch {
      setBusy(false);
    }
  }

  async function scoreRound(w: Vote, traded: boolean, ballots?: RoundSnapshot["ballots"]) {
    setPhase("scored");
    setVoters((list) => {
      const source = ballots ? ballotsToVoters(ballots, house.address).map((b) => {
        const prev = list.find((x) => x.id === b.id);
        return { ...b, pts: prev?.pts ?? b.pts };
      }) : list;
      return scoreVoters(source.length ? source : list, w, { mid0: roundMid, mid1: mid, traded });
    });
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
    if (liveMode && round) {
      setBusy(true);
      try {
        const snap = await resolveRoundApi();
        await applyLiveSnapshot(snap);
      } catch (err) {
        setPhase("blocked");
        log(err instanceof Error ? err.message : "Round resolve blocked — OnlyApprovedContracts", "warn");
      } finally {
        setBusy(false);
      }
      return;
    }
    await wait(450);
    setPhase("blocked");
    log("Round resolve blocked — OnlyApprovedContracts", "warn");
  }

  function reset() {
    stopRef.current = true;
    clearTimers();
    setAutoplaying(false);
    autoplayingRef.current = false;
    setBusy(false);
    setSecs(ROUND_SECONDS);
    setVotes(EMPTY_TALLY);
    setMyVote(null);
    setWinner(null);
    setSignProgress(0);
    setExecuteHash(null);
    setExecuteError(null);
    setLiveBallots([]);
    setRound(0);
    roundRef.current = 0;
    setMid(INITIAL_MID);
    setRoundMid(INITIAL_MID);
    setVoters(cloneSeedVoters());
    scoredRef.current = null;
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
    autoplayingRef.current = true;
    try {
      clearTimers();
      setPhase("boot");
      setVotes(EMPTY_TALLY);
      setMyVote(null);
      setWinner(null);
      setRound(0);
      roundRef.current = 0;
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
      startLocalRound({ preVote: "bid" });
      await new Promise((r) => setTimeout(r, (ROUND_SECONDS + 6) * 1000));
      if (stopRef.current) return;
      await wait(280);
      setPhase("revoked");
      log("KILL · operator grants wiped", "warn");
      await wait(450);
      setPhase("blocked");
      log("Round resolve blocked — OnlyApprovedContracts", "warn");
    } catch {
      // stopped
    } finally {
      setAutoplaying(false);
      autoplayingRef.current = false;
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
    switch (phase) {
      case "boot":
        return { label: house.chainEnabled ? "Connect wallet" : "Connect owner wallet", action: connect };
      case "connected":
        return { label: "Grant session key", action: armDesk };
      case "armed":
      case "scored":
        return { label: "Open next 5-min round", action: () => startRound() };
      case "voting":
        if (liveMode && !house.isConnected) {
          return { label: "Connect to vote", action: connect };
        }
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
    executeHash,
    executeError,
    liveBallots,
    voters,
    round,
    tape,
    desk,
    totalVotes,
    bid,
    ask,
    levels,
    liveMode,
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
