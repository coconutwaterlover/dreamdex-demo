"use client";

import Link from "next/link";
import { ordinal, shortAddress, signedUsd, somi, tone, usd } from "@/lib/arena/format";
import type { DeskRow } from "@/lib/arena/types";

export function DeskBoard({ desks, me, limit }: { desks: DeskRow[]; me?: string; limit?: number }) {
  const rows = limit ? desks.slice(0, limit) : desks;
  if (!rows.length) {
    return <p className="empty">No desks yet — the first one to open the arena sets the pace.</p>;
  }
  return (
    <table className="board">
      <thead>
        <tr>
          <th>#</th>
          <th>Desk</th>
          <th>Owner</th>
          <th className="right">Profit</th>
          <th className="right">Season</th>
          <th className="right">Equity</th>
          <th className="right">Position</th>
          <th className="right">Rounds</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => {
          const isMe = !!me && d.owner.toLowerCase() === me.toLowerCase();
          return (
            <tr key={d.deskId} className={isMe ? "is-me" : undefined}>
              <td className="dim">{d.retired ? "—" : ordinal(d.rank)}</td>
              <td>
                <Link href={`/desk/${d.deskId}`}>{d.name}</Link>
                {d.armed && <span className="tag tag-armed">live</span>}
                {d.retired && <span className="tag">retired</span>}
              </td>
              <td className="dim">
                {shortAddress(d.owner)}
                {isMe && <span className="tag tag-you">you</span>}
              </td>
              <td className={`right num pnl-${tone(d.pnl)}`}>{signedUsd(d.pnl)}</td>
              <td className={`right num dim`}>{signedUsd(d.seasonPnl)}</td>
              <td className="right num">{usd(d.equity)}</td>
              <td className="right num">
                {d.base === 0 ? "flat" : `${d.base > 0 ? "+" : "−"}${somi(Math.abs(d.base))}`}
              </td>
              <td className="right num dim">
                {d.roundsTraded} / {d.wins}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
