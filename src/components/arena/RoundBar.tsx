"use client";

import { agoLabel, clock, price } from "@/lib/arena/format";
import { SEASON_ROUNDS, addressHref } from "@/lib/chain/constants";
import type { ArenaFeed } from "@/hooks/useArena";

/**
 * The one clock everybody shares. Every desk in the arena opens and closes on the
 * same boundary, so this bar is the whole game's heartbeat.
 */
export function RoundBar({ feed }: { feed: ArenaFeed }) {
  const { state, clock: chainClock, secondsLeft } = feed;
  const pct = Math.min(100, Math.max(0, ((300 - secondsLeft) / 300) * 100));
  const closing = secondsLeft <= 30;

  return (
    <section className={closing ? "roundbar is-closing" : "roundbar"}>
      <div className="roundbar-clock">
        <p className="eyebrow">Round {state.roundId.toLocaleString()} closes in</p>
        <p className="countdown">{clock(secondsLeft)}</p>
        <div className="roundbar-progress" role="presentation">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="roundbar-sub">
          {closing ? "Ballots lock at zero — the desks execute on the boundary" : "Every desk trades this same window"}
        </p>
      </div>

      <dl className="roundbar-stats">
        <div>
          <dt>Mid</dt>
          <dd className="num">{state.mid ? price(state.mid) : "—"}</dd>
          <dd className="foot">USDso per SOMI, read on-chain</dd>
        </div>
        <div>
          <dt>Season</dt>
          <dd className="num">{state.season}</dd>
          <dd className="foot">
            round {state.seasonRound + 1} / {SEASON_ROUNDS}
          </dd>
        </div>
        <div>
          <dt>Desks</dt>
          <dd className="num">{state.deskCount}</dd>
          <dd className="foot">{state.voterCount} contributors</dd>
        </div>
        <div>
          <dt>On-chain clock</dt>
          <dd className="num">
            {chainClock ? `${chainClock.fireCount}` : "—"}
            <span className="unit">beats</span>
          </dd>
          <dd className="foot">
            {chainClock ? (
              <a href={addressHref(chainClock.address ?? undefined) ?? "#"} target="_blank" rel="noreferrer">
                {chainClock.armedForMs > Date.now()
                  ? `re-armed for ${new Date(chainClock.armedForMs).toLocaleTimeString()}`
                  : `last fired ${agoLabel(chainClock.lastFiredAtMs)}`}
              </a>
            ) : (
              "not deployed"
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
