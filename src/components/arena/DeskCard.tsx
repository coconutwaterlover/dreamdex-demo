"use client";

import Link from "next/link";
import { useState } from "react";
import { CHOICE_META, CHOICE_ORDER, type Choice, type DeskRow } from "@/lib/arena/types";
import { ordinal, shortAddress, signedUsd, somi, tone, usd } from "@/lib/arena/format";
import { addressHref } from "@/lib/chain/constants";

type Props = {
  desk: DeskRow;
  /** Paper-lot / real-lot ratio, for the armed-desk footnote. */
  scaleRatio?: number;
  myVote: Choice;
  connected: boolean;
  busy: string | null;
  isOwner: boolean;
  onVote: (deskId: number, choice: Exclude<Choice, "none">) => void;
  compact?: boolean;
};

function RankBadge({ rank, retired }: { rank: number; retired: boolean }) {
  if (retired) return <span className="rank rank-retired">retired</span>;
  const medal = rank === 1 ? "rank-gold" : rank === 2 ? "rank-silver" : rank === 3 ? "rank-bronze" : "";
  return <span className={`rank ${medal}`}>{ordinal(rank)}</span>;
}

export function DeskCard({ desk, myVote, connected, busy, isOwner, onVote, compact, scaleRatio }: Props) {
  const [pending, setPending] = useState<Choice>("none");
  const voted = myVote !== "none";
  const total = desk.votes || 1;
  const pnlTone = tone(desk.pnl);

  const cast = async (choice: Exclude<Choice, "none">) => {
    setPending(choice);
    try {
      await onVote(desk.deskId, choice);
    } finally {
      setPending("none");
    }
  };

  return (
    <article className={`deskcard tone-${pnlTone}${desk.retired ? " is-retired" : ""}`}>
      <header className="deskcard-head">
        <div className="deskcard-id">
          <RankBadge rank={desk.rank} retired={desk.retired} />
          <div>
            <Link href={`/desk/${desk.deskId}`} className="deskcard-name">
              {desk.name}
            </Link>
            <p className="deskcard-owner">
              <a href={addressHref(desk.owner) ?? "#"} target="_blank" rel="noreferrer">
                {shortAddress(desk.owner)}
              </a>
              {isOwner && <span className="tag tag-you">yours</span>}
              {desk.armed ? (
                <span
                  className="tag tag-armed"
                  title="Owner granted the session key, so this desk also places a real minimum-size order on dreamDEX with its own funds. The leaderboard still scores the paper book."
                >
                  live orders
                </span>
              ) : desk.wantsLive ? (
                <span className="tag tag-pending" title="Owner wants live orders but the on-chain grant is missing">
                  grant pending
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="deskcard-pnl">
          <p className={`pnl pnl-${pnlTone}`}>{signedUsd(desk.pnl)}</p>
          <p className="foot">USDso profit</p>
        </div>
      </header>

      <dl className="deskcard-book">
        <div>
          <dt>Equity</dt>
          <dd>{usd(desk.equity)}</dd>
        </div>
        <div>
          <dt>Cash</dt>
          <dd>{usd(desk.cash)}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd className={desk.base > 0 ? "long" : desk.base < 0 ? "short" : ""}>
            {desk.base === 0 ? "flat" : `${desk.base > 0 ? "+" : "−"}${somi(Math.abs(desk.base))} SOMI`}
          </dd>
        </div>
        <div>
          <dt>Rounds</dt>
          <dd>
            {desk.roundsTraded} <span className="foot">· {desk.wins} up</span>
          </dd>
        </div>
      </dl>

      {!compact && (
        <div className={desk.votes ? "tallybar" : "tallybar is-empty"} aria-label="votes this round">
          {CHOICE_ORDER.map((choice) => {
            const count = desk.tally[choice];
            return (
              <span
                key={choice}
                className={`tallybar-seg seg-${choice}`}
                style={{ flexGrow: Math.max(count, 0.04) / total }}
                title={`${count} ${CHOICE_META[choice].verb}`}
              />
            );
          })}
        </div>
      )}

      {desk.retired ? (
        <p className="deskcard-note">This desk was retired. Its profit stays on the board.</p>
      ) : (
        <div className="votebtns">
          {CHOICE_ORDER.map((choice) => {
            const meta = CHOICE_META[choice];
            const mine = myVote === choice;
            const working = pending === choice || busy === `vote:${desk.deskId}`;
            return (
              <button
                key={choice}
                className={`votebtn vote-${choice}${mine ? " is-mine" : ""}`}
                disabled={voted || !!busy || working}
                onClick={() => void cast(choice)}
                title={meta.blurb}
              >
                <span className="votebtn-verb">{meta.verb}</span>
                <span className="votebtn-count">{desk.tally[choice]}</span>
              </button>
            );
          })}
        </div>
      )}

      {desk.armed && !!scaleRatio && scaleRatio > 1 && (
        <p className="deskcard-foot dim">
          Real order is 1/{Math.round(scaleRatio)} of the modelled lot and doesn&apos;t affect rank
        </p>
      )}

      <p className="deskcard-foot">
        {voted ? (
          <span className="ok">
            You voted {CHOICE_META[myVote as Exclude<Choice, "none">].verb} — settles one round after it executes
          </span>
        ) : desk.retired ? null : connected ? (
          "One vote per wallet, per desk, per round"
        ) : (
          "Connect a wallet to vote — voting is free, you only pay gas"
        )}
      </p>
    </article>
  );
}
