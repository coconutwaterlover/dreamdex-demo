"use client";

import { useMemo, useState } from "react";
import { clock } from "@/lib/arena/format";
import type { DeskRow, MyStake, PoolRow, StakeConfig } from "@/lib/arena/types";

const PRESETS = ["0.01", "0.05", "0.1", "0.5"];

function stt(v: number, digits = 4) {
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Back a side with real money. Winners are paid out of the losing side's stake, so the
 * pool is always solvent by construction and nothing is ever paid from profit that
 * might reverse.
 */
export function StakePanel({
  desk,
  pool,
  config,
  mine,
  connected,
  busy,
  secondsToLock,
  onStake,
}: {
  desk: DeskRow;
  pool?: PoolRow;
  config: StakeConfig | null;
  mine?: MyStake;
  connected: boolean;
  busy: string | null;
  secondsToLock: number;
  onStake: (deskId: number, side: "bid" | "ask", amount: string) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState("0.05");
  const [side, setSide] = useState<"bid" | "ask">("bid");

  const rakePct = config ? (config.ownerRakeBps + config.treasuryRakeBps) / 100 : 3;
  const open = !!pool?.open && !desk.retired;
  const amountNum = Number(amount) || 0;

  // Odds move as you stake — show what this specific stake would return, not the
  // headline number, because the headline is stale the moment you commit.
  const projected = useMemo(() => {
    if (!pool || amountNum <= 0) return null;
    const mySide = side === "bid" ? pool.bid : pool.ask;
    const otherSide = side === "bid" ? pool.ask : pool.bid;
    const winPool = mySide + amountNum;
    const losing = otherSide + pool.rollover;
    const net = losing * (1 - rakePct / 100);
    const payout = amountNum + (net * amountNum) / winPool;
    return { payout, multiple: payout / amountNum };
  }, [pool, amountNum, side, rakePct]);

  const valid = config ? amountNum >= config.minStake : amountNum > 0;

  return (
    <section className="panel stake">
      <div className="section-head">
        <h3>Stake the next move</h3>
        <span className="foot">
          {open ? (
            <>locks in {clock(secondsToLock)}</>
          ) : (
            <span className="warn">locked — settles, then the next round opens</span>
          )}
        </span>
      </div>

      <p className="foot">
        Winners are paid by losers. Your stake goes into this desk&apos;s pool; if your side is
        right, you take your stake back plus a share of the other side, minus a {rakePct}% rake.
        <strong> Nothing is paid out of the desk&apos;s trading profit</strong> — the money is
        already in the pool.
      </p>

      <div className="stake-pot">
        <div>
          <dt>Pot</dt>
          <dd className="num">{stt(pool?.pot ?? 0)} STT</dd>
          {!!pool?.rollover && (
            <dd className="foot">
              includes {stt(pool.rollover)} rolled over from rounds nobody won
            </dd>
          )}
        </div>
        <div>
          <dt>On Buy</dt>
          <dd className="num up">{stt(pool?.bid ?? 0)}</dd>
          <dd className="foot">{pool?.bidOdds ? `${pool.bidOdds.toFixed(2)}× if right` : "no backers"}</dd>
        </div>
        <div>
          <dt>On Sell</dt>
          <dd className="num down">{stt(pool?.ask ?? 0)}</dd>
          <dd className="foot">{pool?.askOdds ? `${pool.askOdds.toFixed(2)}× if right` : "no backers"}</dd>
        </div>
      </div>

      {mine && (mine.bid > 0 || mine.ask > 0) && (
        <p className="stake-mine">
          You have{" "}
          {mine.bid > 0 && (
            <>
              <strong className="up">{stt(mine.bid)} on Buy</strong>
              {mine.ask > 0 ? " and " : ""}
            </>
          )}
          {mine.ask > 0 && <strong className="down">{stt(mine.ask)} on Sell</strong>} in this round.
        </p>
      )}

      <div className="stake-sides">
        {(["bid", "ask"] as const).map((s) => (
          <button
            key={s}
            className={`stake-side stake-${s}${side === s ? " is-on" : ""}`}
            onClick={() => setSide(s)}
            disabled={!open}
          >
            {s === "bid" ? "Buy" : "Sell"}
            <span className="foot">
              {s === "bid" ? "price goes up" : "price goes down"}
            </span>
          </button>
        ))}
      </div>

      <div className="stake-amount">
        <label>
          <span className="foot">Amount (STT)</span>
          <input
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            disabled={!open}
          />
        </label>
        <div className="stake-presets">
          {PRESETS.map((p) => (
            <button key={p} className={amount === p ? "pill is-on" : "pill"} onClick={() => setAmount(p)} disabled={!open}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {projected && open && (
        <p className="stake-projection">
          If <strong>{side === "bid" ? "Buy" : "Sell"}</strong> is right you get back{" "}
          <strong>{stt(projected.payout)} STT</strong> ({projected.multiple.toFixed(2)}× your stake).
          If it&apos;s wrong you lose the {stt(amountNum)}. A flat round refunds everyone.
        </p>
      )}

      <button
        className="btn btn-accent btn-lg"
        disabled={!open || !valid || !!busy}
        onClick={() => void onStake(desk.deskId, side, amount)}
      >
        {busy === `stake:${desk.deskId}`
          ? "Staking…"
          : !connected
            ? `Connect & stake ${amount} STT on ${side === "bid" ? "Buy" : "Sell"}`
            : !open
              ? "Staking closed for this round"
              : `Stake ${amount} STT on ${side === "bid" ? "Buy" : "Sell"}`}
      </button>

      <p className="foot">
        Staking is directional only — Hold stays a free vote, because in a quiet market a
        &ldquo;no move&rdquo; side would win constantly and the pools would go dead. Stakes lock{" "}
        {config?.lockSeconds ?? 60}s before the boundary so nobody can lean on late drift.
      </p>
    </section>
  );
}
