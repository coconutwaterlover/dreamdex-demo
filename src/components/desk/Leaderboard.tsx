"use client";

import Link from "next/link";
import { badgeTokenHref } from "@/lib/chain/constants";
import { fruitForToken } from "@/lib/desk/fruits";
import type { Voter } from "@/lib/desk/types";

export const BOARD_PREVIEW = 10;

function isYou(u: Voter, you?: string) {
  return u.id === "you" || (!!you && u.id === you);
}

function BoardRow({
  u,
  rank,
  you,
  live,
  showVotes,
}: {
  u: Voter;
  rank: number;
  you?: string;
  live?: boolean;
  showVotes?: boolean;
}) {
  const href = u.tokenId != null ? badgeTokenHref(u.tokenId) : null;
  const fruit = fruitForToken(u.tokenId ?? (live ? undefined : rank));
  return (
    <li className={isYou(u, you) ? "you" : ""}>
      <span className="rank">{rank}</span>
      {fruit ? (
        <img className="board-fruit" src={fruit.src} alt={fruit.label} width={28} height={28} />
      ) : (
        <span className="board-fruit board-fruit-empty" aria-hidden />
      )}
      <span className="name">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer">
            {u.name}
          </a>
        ) : (
          u.name
        )}
        {u.vote && showVotes && <small>{u.vote}</small>}
      </span>
      <span className="pts">
        {u.pts}
        {typeof u.delta === "number" && u.delta !== 0 && (
          <em className={u.delta > 0 ? "up" : "down"}>
            {u.delta > 0 ? `+${u.delta}` : u.delta}
          </em>
        )}
      </span>
    </li>
  );
}

export function Leaderboard({
  voters,
  youId,
  onOpenRules,
  live,
  preview,
  showVotes = true,
}: {
  voters: Voter[];
  youId?: string;
  onOpenRules?: () => void;
  live?: boolean;
  preview?: boolean;
  showVotes?: boolean;
}) {
  const you = youId?.toLowerCase();
  const shown = preview ? voters.slice(0, BOARD_PREVIEW) : voters;
  const hidden = preview ? Math.max(0, voters.length - BOARD_PREVIEW) : 0;
  const youRank = voters.findIndex((u) => isYou(u, you));
  const youOffPreview = preview && youRank >= BOARD_PREVIEW;

  return (
    <div className={`board${preview ? "" : " board-page"}`}>
      <div className="board-top">
        <h2>{preview ? "Orchard" : "Classified"}</h2>
        {onOpenRules && (
          <button type="button" className="rules-link" onClick={onOpenRules}>
            How it works
          </button>
        )}
      </div>
      {live && voters.length === 0 && (
        <p className="board-empty">No fruit badges yet — vote a round to mint yours.</p>
      )}
      <ol>
        {shown.map((u, i) => (
          <BoardRow key={u.id} u={u} rank={i + 1} you={you} live={live} showVotes={showVotes} />
        ))}
      </ol>
      {hidden > 0 && (
        <p className="board-more">
          {youOffPreview && youRank >= 0 && <>You&apos;re #{youRank + 1}. </>}
          <Link href="/orchard">See all {voters.length} classified</Link>
        </p>
      )}
    </div>
  );
}
