"use client";

import { useMemo } from "react";
import type { MyStake, PoolRow } from "@/lib/arena/types";

function stt(v: number) {
  return v.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

/** Open and settled positions, with the claim. Settling is permissionless, so if a
 * round is scored but nobody has settled the pool yet, this offers to do it. */
export function MyStakes({
  stakes,
  pools,
  busy,
  onClaim,
  onClaimAll,
  onSettle,
}: {
  stakes: MyStake[];
  pools: PoolRow[];
  busy: string | null;
  onClaim: (roundId: number, deskId: number) => Promise<unknown>;
  onClaimAll: (positions: { roundId: number; deskId: number }[]) => Promise<unknown>;
  onSettle: (roundId: number, deskId: number) => Promise<unknown>;
}) {
  const rows = useMemo(
    () =>
      [...stakes]
        .sort((a, b) => b.roundId - a.roundId || a.deskId - b.deskId)
        .map((s) => ({ ...s, pool: pools.find((p) => p.roundId === s.roundId && p.deskId === s.deskId) })),
    [stakes, pools],
  );
  const claimables = rows.filter((r) => !r.claimed && r.claimable > 0);
  const total = claimables.reduce((sum, r) => sum + r.claimable, 0);

  if (!rows.length) return null;

  return (
    <section className="panel">
      <div className="section-head">
        <h3>Your positions</h3>
        {claimables.length > 1 && (
          <button
            className="btn"
            disabled={!!busy}
            onClick={() => void onClaimAll(claimables.map((r) => ({ roundId: r.roundId, deskId: r.deskId })))}
          >
            {busy === "claimAll" ? "Claiming…" : `Claim all · ${stt(total)} STT`}
          </button>
        )}
      </div>
      <div className="board-scroll">
        <table className="board">
          <thead>
            <tr>
              <th>Round</th>
              <th>Desk</th>
              <th className="right">Staked</th>
              <th>Side</th>
              <th>Result</th>
              <th className="right">Return</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const settled = r.pool?.settled;
              const staked = r.bid + r.ask;
              const side = r.bid > 0 && r.ask > 0 ? "both" : r.bid > 0 ? "Buy" : "Sell";
              const won = settled && !r.pool?.refunded && r.claimable > 0;
              return (
                <tr key={`${r.roundId}-${r.deskId}`}>
                  <td className="dim num">{r.roundId}</td>
                  <td className="dim num">#{r.deskId}</td>
                  <td className="right num">{stt(staked)}</td>
                  <td className={side === "Buy" ? "up" : side === "Sell" ? "down" : ""}>{side}</td>
                  <td>
                    {!settled ? (
                      <span className="dim">pending</span>
                    ) : r.pool?.refunded ? (
                      <span className="dim">flat — refunded</span>
                    ) : won ? (
                      <span className="up">won</span>
                    ) : (
                      <span className="down">lost</span>
                    )}
                  </td>
                  <td className={`right num ${won ? "up" : "dim"}`}>
                    {r.claimed ? "claimed" : settled ? stt(r.claimable) : "—"}
                  </td>
                  <td>
                    {!settled ? (
                      <button
                        className="link-btn"
                        disabled={!!busy}
                        onClick={() => void onSettle(r.roundId, r.deskId)}
                        title="Anyone can settle a scored round — this unlocks the payouts"
                      >
                        {busy === `settlePool:${r.roundId}` ? "…" : "settle"}
                      </button>
                    ) : r.claimed || r.claimable === 0 ? (
                      <span className="foot dim">—</span>
                    ) : (
                      <button
                        className="link-btn"
                        disabled={!!busy}
                        onClick={() => void onClaim(r.roundId, r.deskId)}
                      >
                        {busy === `claim:${r.roundId}:${r.deskId}` ? "…" : "claim"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
