"use client";

import Link from "next/link";
import { useState } from "react";
import { DREAMDEX_DOCS_URL, GITHUB_REPO_URL } from "@/lib/chain/constants";
import { ArenaShell } from "./ArenaShell";

type Entry = { q: string; a: React.ReactNode; tag: string };

const ENTRIES: Entry[] = [
  {
    tag: "The book",
    q: "What's the difference between cash and equity?",
    a: (
      <>
        <p>
          A desk holds two things: <strong>cash</strong> (USDso) and a <strong>position</strong> (SOMI).
          Buying moves value from one to the other, so cash alone tells you nothing about how a desk is
          doing.
        </p>
        <p>
          <strong>Equity</strong> is both sides added up — the number that actually matters:
        </p>
        <pre>equity = cash + (position × current mid)</pre>
        <p>
          Say a desk starts with 1,000 cash and no position, then Buy wins at a mid of 0.0900. It spends 90
          of its cash on 1,000 SOMI. Cash is now 910 — which looks like a loss but isn&apos;t, because it&apos;s
          holding 1,000 SOMI worth 90. Equity is still 1,000, and <strong>profit is still zero</strong>.
        </p>
        <p>
          Profit only appears when the price moves. If the mid rises to 0.0910, those 1,000 SOMI are worth 91,
          equity is 1,001, and the desk is up 1. A desk sitting flat has all its equity in cash; a desk that
          just bought has most of it in SOMI. Same equity, different shape.
        </p>
      </>
    ),
  },
  {
    tag: "The book",
    q: "Why is a desk's profit changing when no round has closed?",
    a: (
      <p>
        Because the position is <strong>marked to the live market</strong>. A desk only trades at a boundary,
        but whatever it&apos;s already holding is revalued at the current mid every few seconds. So profit
        drifts continuously between rounds. A desk sitting flat won&apos;t move at all — it has nothing to
        revalue.
      </p>
    ),
  },
  {
    tag: "Money",
    q: "Do I have to put up 1,000 USDso to open a desk?",
    a: (
      <p>
        No. <strong>Nobody funds that.</strong> It&apos;s a paper book — a number in the contract, identical
        for every desk, so profits are comparable. Making desks post real capital would rank bankrolls
        instead of calls. Opening a desk costs a <strong>0.05 STT bond</strong>, returned in full when you
        retire it, plus gas.
      </p>
    ),
  },
  {
    tag: "Money",
    q: "Is any of this real money?",
    a: (
      <>
        <p>Three separate things, and they get conflated:</p>
        <ul>
          <li>
            The <strong>price</strong> every desk is marked against is real — read on-chain from the live
            dreamDEX book.
          </li>
          <li>
            The <strong>book that ranks desks</strong> is paper.
          </li>
          <li>
            The <strong>orders an armed desk places</strong> are real — actual orders, the owner&apos;s own
            funds, settling to the owner.
          </li>
        </ul>
        <p>
          So an armed desk genuinely trades, but its leaderboard position comes from the paper book, not from
          those fills. The real leg proves the session key works; it doesn&apos;t decide who wins.
        </p>
      </>
    ),
  },
  {
    tag: "Voting",
    q: "Why did my score not change for five minutes?",
    a: (
      <p>
        Your vote is a prediction about the window your desk is <em>about to be</em> exposed to. The move
        executes at the boundary, and only after the <em>following</em> boundary does the arena know what it
        was worth. So scoring lags voting by one round. That wait is also the point — come back in five
        minutes to see if you were right and to vote again.
      </p>
    ),
  },
  {
    tag: "Voting",
    q: "The crowd voted against me and I still scored. Why?",
    a: (
      <p>
        You&apos;re scored on <strong>your own call</strong>, not on whether you agreed with the crowd. If you
        voted Sell and the price fell, you score — even if everyone else voted Buy and the desk lost money.
        The desk is judged on what the majority chose; you are judged on what you chose.
      </p>
    ),
  },
  {
    tag: "Voting",
    q: "Why did my desk do nothing this round?",
    a: (
      <p>
        Three possibilities. A <strong>tie</strong> resolves to Wait — the crowd has to actually agree to move
        a book. <strong>Wait won</strong> outright. Or the desk is at its <strong>position limit</strong> of
        ±5 lots and can&apos;t go further the same way.
      </p>
    ),
  },
  {
    tag: "Safety",
    q: "What does “live orders” mean, and can the session key steal my funds?",
    a: (
      <>
        <p>
          It means the owner granted a hot key permission to place orders for them. It <strong>cannot</strong>{" "}
          take anything. The grant is per function selector — place, cancel, reduce — and that&apos;s all.
          Fills pay the order owner. Deposits, withdrawals and approvals stay with you.
        </p>
        <p>
          The arena doesn&apos;t take an owner&apos;s word for it either: a desk is only labelled live when it
          reads the approval from dreamDEX&apos;s registry itself. Revoke it and the next round is paper again.
        </p>
      </>
    ),
  },
  {
    tag: "Badges",
    q: "Can I sell my badge?",
    a: (
      <p>
        No — both collections are soulbound. Every transfer and approval reverts. They also never store a
        score: they read it back from the arena when asked, so a round that moves every leaderboard costs zero
        token writes and your badge is never stale.
      </p>
    ),
  },
  {
    tag: "Seasons",
    q: "What happens to my points at the end of a season?",
    a: (
      <p>
        Nothing is wiped. A season is 288 rounds (24 hours) and season standing is a <em>slice</em> of your
        lifetime total, not a reset. Your badge tracks the lifetime number.
      </p>
    ),
  },
  {
    tag: "The clock",
    q: "Who runs the five-minute clock?",
    a: (
      <p>
        Nothing does. A contract owns its own scheduled subscription and re-arms itself from inside its own
        callback, so the round boundary fires forever with no cron, no server and no keeper. If a beat is ever
        dropped, anyone can restart it — and advancing the arena is idempotent, so a double fire is harmless.
      </p>
    ),
  },
  {
    tag: "Trust",
    q: "What happens if you turn the website off?",
    a: (
      <p>
        The arena keeps running. Ballots, tallies, prices, books, points and badges are all on-chain, and the
        clock ticks itself. The site is a viewer. The one thing it does that the chain can&apos;t is place the
        real dreamDEX orders for armed desks, because a contract can&apos;t do that on an owner&apos;s behalf.
      </p>
    ),
  },
];

export function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ArenaShell>
      <main className="arena-main narrow">
        <section className="hero">
          <div>
            <p className="eyebrow">FAQ</p>
            <h1>The bits that trip people up.</h1>
            <p className="pitch">
              Mostly questions people actually asked, in the order they tend to come up. If something here is
              still unclear the contracts are the real answer —{" "}
              <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                read the source
              </a>
              .
            </p>
          </div>
        </section>

        <section className="faq">
          {ENTRIES.map((entry, i) => {
            const isOpen = open === i;
            return (
              <article key={entry.q} className={isOpen ? "faq-item is-open" : "faq-item"}>
                <button className="faq-q" onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                  <span className="faq-tag">{entry.tag}</span>
                  <span className="faq-text">{entry.q}</span>
                  <span className="faq-chev" aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                {isOpen && <div className="faq-a">{entry.a}</div>}
              </article>
            );
          })}
        </section>

        <section className="panel">
          <h3>Still stuck?</h3>
          <ul className="linklist">
            <li>
              <Link href="/">Watch a round happen on the arena page</Link>
            </li>
            <li>
              <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                Source, contracts and the known limits
              </a>
            </li>
            <li>
              <a href={DREAMDEX_DOCS_URL} target="_blank" rel="noreferrer">
                dreamDEX docs — session keys, Reactivity, the order book
              </a>
            </li>
          </ul>
        </section>
      </main>
    </ArenaShell>
  );
}
