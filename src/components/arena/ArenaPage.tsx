"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { useArena } from "@/hooks/useArena";
import { useArenaActions } from "@/hooks/useArenaActions";
import { isArenaConfigured } from "@/lib/chain/constants";
import { ArenaShell } from "./ArenaShell";
import { ContributorBoard } from "./ContributorBoard";
import { DeskCard } from "./DeskCard";
import { HowItWorks } from "./HowItWorks";
import { RoundBar } from "./RoundBar";
import { YouPanel } from "./YouPanel";

type Sort = "profit" | "heat" | "new";

export function ArenaPage() {
  const { address } = useAccount();
  const feed = useArena(address);
  const actions = useArenaActions();
  const [sort, setSort] = useState<Sort>("profit");
  const [onlyMine, setOnlyMine] = useState(false);
  const nudged = useRef(0);

  // A visitor is enough to heal a dropped beat — the clock re-arms itself, but this
  // makes the arena self-correcting even if Reactivity ever misses one.
  useEffect(() => {
    if (!feed.state.behind) return;
    if (Date.now() - nudged.current < 30_000) return;
    nudged.current = Date.now();
    void fetch("/api/keeper/tick", { method: "POST" }).then(() => feed.refresh());
  }, [feed]);

  const desks = useMemo(() => {
    const rows = onlyMine && address
      ? feed.desks.filter((d) => d.owner.toLowerCase() === address.toLowerCase())
      : feed.desks;
    const sorted = [...rows];
    if (sort === "heat") sorted.sort((a, b) => b.votes - a.votes || a.rank - b.rank);
    if (sort === "new") sorted.sort((a, b) => b.createdRound - a.createdRound || a.rank - b.rank);
    return sorted;
  }, [feed.desks, sort, onlyMine, address]);

  const me = useMemo(
    () => feed.contributors.find((c) => address && c.wallet.toLowerCase() === address.toLowerCase()),
    [feed.contributors, address],
  );

  const onVote = useCallback(
    async (deskId: number, choice: "bid" | "ask" | "hold") => {
      await actions.vote(deskId, choice);
      await feed.refresh();
    },
    [actions, feed],
  );

  const onSettle = useCallback(async () => {
    if (!address) return;
    await actions.settle(address);
    await feed.refresh();
  }, [actions, address, feed]);

  if (!isArenaConfigured()) {
    return (
      <ArenaShell>
        <main className="arena-main">
          <section className="notice">
            <h2>The arena is not wired up yet</h2>
            <p>
              Set <code>NEXT_PUBLIC_ARENA_ADDRESS</code> (plus the badge and clock addresses) and redeploy.
              Run <code>npm run deploy:arena</code> to get them.
            </p>
          </section>
        </main>
      </ArenaShell>
    );
  }

  return (
    <ArenaShell>
      <main className="arena-main">
        <section className="hero">
          <div>
            <p className="eyebrow">Somnia Shannon · dreamDEX SOMI:USDso</p>
            <h1>Every desk. One clock. Best profit wins.</h1>
            <p className="pitch">
              Anyone can open a trading desk. The crowd votes its next move every five minutes, the boundary
              executes on-chain, and two soulbound leaderboards keep score — one for the desks, one for the
              people calling them.
            </p>
          </div>
          <div className="hero-actions">
            <Link className="btn btn-accent" href="/create">
              Open your desk
            </Link>
            <Link className="btn" href="/leaderboard">
              Full leaderboard
            </Link>
          </div>
        </section>

        <RoundBar feed={feed} />

        {actions.error && (
          <p className="alert" onClick={actions.clearError} role="alert">
            {actions.error} <span className="foot">(tap to dismiss)</span>
          </p>
        )}
        {feed.error && <p className="alert alert-soft">{feed.error}</p>}

        <div className="arena-body">
          <div className="arena-desks">
            <div className="section-head">
              <h2>Desks in play</h2>
              <div className="controls">
                {(["profit", "heat", "new"] as Sort[]).map((key) => (
                  <button
                    key={key}
                    className={sort === key ? "pill is-on" : "pill"}
                    onClick={() => setSort(key)}
                  >
                    {key === "profit" ? "By profit" : key === "heat" ? "Most votes" : "Newest"}
                  </button>
                ))}
                {address && (
                  <button
                    className={onlyMine ? "pill is-on" : "pill"}
                    onClick={() => setOnlyMine((v) => !v)}
                  >
                    Mine
                  </button>
                )}
              </div>
            </div>

            {feed.loading && !desks.length ? (
              <p className="empty">Reading the arena…</p>
            ) : desks.length ? (
              <div className="deskgrid">
                {desks.map((desk) => (
                  <DeskCard
                    key={desk.deskId}
                    desk={desk}
                    myVote={feed.myVotes[desk.deskId] ?? "none"}
                    connected={!!address}
                    busy={actions.busy}
                    isOwner={!!address && desk.owner.toLowerCase() === address.toLowerCase()}
                    onVote={onVote}
                  />
                ))}
              </div>
            ) : (
              <p className="empty">
                No desks yet. <Link href="/create">Open the first one</Link> — it sets the pace for the season.
              </p>
            )}
          </div>

          <div className="arena-rail">
            <YouPanel
              me={address}
              contributor={me}
              desks={feed.desks}
              onSettle={onSettle}
              settling={actions.busy === "settle"}
            />
            <section className="rail-card">
              <div className="section-head">
                <h3>Contributors</h3>
                <Link className="foot" href="/leaderboard">
                  all →
                </Link>
              </div>
              <ContributorBoard
                rows={feed.contributors}
                me={address}
                collection={feed.addresses.contributorBadge}
                limit={8}
                compact
              />
            </section>
            <HowItWorks />
          </div>
        </div>
      </main>
    </ArenaShell>
  );
}
