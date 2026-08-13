import type { DeskSchedule } from "@/hooks/useDeskRound";
import { SHANNON_EXPLORER } from "@/lib/chain/constants";
import { VOTE_FRUIT } from "@/lib/desk/fruits";
import { ROUND_SECONDS, shortAddress } from "@/lib/desk/round";
import type { Phase, RoundBallot, Vote, VoteTally, Voter } from "@/lib/desk/types";

const TX_HASH = /^0x[a-fA-F0-9]{64}$/;

function txHref(hash: string): string | null {
  return TX_HASH.test(hash) ? `${SHANNON_EXPLORER}/tx/${hash}` : null;
}

function ReactivityStrip({
  schedule,
  fired,
  onOpenRules,
}: {
  schedule: DeskSchedule;
  fired: boolean;
  onOpenRules?: () => void;
}) {
  const href = schedule.scheduleTxHash ? txHref(schedule.scheduleTxHash) : null;

  return (
    <div className={`reactivity ${fired ? "fired" : "armed"}`}>
      <span className="reactivity-dot" aria-hidden />
      <span className="reactivity-label">
        {fired
          ? "Reactivity fired — chain ended the round"
          : "Round end scheduled on-chain — no keeper, no cron"}
      </span>
      {schedule.subscriptionId && <code>sub #{schedule.subscriptionId}</code>}
      {href && (
        <a href={href} target="_blank" rel="noreferrer">
          subscribe tx
        </a>
      )}
      {onOpenRules && (
        <button type="button" className="rules-link" onClick={onOpenRules}>
          What is Reactivity?
        </button>
      )}
    </div>
  );
}

function VoteMark({
  vote,
  cased = "lower",
}: {
  vote: Vote;
  cased?: "lower" | "upper";
}) {
  const fruit = VOTE_FRUIT[vote];
  const word = cased === "upper" ? vote.toUpperCase() : vote;
  return (
    <>
      <img className="vote-fruit" src={fruit.src} alt="" width={16} height={16} />
      {word}
    </>
  );
}

function yourCall(myVote: Vote | null, winner: Vote): string {
  if (!myVote) return "You did not vote this round";
  if (myVote === winner) return `You matched — voted ${myVote.toUpperCase()}`;
  if (winner === "hold") return `You voted ${myVote.toUpperCase()} — stall held`;
  if (myVote === "hold") return "You held while the stall traded";
  return `You missed — voted ${myVote.toUpperCase()}`;
}

function executeLine(opts: {
  phase: Phase;
  winner: Vote;
  executeHash: string | null;
  executeError: string | null;
}): { label: string; tone: "ok" | "warn" | "mute" } {
  const { phase, winner, executeHash, executeError } = opts;
  if (phase === "blocked" || (executeError && /OnlyApprovedContracts/i.test(executeError))) {
    return { label: "placeOrderFor rejected — OnlyApprovedContracts", tone: "warn" };
  }
  if (winner === "hold") return { label: "Hold — no order sent", tone: "mute" };
  if (executeError && !executeHash) return { label: executeError, tone: "warn" };
  if (executeHash) return { label: `placeOrderFor ${winner.toUpperCase()} posted`, tone: "ok" };
  return { label: `Winner ${winner.toUpperCase()} — no transaction`, tone: "mute" };
}

export function RoundPanel({
  phase,
  round,
  clock,
  votes,
  totalVotes,
  votedCount,
  myVote,
  winner,
  signProgress,
  sessionLabel,
  roundMid,
  mid,
  autoplaying,
  canVote,
  liveMode,
  executeHash,
  executeError,
  liveBallots,
  schedule,
  voters,
  youId,
  onVote,
  onOpenRules,
  playerName,
  onPlayerName,
  needsName,
}: {
  phase: Phase;
  round: number;
  clock: string;
  votes: VoteTally;
  totalVotes: number;
  votedCount: number;
  myVote: Vote | null;
  winner: Vote | null;
  signProgress: number;
  sessionLabel: string;
  roundMid: number;
  mid: number;
  autoplaying: boolean;
  canVote: boolean;
  liveMode: boolean;
  executeHash: string | null;
  executeError: string | null;
  liveBallots: RoundBallot[];
  schedule: DeskSchedule;
  voters: Voter[];
  youId?: string;
  onVote: (v: Vote) => void;
  onOpenRules?: () => void;
  playerName?: string;
  onPlayerName?: (name: string) => void;
  needsName?: boolean;
}) {
  const settled = phase === "scored" || phase === "blocked";
  const hasOutcome =
    settled && (!!winner || totalVotes > 0 || !!executeHash || !!executeError);

  if (
    phase !== "voting" &&
    phase !== "resolving" &&
    phase !== "signing" &&
    !hasOutcome
  ) {
    return null;
  }

  const you = youId?.toLowerCase();
  const youVoter = voters.find((u) => u.id === "you" || (you && u.id === you));
  const roster =
    liveBallots.length > 0
      ? liveBallots.map((b) => ({
          id: b.address,
          name: b.name || shortAddress(b.address),
          vote: b.vote,
          you: you ? b.address.toLowerCase() === you : false,
        }))
      : voters
          .filter((u) => u.vote)
          .map((u) => ({
            id: u.id,
            name: u.name,
            vote: u.vote as Vote,
            you: u.id === "you" || (!!you && u.id === you),
          }));

  return (
    <div className={`round rise ${phase}`}>
      <div className="round-top">
        <strong>{hasOutcome ? `Round ${round || 1} harvest` : `Stall round ${round || 1}`}</strong>
        <span className="clock">
          {phase === "voting" ? clock : hasOutcome ? "ended" : "resolving"}
        </span>
      </div>
      {liveMode && (schedule.subscriptionId || schedule.scheduleTxHash) && (
        <ReactivityStrip
          schedule={schedule}
          fired={phase !== "voting"}
          onOpenRules={onOpenRules}
        />
      )}
      {!hasOutcome && (
        <p className="hint">
          {liveMode
            ? "Signed 1 vote per wallet. Ballots stay blind until Somnia Reactivity ends the round (" +
              ROUND_SECONDS +
              "s demo window)"
            : `Demo clock compresses 5:00 → ${ROUND_SECONDS}s · ballots stay blind until the clock hits zero`}
          {onOpenRules && (
            <>
              {" · "}
              <button type="button" className="rules-link" onClick={onOpenRules}>
                How the stall works
              </button>
            </>
          )}
        </p>
      )}

      {phase === "voting" ? (
        <div className="blind-tally">
          <strong>
            {votedCount} {votedCount === 1 ? "wallet" : "wallets"} voted
          </strong>
          <em>Choices hidden until the round ends</em>
        </div>
      ) : (
        <div className="bars">
          {(["bid", "ask", "hold"] as Vote[]).map((k) => (
            <div key={k} className={`bar-row ${k} ${winner === k ? "won" : ""}`}>
              <span className="bar-vote">
                <VoteMark vote={k} />
              </span>
              <div className="track">
                <i style={{ width: `${totalVotes ? (votes[k] / totalVotes) * 100 : 0}%` }} />
              </div>
              <em>{votes[k]}</em>
            </div>
          ))}
        </div>
      )}

      {phase === "voting" && (
        <>
          {needsName && onPlayerName && (
            <label className="name-field">
              <span>Badge name (locked at mint)</span>
              <input
                type="text"
                value={playerName ?? ""}
                maxLength={24}
                autoComplete="nickname"
                placeholder="e.g. mango"
                onChange={(e) => onPlayerName(e.target.value.trim())}
              />
              <small>3–24 characters · letters, numbers, . _ -</small>
            </label>
          )}
          <div className="vote-actions">
            {(["bid", "ask", "hold"] as Vote[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`vote ${k} ${myVote === k ? "on" : ""}`}
                disabled={!!myVote || autoplaying || !canVote}
                onClick={() => onVote(k)}
              >
                <VoteMark vote={k} />
              </button>
            ))}
          </div>
        </>
      )}

      {winner && !hasOutcome && (
        <div className="resolve-banner">
          Winner: <strong><VoteMark vote={winner} cased="upper" /></strong>
          {winner !== "hold" && " · session key executing"}
          {phase === "signing" && (
            <div className="sign">
              <div className="sign-bar">
                <i style={{ width: `${Math.max(signProgress, 1) * 20}%` }} />
              </div>
              <span>
                {sessionLabel} signing placeOrderFor
                {executeHash ? ` · ${executeHash.slice(0, 10)}…` : ` · step ${signProgress}/5`}
              </span>
            </div>
          )}
        </div>
      )}

      {hasOutcome && winner && (
        <Outcome
          winner={winner}
          votes={votes}
          myVote={myVote}
          youCall={yourCall(myVote, winner)}
          youDelta={youVoter?.delta}
          execute={executeLine({ phase, winner, executeHash, executeError })}
          executeHash={executeHash}
          executeError={executeError}
          roundMid={roundMid}
          mid={mid}
          roster={roster}
          onOpenRules={onOpenRules}
        />
      )}
    </div>
  );
}

function Outcome({
  winner,
  votes,
  myVote,
  youCall,
  youDelta,
  execute,
  executeHash,
  executeError,
  roundMid,
  mid,
  roster,
  onOpenRules,
}: {
  winner: Vote;
  votes: VoteTally;
  myVote: Vote | null;
  youCall: string;
  youDelta: number | undefined;
  execute: { label: string; tone: "ok" | "warn" | "mute" };
  executeHash: string | null;
  executeError: string | null;
  roundMid: number;
  mid: number;
  roster: { id: string; name: string; vote: Vote; you: boolean }[];
  onOpenRules?: () => void;
}) {
  const href = executeHash ? txHref(executeHash) : null;
  const moved = mid !== roundMid;

  return (
    <div className="outcome">
      <div className={`outcome-hero ${winner}`}>
        <span className="outcome-kicker">Winner</span>
        <strong>
          <VoteMark vote={winner} cased="upper" />
        </strong>
        <span className="outcome-tally">
          {votes.bid} bid · {votes.ask} ask · {votes.hold} hold
        </span>
      </div>

      <dl className="outcome-grid">
        <div>
          <dt>Your vote</dt>
          <dd>
            {myVote ? <VoteMark vote={myVote} cased="upper" /> : "—"}
            <small>{youCall}</small>
            {typeof youDelta === "number" && youDelta !== 0 && (
              <em className={youDelta > 0 ? "up" : "down"}>
                {youDelta > 0 ? `+${youDelta}` : youDelta} pts
              </em>
            )}
          </dd>
        </div>
        <div>
          <dt>Execution</dt>
          <dd className={execute.tone}>
            {execute.label}
            {executeError && execute.tone === "ok" && <small>{executeError}</small>}
          </dd>
        </div>
        <div className="outcome-tx">
          <dt>Transaction</dt>
          <dd>
            {executeHash ? (
              href ? (
                <a href={href} target="_blank" rel="noreferrer">
                  {executeHash}
                </a>
              ) : (
                <code>{executeHash}</code>
              )
            ) : (
              "None"
            )}
          </dd>
        </div>
        <div>
          <dt>Mark</dt>
          <dd>
            {roundMid.toFixed(4)}
            {moved ? ` → ${mid.toFixed(4)}` : " — unchanged"}
            <small>
              Match +10 · opposite −6 · hold +2 if quiet
              {onOpenRules && (
                <>
                  {" · "}
                  <button type="button" className="rules-link" onClick={onOpenRules}>
                    How the stall works
                  </button>
                </>
              )}
            </small>
          </dd>
        </div>
      </dl>

      {roster.length > 0 && (
        <ul className="outcome-ballots">
          {roster.map((b) => (
            <li key={b.id} className={`${b.vote} ${b.you ? "you" : ""} ${b.vote === winner ? "hit" : "miss"}`}>
              <span>{b.you ? "You" : b.name}</span>
              <em>
                <VoteMark vote={b.vote} />
              </em>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
