import type { DeskView, Phase, Vote } from "@/lib/desk/types";

type Level = { side: "bid" | "ask"; px: number; sz: number };

export function OrderBook({
  desk,
  mid,
  levels,
  winner,
  phase,
  bid,
  ask,
}: {
  desk: DeskView;
  mid: number;
  levels: Level[];
  winner: Vote | null;
  phase: Phase;
  bid: number;
  ask: number;
}) {
  return (
    <div className={`book ${desk.live ? "live" : ""} ${desk.revoked ? "dead" : ""}`}>
      <div className="book-head">
        <strong>SOMI / USDso</strong>
        <span className={desk.live ? "live-tag" : "mute-tag"}>
          {desk.revoked ? "frozen" : desk.live ? "ripe book" : "waiting"}
        </span>
      </div>
      <div className="midline">
        <span>mid</span>
        <em>{mid.toFixed(4)}</em>
      </div>
      <ul>
        {levels.map((l) => (
          <li key={`${l.side}-${l.px}`} className={l.side}>
            <span>{l.px.toFixed(4)}</span>
            <i style={{ width: `${Math.min(100, l.sz / 6)}%` }} />
            <span>{l.sz}</span>
          </li>
        ))}
      </ul>
      {winner && winner !== "hold" && (phase === "signing" || phase === "scored") && (
        <div className="resting rise">
          Stall {winner.toUpperCase()} resting @ {winner === "bid" ? bid : ask}
        </div>
      )}
    </div>
  );
}
