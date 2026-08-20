"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useAccount } from "wagmi";
import { useArena } from "@/hooks/useArena";
import { useArenaActions } from "@/hooks/useArenaActions";
import { useDeskOwner } from "@/hooks/useDeskOwner";
import {
  DREAMDEX_APP_URL,
  SESSION_ADDRESS,
  addressHref,
  badgeTokenHref,
} from "@/lib/chain/constants";
import { CHOICE_META, CHOICE_ORDER } from "@/lib/arena/types";
import { ordinal, price, shortAddress, signedUsd, somi, tone, usd } from "@/lib/arena/format";
import { ArenaShell } from "./ArenaShell";
import { DeskCard } from "./DeskCard";
import { ModelledVsReal } from "./ModelledVsReal";
import { MyStakes } from "./MyStakes";
import { StakePanel } from "./StakePanel";
import { RoundBar } from "./RoundBar";

export function DeskPage({ deskId }: { deskId: number }) {
  const { address } = useAccount();
  const feed = useArena(address);
  const actions = useArenaActions();
  const desk = useMemo(() => feed.desks.find((d) => d.deskId === deskId), [feed.desks, deskId]);
  const isOwner = !!address && !!desk && desk.owner.toLowerCase() === address.toLowerCase();
  const owner = useDeskOwner(desk?.owner);

  const onVote = useCallback(
    async (id: number, choice: "bid" | "ask" | "hold") => {
      await actions.vote(id, choice);
      await feed.refresh();
    },
    [actions, feed],
  );

  if (!desk) {
    return (
      <ArenaShell>
        <main className="arena-main narrow">
          <section className="notice">
            <h2>{feed.loading ? "Loading desk…" : `No desk #${deskId}`}</h2>
            <p>
              <Link href="/">Back to the arena</Link>
            </p>
          </section>
        </main>
      </ArenaShell>
    );
  }

  const badgeHref = feed.addresses.deskBadge
    ? badgeTokenHref(feed.addresses.deskBadge as `0x${string}`, desk.deskId + 1)
    : null;

  return (
    <ArenaShell>
      <main className="arena-main">
        <section className="hero">
          <div>
            <p className="eyebrow">
              Desk #{desk.deskId} · {desk.retired ? "retired" : ordinal(desk.rank)} of {feed.desks.length}
            </p>
            <h1>{desk.name}</h1>
            <p className="pitch">
              Run by{" "}
              <a href={addressHref(desk.owner) ?? "#"} target="_blank" rel="noreferrer">
                {shortAddress(desk.owner)}
              </a>
              {desk.armed
                ? " — armed, so the winning move is also posted as a real order on dreamDEX."
                : " — trading the paper book against the live mid."}
            </p>
          </div>
          <div className="hero-actions">
            <p className={`pnl pnl-${tone(desk.pnl)} pnl-xl`}>{signedUsd(desk.pnl)}</p>
          </div>
        </section>

        <RoundBar feed={feed} />

        {actions.error && (
          <p className="alert" onClick={actions.clearError}>
            {actions.error}
          </p>
        )}

        <div className="arena-body">
          <div className="arena-desks">
            <DeskCard
              desk={desk}
              myVote={feed.myVotes[desk.deskId] ?? "none"}
              connected={!!address}
              busy={actions.busy}
              isOwner={isOwner}
              onVote={onVote}
              scaleRatio={feed.scale?.ratio}
              pot={feed.pools.find((p) => p.deskId === desk.deskId)?.pot}
            />

            <section className="panel">
              <h3>The book</h3>
              <dl className="bondinfo">
                <div>
                  <dt>Equity</dt>
                  <dd className="num">{usd(desk.equity)} USDso</dd>
                  <dd className="foot">cash {usd(desk.cash)} marked at {price(feed.state.mid)}</dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd className="num">
                    {desk.base === 0 ? "flat" : `${desk.base > 0 ? "+" : "−"}${somi(Math.abs(desk.base))} SOMI`}
                  </dd>
                  <dd className="foot">capped at ±5 lots of 1,000</dd>
                </div>
                <div>
                  <dt>Rounds traded</dt>
                  <dd className="num">{desk.roundsTraded}</dd>
                  <dd className="foot">{desk.wins} closed higher than the round before</dd>
                </div>
                <div>
                  <dt>Season profit</dt>
                  <dd className={`num pnl-${tone(desk.seasonPnl)}`}>{signedUsd(desk.seasonPnl)}</dd>
                  <dd className="foot">season {feed.state.season}</dd>
                </div>
              </dl>
            </section>

            <StakePanel
              desk={desk}
              pool={feed.pools.find((p) => p.deskId === desk.deskId)}
              config={feed.stake}
              mine={feed.myStakes.find(
                (m) => m.deskId === desk.deskId && m.roundId === feed.state.roundId,
              )}
              connected={!!address}
              busy={actions.busy}
              secondsToLock={feed.stake?.secondsToLock ?? 0}
              onStake={async (id, side, amount) => {
                await actions.stakeOn(id, side, amount);
                await feed.refresh();
              }}
            />

            <MyStakes
              stakes={feed.myStakes.filter((m) => m.deskId === desk.deskId)}
              pools={feed.pools}
              busy={actions.busy}
              onClaim={async (r, d) => {
                await actions.claimStake(r, d);
                await feed.refresh();
              }}
              onClaimAll={async (ps) => {
                await actions.claimAll(ps);
                await feed.refresh();
              }}
              onSettle={async (r, d) => {
                await actions.settlePool(r, d);
                await feed.refresh();
              }}
            />

            <ModelledVsReal
              desk={desk}
              scale={feed.scale}
              real={feed.realBooks.find((r) => r.deskId === desk.deskId)}
              mirror={feed.mirror.entries}
              mirrorSince={feed.mirror.since}
            />

            <section className="panel">
              <h3>This round&apos;s ballot</h3>
              <ul className="ballotlist">
                {CHOICE_ORDER.map((choice) => (
                  <li key={choice}>
                    <span className={`dot dot-${choice}`} />
                    <strong>{CHOICE_META[choice].verb}</strong>
                    <span className="foot">{CHOICE_META[choice].blurb}</span>
                    <span className="num">{desk.tally[choice]}</span>
                  </li>
                ))}
              </ul>
              <p className="foot">
                Ties resolve to Wait. Votes are transactions, so the tally above is the chain&apos;s, not this
                server&apos;s.
              </p>
            </section>
          </div>

          <div className="arena-rail">
            {isOwner && (
              <section className="rail-card">
                <h3>Owner controls</h3>
                <ol className="steps">
                  <li className={owner.granted ? "is-done" : ""}>
                    <div>
                      <strong>Grant the session key</strong>
                      <p className="foot">
                        Approves {shortAddress(SESSION_ADDRESS)} for placeOrderFor / cancel / reduce across
                        official pools. It places orders you own; it can never move your funds.
                      </p>
                    </div>
                    <button
                      className="btn"
                      disabled={!!actions.busy}
                      onClick={async () => {
                        await actions.grantSessionKey(!owner.granted);
                        owner.refetch();
                        await feed.refresh();
                      }}
                    >
                      {actions.busy === "grant" ? "…" : owner.granted ? "Revoke" : "Grant"}
                    </button>
                  </li>
                  <li className={owner.approved ? "is-done" : ""}>
                    <div>
                      <strong>Approve USDso for the pool</strong>
                      <p className="foot">
                        Lets auto-pull draw the quote token from your wallet when a Buy wins. Balance:{" "}
                        {owner.balanceLabel} USDso.
                      </p>
                    </div>
                    <button
                      className="btn"
                      disabled={!!actions.busy || !owner.quoteToken}
                      onClick={async () => {
                        if (!owner.quoteToken) return;
                        await actions.approveUsdso(owner.quoteToken);
                        owner.refetch();
                      }}
                    >
                      {actions.busy === "approve" ? "…" : owner.approved ? "Approved" : "Approve"}
                    </button>
                  </li>
                  <li className={desk.wantsLive ? "is-done" : ""}>
                    <div>
                      <strong>Go live</strong>
                      <p className="foot">
                        {desk.armed
                          ? "Armed — the arena verified your grant on-chain."
                          : desk.wantsLive
                            ? "Waiting on the grant above; until then the desk stays paper."
                            : "Opt in to mirroring the winning move onto the real book."}
                      </p>
                    </div>
                    <button
                      className="btn"
                      disabled={!!actions.busy}
                      onClick={async () => {
                        await actions.setWantsLive(desk.deskId, !desk.wantsLive);
                        await feed.refresh();
                      }}
                    >
                      {actions.busy === `live:${desk.deskId}` ? "…" : desk.wantsLive ? "Turn off" : "Turn on"}
                    </button>
                  </li>
                </ol>
                {!desk.retired && (
                  <button
                    className="btn btn-warn"
                    disabled={!!actions.busy}
                    onClick={async () => {
                      await actions.retireDesk(desk.deskId);
                      await feed.refresh();
                    }}
                  >
                    {actions.busy === `retire:${desk.deskId}` ? "Retiring…" : "Retire desk & reclaim bond"}
                  </button>
                )}
              </section>
            )}

            <section className="rail-card">
              <h3>On chain</h3>
              <ul className="linklist">
                <li>
                  <a href={addressHref(desk.owner) ?? "#"} target="_blank" rel="noreferrer">
                    Desk owner
                  </a>
                </li>
                {badgeHref && (
                  <li>
                    <a href={badgeHref} target="_blank" rel="noreferrer">
                      Owner&apos;s soulbound badge
                    </a>
                  </li>
                )}
                <li>
                  <a href={addressHref(feed.addresses.arena ?? undefined) ?? "#"} target="_blank" rel="noreferrer">
                    DeskArena contract
                  </a>
                </li>
                <li>
                  <a href={addressHref(feed.addresses.pool) ?? "#"} target="_blank" rel="noreferrer">
                    SOMI:USDso SpotPool
                  </a>
                </li>
              </ul>
            </section>

            <section className="rail-card onramp">
              <p className="onramp-head">Think this desk is wrong?</p>
              <p className="foot">
                Voting is free. Taking the other side with your own size is what the book is actually for.
              </p>
              <a className="btn btn-accent" href={DREAMDEX_APP_URL} target="_blank" rel="noreferrer">
                Trade SOMI:USDso →
              </a>
            </section>
          </div>
        </div>
      </main>
    </ArenaShell>
  );
}
