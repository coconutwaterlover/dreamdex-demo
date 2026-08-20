"use client";

import { price, signedUsd, somi, usd } from "@/lib/arena/format";
import { txHref } from "@/lib/chain/constants";
import type { DeskRow, MirrorRow, RealBook, Scale } from "@/lib/arena/types";

/**
 * The honest panel.
 *
 * A desk has two legs that people conflate: a modelled book that decides the
 * leaderboard, and — if armed — a real order that decides nothing. Rather than pick one
 * and hide the other, this puts them side by side and names the gap, so the difference
 * is a visible number instead of a surprise.
 */
export function ModelledVsReal({
  desk,
  scale,
  real,
  mirror,
  mirrorSince,
}: {
  desk: DeskRow;
  scale: Scale | null;
  real?: RealBook;
  mirror: MirrorRow[];
  mirrorSince: number;
}) {
  const rows = mirror.filter((m) => m.deskId === desk.deskId).slice(0, 8);
  const ratio = scale?.ratio ?? 0;

  return (
    <section className="panel mvr">
      <div className="section-head">
        <h3>Modelled vs real</h3>
        <span className="foot">what the board scores · what hit the book</span>
      </div>

      {!desk.armed && (
        <p className="foot">
          This desk is <strong>paper only</strong> — it has no real leg. Everything below the
          modelled column is what the leaderboard uses. Grant a session key to add a real order
          beside it.
        </p>
      )}

      <table className="mvr-table">
        <thead>
          <tr>
            <th />
            <th>Modelled <span className="tag tag-scores">scores</span></th>
            <th>Real {desk.armed ? <span className="tag">no effect on rank</span> : null}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Lot per round</th>
            <td className="num">{scale ? `${somi(scale.paperLotSomi)} SOMI` : "—"}</td>
            <td className="num">
              {desk.armed && scale ? `${somi(scale.realLotSomi)} SOMI` : "—"}
            </td>
          </tr>
          <tr>
            <th>Position</th>
            <td className="num">
              {desk.base === 0 ? "flat" : `${desk.base > 0 ? "+" : "−"}${somi(Math.abs(desk.base))} SOMI`}
            </td>
            <td className="num">{real ? `${somi(real.somi)} SOMI` : "—"}</td>
          </tr>
          <tr>
            <th>Quote balance</th>
            <td className="num">{usd(desk.cash)} USDso</td>
            <td className="num">{real ? `${usd(real.usdso)} USDso` : "—"}</td>
          </tr>
          <tr>
            <th>Profit</th>
            <td className={`num pnl-${desk.pnl > 0 ? "up" : desk.pnl < 0 ? "down" : "flat"}`}>
              {signedUsd(desk.pnl)} USDso
            </td>
            <td className="num dim">not scored</td>
          </tr>
        </tbody>
      </table>

      {desk.armed && ratio > 1 && (
        <p className="mvr-gap">
          <strong>Tracking gap.</strong> The leaderboard moves{" "}
          <strong>{somi(scale!.paperLotSomi)} SOMI</strong> a round while the real order is{" "}
          <strong>{somi(scale!.realLotSomi)} SOMI</strong> — about{" "}
          <strong>{(100 / ratio).toFixed(2)}%</strong> of it. The real leg proves the session key
          works; it is not a scaled copy of the modelled position, and its fills do not move the
          rank.
        </p>
      )}

      {desk.armed && (
        <>
          <h4 className="mvr-sub">Real orders placed</h4>
          {rows.length ? (
            <div className="board-scroll">
              <table className="board">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>Side</th>
                    <th className="right">Intended</th>
                    <th className="right">Placed</th>
                    <th className="right">Slip</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={`${m.roundId}-${m.deskId}`}>
                      <td className="dim num">{m.roundId}</td>
                      <td className={m.side === "bid" ? "up" : m.side === "ask" ? "down" : ""}>
                        {m.side === "bid" ? "Buy" : m.side === "ask" ? "Sell" : "Wait"}
                      </td>
                      <td className="right num">{m.intendedPrice ? price(m.intendedPrice) : "—"}</td>
                      <td className="right num">
                        {m.placedPrice ? price(m.placedPrice) : "—"}
                        {m.repriced && (
                          <span className="tag tag-pending" title="PostOnly would have crossed, so it was stepped inside the touch">
                            repriced
                          </span>
                        )}
                      </td>
                      <td className={`right num ${m.slipBps ? (m.slipBps > 0 ? "up" : "down") : "dim"}`}>
                        {m.slipBps === null ? "—" : `${m.slipBps > 0 ? "+" : ""}${m.slipBps} bps`}
                      </td>
                      <td>
                        {m.txHash ? (
                          <a href={txHref(m.txHash) ?? "#"} target="_blank" rel="noreferrer">
                            filled tx
                          </a>
                        ) : (
                          <span className="warn foot">{m.error ?? "—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="foot">
              No real orders recorded yet on this server instance (since{" "}
              {new Date(mirrorSince).toLocaleTimeString()}). This log lives in memory, so a cold
              start shows an empty history even though the orders happened — the chain is the
              record, not this table.
            </p>
          )}
          <p className="foot">
            Each order is priced from the arena&apos;s settled mid rather than the book a few
            seconds later, so <em>intended</em> is exactly the number the leaderboard used.
            <em> Slip</em> is what PostOnly forced on top of it.
          </p>
        </>
      )}
    </section>
  );
}
