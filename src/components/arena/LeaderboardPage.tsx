"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { useArena } from "@/hooks/useArena";
import { useArenaActions } from "@/hooks/useArenaActions";
import { SEASON_ROUNDS, addressHref } from "@/lib/chain/constants";
import { clock, ordinal, shortAddress, signedUsd } from "@/lib/arena/format";
import { ArenaShell } from "./ArenaShell";
import { ContributorBoard } from "./ContributorBoard";
import { DeskBoard } from "./DeskBoard";

export function LeaderboardPage() {
  const { address } = useAccount();
  const feed = useArena(address);
  const actions = useArenaActions();
  const [tab, setTab] = useState<"desks" | "contributors" | "stakers">("desks");

  const onSettle = useCallback(async () => {
    if (!address) return;
    await actions.settle(address);
    await feed.refresh();
  }, [actions, address, feed]);

  const leader = feed.desks.find((d) => !d.retired);
  const roundsLeft = SEASON_ROUNDS - feed.state.seasonRound;

  return (
    <ArenaShell>
      <main className="arena-main">
        <section className="hero">
          <div>
            <p className="eyebrow">Season {feed.state.season}</p>
            <h1>Standings</h1>
            <p className="pitch">
              {leader ? (
                <>
                  <strong>{leader.name}</strong> leads at {signedUsd(leader.pnl)} USDso.{" "}
                </>
              ) : null}
              {roundsLeft} rounds left in the season — about {Math.round((roundsLeft * 5) / 60)} hours. Season
              scores are a slice of the lifetime totals, so nothing you earn is ever wiped.
            </p>
          </div>
          <div className="hero-actions">
            <p className="countdown countdown-sm">{clock(feed.secondsLeft)}</p>
            <p className="foot">to round {feed.state.roundId + 1}</p>
          </div>
        </section>

        <div className="tabs">
          <button className={tab === "desks" ? "pill is-on" : "pill"} onClick={() => setTab("desks")}>
            Desks ({feed.desks.length})
          </button>
          <button
            className={tab === "contributors" ? "pill is-on" : "pill"}
            onClick={() => setTab("contributors")}
          >
            Contributors ({feed.contributors.length})
          </button>
          {!!feed.stake && (
            <button
              className={tab === "stakers" ? "pill is-on" : "pill"}
              onClick={() => setTab("stakers")}
            >
              Stakers ({feed.stakers.length})
            </button>
          )}
        </div>

        <section className="panel">
          {tab === "stakers" ? (
            <>
              {feed.stakers.length ? (
                <div className="board-scroll">
                  <table className="board">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Staker</th>
                        <th className="right">Net winnings</th>
                        <th className="right">Staked</th>
                        <th className="right">Positions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feed.stakers.map((s) => {
                        const isMe = !!address && s.wallet.toLowerCase() === address.toLowerCase();
                        return (
                          <tr key={s.wallet} className={isMe ? "is-me" : undefined}>
                            <td className="dim">{ordinal(s.rank)}</td>
                            <td>
                              {shortAddress(s.wallet)}
                              {isMe && <span className="tag tag-you">you</span>}
                            </td>
                            <td className={`right num ${s.netWinnings > 0 ? "up" : s.netWinnings < 0 ? "down" : ""}`}>
                              {s.netWinnings > 0 ? "+" : ""}
                              {s.netWinnings.toFixed(4)} STT
                            </td>
                            <td className="right num dim">{s.stakedTotal.toFixed(4)}</td>
                            <td className="right num dim">{s.positionsStaked}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="empty">Nobody has staked yet. The first pool opens the board.</p>
              )}
              <p className="foot">
                Realized winnings, paid by the other side. A {(((feed.stake?.ownerRakeBps ?? 0) + (feed.stake?.treasuryRakeBps ?? 0)) / 100).toFixed(0)}% rake goes to the
                desk owner and the treasury — which is also why staking every side is a losing
                strategy, and why nobody needs to police it.
              </p>
            </>
          ) : tab === "desks" ? (
            <>
              <DeskBoard desks={feed.desks} me={address} />
              <p className="foot">
                Profit is the paper book marked to the live mid: identical starting cash, identical lot,
                identical five-minute window for every desk. Desks flagged <em>live</em> also post the same
                move as a real order their owner keeps.
              </p>
            </>
          ) : (
            <>
              <ContributorBoard
                rows={feed.contributors}
                me={address}
                collection={feed.addresses.contributorBadge}
                onSettle={address ? onSettle : undefined}
                settling={actions.busy === "settle"}
              />
              <p className="foot">
                Points are the basis-point move your own call was exposed to, clamped so one violent candle
                can&apos;t decide a season. You are scored on your call — not on whether the crowd agreed.
              </p>
            </>
          )}
        </section>

        <section className="panel">
          <h3>Verify any of this</h3>
          <ul className="linklist">
            <li>
              <a href={addressHref(feed.addresses.arena ?? undefined) ?? "#"} target="_blank" rel="noreferrer">
                DeskArena — desks, ballots, mids, points
              </a>
            </li>
            <li>
              <a href={addressHref(feed.addresses.deskBadge ?? undefined) ?? "#"} target="_blank" rel="noreferrer">
                Desk badge collection
              </a>
            </li>
            <li>
              <a
                href={addressHref(feed.addresses.contributorBadge ?? undefined) ?? "#"}
                target="_blank"
                rel="noreferrer"
              >
                Contributor badge collection
              </a>
            </li>
            {feed.clock?.address && (
              <li>
                <a href={addressHref(feed.clock.address) ?? "#"} target="_blank" rel="noreferrer">
                  ArenaClock — {feed.clock.fireCount} beats, {Number(feed.clock.balance).toFixed(1)} STT left
                </a>
              </li>
            )}
          </ul>
        </section>
      </main>
    </ArenaShell>
  );
}
