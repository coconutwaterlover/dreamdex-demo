import type { DeskSchedule } from "@/hooks/useDeskRound";
import { SHANNON_EXPLORER } from "@/lib/chain/constants";
import { VOTE_FRUIT } from "@/lib/desk/fruits";
import { ROUND_SECONDS, shortAddress } from "@/lib/desk/round";
import type { Phase, RoundBallot, Vote, VoteTally, Voter } from "@/lib/desk/types";
import {
  cardHint,
  committedLine,
  executeVerb,
  formatLot,
  outcomeHeadline,
  previewLine,
  sizeLine,
  VOTE_META,
  VOTE_ORDER,
} from "@/lib/desk/voteMeta";

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
  const meta = VOTE_META[vote];
  const word = cased === "upper" ? meta.title : meta.verb;
  return (
    <>
      <img className="vote-fruit" src={fruit.src} alt="" width={16} height={16} />
      {word}
    </>
  );
}

function yourCall(myVote: Vote | null, winner: Vote): string {
  if (!myVote) return "You did not vote this round";
  if (myVote === winner) return `You matched — voted ${VOTE_META[myVote].verb}`;
  if (winner === "hold") return `You voted ${VOTE_META[myVote].verb} — stall stayed quiet`;
  if (myVote === "hold") return "You waited while the stall traded";
  return `You missed — voted ${VOTE_META[myVote].verb}`;
}

function executeLine(opts: {
  phase: Phase;
  winner: Vote;
  executeHash: string | null;
  executeError: string | null;
  lot: number;
  bid: number;
  ask: number;
}): { label: string; tone: "ok" | "warn" | "mute" } {
  const { phase, winner, executeHash, executeError, lot, bid, ask } = opts;
  if (phase === "blocked" || (executeError && /OnlyApprovedContracts/i.test(executeError))) {
    return { label: "placeOrderFor rejected — OnlyApprovedContracts", tone: "warn" };
  }
  if (winner === "hold") return { label: executeVerb("hold", lot, bid, ask), tone: "mute" };
  if (executeError && !executeHash) return { label: executeError, tone: "warn" };
  if (executeHash) return { label: executeVerb(winner, lot, bid, ask), tone: "ok" };
  return { label: `${VOTE_META[winner].title} won — no transaction`, tone: "mute" };
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
  lot,
  bid,
  ask,
  previewVote,
  onPreviewVote,
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
  lot: number;
  bid: number;
  ask: number;
  previewVote: Vote | null;
  onPreviewVote: (vote: Vote | null) => void;
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
          Steer the stall. Majority posts one {formatLot(lot)} SOMI PostOnly — or nothing. You score
          if the crowd picks the same thing
          {liveMode
            ? ` · signed 1 vote per wallet, blind until Reactivity ends the round (${ROUND_SECONDS}s)`
            : ` · demo clock compresses 5:00 → ${ROUND_SECONDS}s`}
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
          {VOTE_ORDER.map((k) => (
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
          <div className="vote-actions" role="radiogroup" aria-label="Steer the stall">
            {VOTE_ORDER.map((k) => {
              const meta = VOTE_META[k];
              const fruit = VOTE_FRUIT[k];
              const selected = myVote === k;
              const preview = previewVote === k;
              return (
                <div
                  key={k}
                  className={`vote-wrap ${k} ${selected ? "on" : ""} ${preview ? "preview" : ""}`}
                  onPointerEnter={() => onPreviewVote(k)}
                  onPointerLeave={() => onPreviewVote(null)}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`vote-card ${k} ${selected ? "on" : ""}`}
                    disabled={!!myVote || autoplaying || !canVote}
                    aria-label={`${meta.title}. ${cardHint(k, lot, bid, ask)}`}
                    onFocus={() => onPreviewVote(k)}
                    onBlur={() => onPreviewVote(null)}
                    onClick={() => onVote(k)}
                  >
                    <img
                      className={`vote-fruit ${(preview || selected) ? `motion-${k}` : ""}`}
                      src={fruit.src}
                      alt=""
                      width={28}
                      height={28}
                    />
                    <strong>{meta.title}</strong>
                    <span className="vote-trader">{meta.trader}</span>
                    <span className="vote-size">{sizeLine(k, lot, bid, ask)}</span>
                    <span className="vote-hint">{cardHint(k, lot, bid, ask)}</span>
                  </button>
                </div>
              );
            })}
          </div>
          <p className="vote-preview" aria-live="polite">
            {previewVote
              ? previewLine(previewVote, lot, bid, ask)
              : myVote
                ? committedLine(myVote, lot, bid, ask)
                : "Hover a card to see where the stall’s order would sit."}
          </p>
        </>
      )}

      {winner && !hasOutcome && (
        <div className="resolve-banner">
          Crowd chose <strong><VoteMark vote={winner} cased="upper" /></strong>
          {winner !== "hold" && ` · session key posting ${formatLot(lot)} SOMI`}
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
          execute={executeLine({ phase, winner, executeHash, executeError, lot, bid, ask })}
          executeHash={executeHash}
          executeError={executeError}
          roundMid={roundMid}
          mid={mid}
          lot={lot}
          bid={bid}
          ask={ask}
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
  lot,
  bid,
  ask,
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
  lot: number;
  bid: number;
  ask: number;
  roster: { id: string; name: string; vote: Vote; you: boolean }[];
  onOpenRules?: () => void;
}) {
  const href = executeHash ? txHref(executeHash) : null;
  const moved = mid !== roundMid;

  return (
    <div className="outcome">
      <div className={`outcome-hero ${winner}`}>
        <span className="outcome-kicker">Crowd chose</span>
        <strong>
          <VoteMark vote={winner} cased="upper" />
        </strong>
        <p className="outcome-story">{outcomeHeadline(winner, lot, bid, ask)}</p>
        <span className="outcome-tally">
          {votes.bid} buy · {votes.ask} sell · {votes.hold} wait
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
              Match +10 · opposite −6 · wait +2 if quiet
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
