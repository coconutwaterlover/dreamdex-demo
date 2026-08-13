import { VOTE_FRUIT } from "@/lib/desk/fruits";
import type { DeskView, Phase, Vote } from "@/lib/desk/types";
import {
  formatLot,
  formatPx,
  stallSize,
  VOTE_META,
} from "@/lib/desk/voteMeta";

export function StallMap({
  desk,
  mid,
  bid,
  ask,
  lot,
  winner,
  phase,
  focusVote,
}: {
  desk: DeskView;
  mid: number;
  bid: number;
  ask: number;
  lot: number;
  winner: Vote | null;
  phase: Phase;
  focusVote: Vote | null;
}) {
  const qty = stallSize(lot);
  const settled = !!winner && (phase === "signing" || phase === "scored" || phase === "blocked");
  const shown = focusVote;
  const fruit = shown ? VOTE_FRUIT[shown] : null;
  const motion = shown === "bid" ? "in" : shown === "ask" ? "out" : shown === "hold" ? "still" : "";

  return (
    <div className={`book stall-map ${desk.live ? "live" : ""} ${desk.revoked ? "dead" : ""}`}>
      <div className="book-head">
        <strong>SOMI / USDso</strong>
        <span className={desk.live ? "live-tag" : "mute-tag"}>
          {desk.revoked ? "frozen" : desk.live ? `${formatLot(qty)} SOMI lot` : "waiting"}
        </span>
      </div>

      <p className="stall-legend">Where the stall’s order would sit — one PostOnly lot, or nothing.</p>

      <div className="stall-ladder">
        <div className="stall-side-label ask">Sellers</div>

        <div className={`stall-slot ask ${shown === "ask" ? "on" : ""} ${settled && winner === "ask" ? "resting-slot" : ""}`}>
          <div className="stall-slot-copy">
            <span>{formatPx(ask)}</span>
            <em>{VOTE_META.ask.rest}</em>
            <small>{formatLot(qty)} SOMI</small>
          </div>
          {shown === "ask" && fruit && (
            <img
              key="ask-fruit"
              className={`stall-fruit ${motion} ${settled ? "settled" : ""}`}
              src={fruit.src}
              alt=""
              width={36}
              height={36}
            />
          )}
        </div>

        <div className={`stall-mid ${shown === "hold" ? "on" : ""}`}>
          <span>mid</span>
          <em>{formatPx(mid)}</em>
          {shown === "hold" && fruit && (
            <img
              className={`stall-fruit still ${settled ? "settled" : ""}`}
              src={fruit.src}
              alt=""
              width={32}
              height={32}
            />
          )}
          <small>{VOTE_META.hold.rest}</small>
        </div>

        <div className={`stall-slot bid ${shown === "bid" ? "on" : ""} ${settled && winner === "bid" ? "resting-slot" : ""}`}>
          <div className="stall-slot-copy">
            <span>{formatPx(bid)}</span>
            <em>{VOTE_META.bid.rest}</em>
            <small>{formatLot(qty)} SOMI</small>
          </div>
          {shown === "bid" && fruit && (
            <img
              className={`stall-fruit ${motion} ${settled ? "settled" : ""}`}
              src={fruit.src}
              alt=""
              width={36}
              height={36}
            />
          )}
        </div>

        <div className="stall-side-label bid">Buyers</div>
      </div>

      {settled && winner && winner !== "hold" && (
        <div className="resting rise">
          {winner === "bid" ? "Buy" : "Sell"} of {formatLot(qty)} SOMI resting @ {winner === "bid" ? formatPx(bid) : formatPx(ask)}
        </div>
      )}
      {settled && winner === "hold" && <div className="resting mute rise">Stall stayed quiet — no order</div>}
    </div>
  );
}
