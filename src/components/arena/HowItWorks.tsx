"use client";

import { useCallback, useEffect, useState } from "react";
import { DREAMDEX_DOCS_URL } from "@/lib/chain/constants";

const SEEN_KEY = "dreamdesk-arena-intro-v1";

const STEPS = [
  {
    n: "1",
    title: "One clock for the whole arena",
    body: "A round is five minutes, shared by every desk. They all open and close on the same boundary, so profit is measured over identical windows.",
  },
  {
    n: "2",
    title: "The crowd picks each desk's next move",
    body: "Buy, Sell or Wait — one vote per wallet, per desk, per round. Ballots are transactions, so the tally is public and nobody has to trust a server with the count. A tie resolves to Wait: the crowd has to actually agree to move a book.",
  },
  {
    n: "3",
    title: "The boundary executes",
    body: "The arena reads the SOMI:USDso mid straight off the dreamDEX book — no oracle — then trades one lot per desk in the winning direction. Desks whose owner granted a session key have the same move posted as a real order they still own.",
  },
  {
    n: "4",
    title: "Your call settles a round later",
    body: "You're scored on the move your own choice was exposed to, in basis points — not on whether the crowd agreed with you. Get it right and your streak grows. The desk with the best profit wins the season.",
  },
];

function useIntro() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      // private mode / storage blocked — just don't auto-open
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

/**
 * Shown once on a first visit, and reopenable from the rail. The arena has enough
 * moving parts that a newcomer needs the rules before the vote buttons make sense —
 * especially what it costs, which is the thing everyone guesses wrong.
 */
export function HowItWorks() {
  const { open, setOpen, close } = useIntro();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, close]);

  return (
    <>
      <section className="how">
        <button className="how-toggle" onClick={() => setOpen(true)}>
          <span>How the arena works</span>
          <span className="how-chev">?</span>
        </button>
      </section>

      {open && (
        <div className="modal-backdrop" onClick={close} role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="intro-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <div>
                <p className="eyebrow">DreamDesk Arena</p>
                <h2 id="intro-title">Every desk. One clock. Best profit wins.</h2>
              </div>
              <button className="modal-x" onClick={close} aria-label="Close">
                ×
              </button>
            </header>

            <ol className="modal-steps">
              {STEPS.map((step) => (
                <li key={step.n}>
                  <span className="modal-step-n">{step.n}</span>
                  <div>
                    <h4>{step.title}</h4>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="modal-cost">
              <h4>What it costs</h4>
              <dl>
                <div>
                  <dt>Vote on any desk</dt>
                  <dd>Free — you only pay gas.</dd>
                </div>
                <div>
                  <dt>Open your own desk</dt>
                  <dd>
                    A <strong>0.05 STT</strong> bond, returned in full when you retire it.
                  </dd>
                </div>
                <div>
                  <dt>The 1,000 USDso book</dt>
                  <dd>
                    A <strong>paper</strong> book — nobody funds it. Every desk gets the same figure, which
                    is what makes the leaderboard a contest of calls rather than of bankrolls.
                  </dd>
                </div>
                <div>
                  <dt>Real orders (optional)</dt>
                  <dd>
                    Only if you grant a session key. A desk marked <em>live orders</em> also places a real,
                    minimum-size order on dreamDEX — your own funds, your own wallet, revocable any time.
                    It is proof the session key works; the leaderboard still scores the paper book.
                  </dd>
                </div>
              </dl>
              <p className="foot">
                This is Somnia Shannon testnet — STT comes free from the{" "}
                <a href="https://testnet.somnia.network/" target="_blank" rel="noreferrer">
                  faucet
                </a>
                .
              </p>
            </div>

            <footer className="modal-foot">
              <button className="btn btn-accent btn-lg" onClick={close}>
                Got it — show me the desks
              </button>
              <a className="foot" href={DREAMDEX_DOCS_URL} target="_blank" rel="noreferrer">
                dreamDEX docs →
              </a>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
