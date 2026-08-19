"use client";

import { ordinal, shortAddress, signedPoints } from "@/lib/arena/format";
import { badgeTokenHref } from "@/lib/chain/constants";
import type { ContributorRow } from "@/lib/arena/types";

export function ContributorBoard({
  rows,
  me,
  collection,
  limit,
  onSettle,
  settling,
}: {
  rows: ContributorRow[];
  me?: string;
  collection?: string | null;
  limit?: number;
  onSettle?: () => void;
  settling?: boolean;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  if (!rows.length) {
    return <p className="empty">No ballots yet. The first vote of the round opens the board.</p>;
  }
  return (
    <table className="board">
      <thead>
        <tr>
          <th>#</th>
          <th>Contributor</th>
          <th className="right">Points</th>
          <th className="right">Season</th>
          <th className="right">Streak</th>
          <th className="right">Calls</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((row) => {
          const isMe = !!me && row.wallet.toLowerCase() === me.toLowerCase();
          const href = row.tokenId ? badgeTokenHref(collection as `0x${string}` | undefined, row.tokenId) : null;
          return (
            <tr key={row.wallet} className={isMe ? "is-me" : undefined}>
              <td className="dim">{ordinal(row.rank)}</td>
              <td>
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer">
                    {row.handle || shortAddress(row.wallet)}
                  </a>
                ) : (
                  row.handle || shortAddress(row.wallet)
                )}
                {isMe && <span className="tag tag-you">you</span>}
                {row.pending > 0 && (
                  <span className="tag tag-pending" title={`${row.pending} ballots waiting on their settlement round`}>
                    {row.pending} pending
                  </span>
                )}
              </td>
              <td className={`right num ${row.points > 0 ? "up" : row.points < 0 ? "down" : ""}`}>
                {signedPoints(row.points)}
              </td>
              <td className="right num dim">{signedPoints(row.seasonPoints)}</td>
              <td className="right num">
                {row.streak > 0 ? `${row.streak}🔥` : "—"}
                <span className="dim"> / {row.bestStreak}</span>
              </td>
              <td className="right num dim">{row.ballotsCast}</td>
            </tr>
          );
        })}
      </tbody>
      {onSettle && (
        <tfoot>
          <tr>
            <td colSpan={6}>
              <button className="link-btn" disabled={settling} onClick={onSettle}>
                {settling ? "Settling…" : "Settle my pending ballots"}
              </button>
              <span className="foot">
                {" "}
                — anyone can settle anyone; your next vote does it for you automatically.
              </span>
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
