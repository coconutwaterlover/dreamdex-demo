import { ROUND_SECONDS } from "@/lib/desk/round";
import type { Phase, Vote, VoteTally } from "@/lib/desk/types";

export function RoundPanel({
  phase,
  round,
  clock,
  votes,
  totalVotes,
  myVote,
  winner,
  signProgress,
  sessionLabel,
  roundMid,
  mid,
  autoplaying,
  onVote,
}: {
  phase: Phase;
  round: number;
  clock: string;
  votes: VoteTally;
  totalVotes: number;
  myVote: Vote | null;
  winner: Vote | null;
  signProgress: number;
  sessionLabel: string;
  roundMid: number;
  mid: number;
  autoplaying: boolean;
  onVote: (v: Vote) => void;
}) {
  if (phase !== "voting" && phase !== "resolving" && phase !== "signing" && phase !== "scored") {
    return null;
  }

  return (
    <div className={`round rise ${phase}`}>
      <div className="round-top">
        <strong>Swarm round {round || 1}</strong>
        <span className="clock">
          {phase === "voting" ? clock : phase === "scored" ? "scored" : "resolving"}
        </span>
      </div>
      <p className="hint">Demo clock compresses 5:00 → {ROUND_SECONDS}s</p>

      <div className="bars">
        {(["bid", "ask", "hold"] as Vote[]).map((k) => (
          <div key={k} className={`bar-row ${k}`}>
            <span>{k}</span>
            <div className="track">
              <i style={{ width: `${(votes[k] / totalVotes) * 100}%` }} />
            </div>
            <em>{votes[k]}</em>
          </div>
        ))}
      </div>

      <div className="vote-actions">
        {(["bid", "ask", "hold"] as Vote[]).map((k) => (
          <button
            key={k}
            type="button"
            className={`vote ${k} ${myVote === k ? "on" : ""}`}
            disabled={phase !== "voting" || !!myVote || autoplaying}
            onClick={() => onVote(k)}
          >
            {k}
          </button>
        ))}
      </div>

      {winner && (
        <div className="resolve-banner">
          Winner: <strong>{winner.toUpperCase()}</strong>
          {winner !== "hold" && phase !== "scored" && " · session key executing"}
          {phase === "signing" && (
            <div className="sign">
              <div className="sign-bar">
                <i style={{ width: `${signProgress * 20}%` }} />
              </div>
              <span>
                {sessionLabel} signing placeOrderFor · step {signProgress}/5
              </span>
            </div>
          )}
          {phase === "scored" && (
            <p className="score-note">
              Mark {roundMid.toFixed(4)} → {mid.toFixed(4)}. Matching the winner: +10 · opposite: −6
              · hold: +2 if quiet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
