"use client";

import { useAccount } from "wagmi";
import { useArena } from "@/hooks/useArena";
import { badgeTokenHref } from "@/lib/chain/constants";
import { ordinal, shortAddress, signedPoints, signedUsd } from "@/lib/arena/format";
import { fruitForToken } from "@/lib/badge/fruits";
import { ArenaShell } from "./ArenaShell";

type Card = {
  key: string;
  tokenId: number | null;
  title: string;
  wallet: string;
  score: string;
  scoreLabel: string;
  sub: string;
  href: string | null;
  kind: "desk" | "contributor";
};

export function OrchardPage() {
  const { address } = useAccount();
  const feed = useArena(address);

  const deskCards: Card[] = feed.desks.map((d) => ({
    key: `desk-${d.deskId}`,
    tokenId: d.deskId + 1,
    title: d.name,
    wallet: d.owner,
    score: signedUsd(d.pnl),
    scoreLabel: "USDso profit",
    sub: `${d.roundsTraded} rounds traded${d.armed ? " · live orders" : ""}`,
    href: badgeTokenHref(feed.addresses.deskBadge as `0x${string}` | undefined, d.deskId + 1),
    kind: "desk",
  }));

  const contribCards: Card[] = feed.contributors
    .filter((c) => c.tokenId)
    .map((c) => ({
      key: `contrib-${c.wallet}`,
      tokenId: c.tokenId,
      title: c.handle || shortAddress(c.wallet),
      wallet: c.wallet,
      score: signedPoints(c.points),
      scoreLabel: "points",
      sub: `${ordinal(c.rank)} · ${c.ballotsCast} calls · best streak ${c.bestStreak}`,
      href: badgeTokenHref(feed.addresses.contributorBadge as `0x${string}` | undefined, c.tokenId!),
      kind: "contributor",
    }));

  return (
    <ArenaShell>
      <main className="arena-main">
        <section className="hero">
          <div>
            <p className="eyebrow">Soulbound</p>
            <h1>The orchard</h1>
            <p className="pitch">
              Two collections, neither of them transferable. A desk badge is minted by the transaction that
              opens your desk; a contributor badge by your first vote. Neither ever writes a score — they read
              it back from the arena at call time, so every leaderboard move is free.
            </p>
          </div>
        </section>

        {[
          { label: "Desk owners", cards: deskCards, blurb: "One per wallet. Score is your best desk's profit." },
          {
            label: "Contributors",
            cards: contribCards,
            blurb: "One per wallet. Score is every call you've made, settled in basis points.",
          },
        ].map((group) => (
          <section className="panel" key={group.label}>
            <div className="section-head">
              <h3>
                {group.label} <span className="foot">({group.cards.length})</span>
              </h3>
              <span className="foot">{group.blurb}</span>
            </div>
            {group.cards.length ? (
              <div className="badgegrid">
                {group.cards.map((card) => {
                  const fruit = fruitForToken(card.tokenId);
                  const isMe = !!address && card.wallet.toLowerCase() === address.toLowerCase();
                  return (
                    <a
                      key={card.key}
                      className={`badgecard${isMe ? " is-me" : ""}`}
                      href={card.href ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fruit?.src ?? "/badges/coconut.svg"} alt="" width={64} height={64} />
                      <strong>{card.title}</strong>
                      <span className="num">{card.score}</span>
                      <span className="foot">{card.scoreLabel}</span>
                      <span className="foot">{card.sub}</span>
                      <span className="foot dim">#{card.tokenId}</span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="empty">Nothing minted yet.</p>
            )}
          </section>
        ))}
      </main>
    </ArenaShell>
  );
}
