"use client";

import Link from "next/link";
import { ordinal, signedPoints, signedUsd } from "@/lib/arena/format";
import { DREAMDEX_APP_URL } from "@/lib/chain/constants";
import type { ContributorRow, DeskRow } from "@/lib/arena/types";

/**
 * Your standing, and — once you've shown you can call the market — the nudge from
 * voting into actually trading it on DreamDEX.
 */
export function YouPanel({
  me,
  contributor,
  desks,
  onSettle,
  settling,
}: {
  me?: string;
  contributor?: ContributorRow;
  desks: DeskRow[];
  onSettle?: () => void;
  settling?: boolean;
}) {
  if (!me) {
    return (
      <aside className="you you-empty">
        <h3>Your standing</h3>
        <p className="foot">
          Connect a wallet to vote. Your first ballot mints a soulbound contributor badge and puts you on the
          board.
        </p>
      </aside>
    );
  }

  const myDesks = desks.filter((d) => d.owner.toLowerCase() === me.toLowerCase());
  const hot = (contributor?.streak ?? 0) >= 3;

  return (
    <aside className="you">
      <h3>Your standing</h3>
      {contributor ? (
        <dl className="you-stats">
          <div>
            <dt>Rank</dt>
            <dd className="num">{ordinal(contributor.rank)}</dd>
          </div>
          <div>
            <dt>Points</dt>
            <dd className={`num ${contributor.points > 0 ? "up" : contributor.points < 0 ? "down" : ""}`}>
              {signedPoints(contributor.points)}
            </dd>
          </div>
          <div>
            <dt>Streak</dt>
            <dd className="num">{contributor.streak > 0 ? `${contributor.streak}🔥` : "—"}</dd>
          </div>
          <div>
            <dt>Calls</dt>
            <dd className="num">{contributor.ballotsCast}</dd>
          </div>
        </dl>
      ) : (
        <p className="foot">No ballots yet. Vote on any desk to mint your contributor badge.</p>
      )}

      {contributor && contributor.pending > 0 && onSettle && (
        <p className="you-pending">
          {contributor.pending} ballot{contributor.pending === 1 ? "" : "s"} waiting on their settlement round.{" "}
          <button className="link-btn" disabled={settling} onClick={onSettle}>
            {settling ? "Settling…" : "Settle now"}
          </button>
        </p>
      )}

      {hot && (
        <div className="onramp">
          <p className="onramp-head">{contributor!.streak} calls right in a row.</p>
          <p className="foot">
            You are reading this book better than the crowd. Take the same trade with your own size on
            DreamDEX.
          </p>
          <a className="btn btn-accent" href={DREAMDEX_APP_URL} target="_blank" rel="noreferrer">
            Trade SOMI:USDso yourself →
          </a>
        </div>
      )}

      <h4 className="you-sub">Your desks</h4>
      {myDesks.length ? (
        <ul className="you-desks">
          {myDesks.map((d) => (
            <li key={d.deskId}>
              <Link href={`/desk/${d.deskId}`}>{d.name}</Link>
              <span className={`num pnl-${d.pnl > 0 ? "up" : d.pnl < 0 ? "down" : "flat"}`}>
                {signedUsd(d.pnl)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="foot">
          None yet. <Link href="/create">Open a desk</Link> and let the crowd trade it.
        </p>
      )}
    </aside>
  );
}
