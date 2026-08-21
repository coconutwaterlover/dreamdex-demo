"use client";

import { useCallback, useEffect, useState } from "react";

const SEEN_KEY = "dreamdesk-arena-intro-v2";

type Step = { icon: keyof typeof ICONS; title: string; body: string };
type Page = { eyebrow: string; title: string; lede: string; steps: Step[]; note: string };

/**
 * Drawn rather than emoji: glyph coverage for things like the ballot box and stopwatch
 * varies by platform, so half the row rendered flat while the rest came out in colour.
 * These are deterministic and inherit the palette.
 */
const ICONS = {
  vote: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 10.5l2.5 2.5L16 8" />
      <path d="M6 20h12" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2" />
      <path d="M9 2h6" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v1a4 4 0 0 0 3 3.9M17 6h3v1a4 4 0 0 1-3 3.9" />
      <path d="M12 14v3m-3 4h6l-.7-4h-4.6z" />
    </svg>
  ),
  desk: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-5 9 5" />
      <path d="M5 9v11M19 9v11M3 20h18" />
      <path d="M9 20v-6h6v6" />
    </svg>
  ),
  crowd: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="8" r="2.6" />
      <circle cx="16.5" cy="9" r="2.2" />
      <path d="M3 19c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <path d="M14 19c0-2.2 1.5-4 3.5-4S21 16.8 21 19" />
    </svg>
  ),
  earn: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18l5-5 3.5 3.5L20 9" />
      <path d="M15 9h5v5" />
      <path d="M3 21h18" />
    </svg>
  ),
} as const;


/**
 * Two paths, two pages: what a voter does, and what a desk owner does. Deliberately
 * three steps each — the previous version was four dense paragraphs and nobody read it.
 */
const PAGES: Page[] = [
  {
    eyebrow: "If you want to play",
    title: "Call the market. Climb the board.",
    lede: "Every desk in the arena trades the same five-minute round. You tell it what to do next.",
    steps: [
      {
        icon: "vote",
        title: "Vote on a move",
        body: "Pick Buy, Sell or Wait on any desk. One vote per wallet, per desk, per round. Free — you only pay gas.",
      },
      {
        icon: "clock",
        title: "Wait for the round",
        body: "At the boundary the desk executes the crowd's choice at the live market price, on-chain.",
      },
      {
        icon: "trophy",
        title: "If the move made money, you win",
        body: "You're scored on your own call, not on whether the crowd agreed. Get it right and your streak grows.",
      },
    ],
    note: "Your first vote mints a soulbound contributor badge and puts you on the leaderboard.",
  },
  {
    eyebrow: "If you want to run one",
    title: "Open a desk. Let the crowd trade it.",
    lede: "A desk is a book plus an audience. You bring the book; they bring the calls.",
    steps: [
      {
        icon: "desk",
        title: "Open a desk",
        body: "Pick a name and post a 0.05 STT bond — returned in full when you retire it. The same transaction mints your owner badge.",
      },
      {
        icon: "crowd",
        title: "Let the community vote its next move",
        body: "Anyone can vote on your desk. The majority decides what it trades each round; a tie means it sits still.",
      },
      {
        icon: "earn",
        title: "Earn",
        body: "Best profit wins the season. Grant a session key and your desk's winning move is also placed as a real order on dreamDEX — your funds, your wallet, revocable any time.",
      },
    ],
    note: "The 1,000 USDso book is paper — nobody funds it. Every desk gets the same figure so profit compares calls, not bankrolls.",
  },
];

function useIntro() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // storage blocked — just don't auto-open
    }
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }, []);
  return { open, setOpen, close };
}

export function HowItWorks() {
  const { open, setOpen, close } = useIntro();
  const [page, setPage] = useState(0);
  const last = page === PAGES.length - 1;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setPage((p) => Math.min(p + 1, PAGES.length - 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(p - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close]);

  const current = PAGES[page];

  return (
    <>
      <section className="how">
        <button
          className="how-toggle"
          onClick={() => {
            setPage(0);
            setOpen(true);
          }}
        >
          <span>How the arena works</span>
          <span className="how-chev">?</span>
        </button>
      </section>

      {open && (
        <div className="modal-backdrop" onClick={close} role="presentation">
          <div
            className="modal wizard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wiz-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <p className="eyebrow">{current.eyebrow}</p>
                <h2 id="wiz-title">{current.title}</h2>
              </div>
              <button className="modal-x" onClick={close} aria-label="Close">
                ×
              </button>
            </header>

            <p className="wiz-lede">{current.lede}</p>

            <ol className="wiz-flow">
              {current.steps.map((step, i) => (
                <li key={step.title}>
                  <div className="wiz-card">
                    <span className={`wiz-icon wiz-icon-${i}`} aria-hidden="true">
                      {ICONS[step.icon]}
                    </span>
                    <h4>{step.title}</h4>
                    <p>{step.body}</p>
                  </div>
                  {i < current.steps.length - 1 && (
                    <span className="wiz-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>

            <p className="wiz-note">{current.note}</p>

            <footer className="wiz-foot">
              <div className="wiz-dots" role="tablist" aria-label="Pages">
                {PAGES.map((p, i) => (
                  <button
                    key={p.title}
                    role="tab"
                    aria-selected={i === page}
                    aria-label={p.eyebrow}
                    className={i === page ? "wiz-dot is-on" : "wiz-dot"}
                    onClick={() => setPage(i)}
                  />
                ))}
              </div>
              <div className="wiz-actions">
                {page > 0 && (
                  <button className="btn" onClick={() => setPage(page - 1)}>
                    Back
                  </button>
                )}
                {last ? (
                  <button className="btn btn-accent" onClick={close}>
                    Got it — show me the desks
                  </button>
                ) : (
                  <button className="btn btn-accent" onClick={() => setPage(page + 1)}>
                    Or run your own desk →
                  </button>
                )}
              </div>
            </footer>

            <a className="wiz-faq foot" href="/faq">
              Full FAQ — what it costs, how profit is worked out, what&apos;s real money →
            </a>
          </div>
        </div>
      )}
    </>
  );
}
