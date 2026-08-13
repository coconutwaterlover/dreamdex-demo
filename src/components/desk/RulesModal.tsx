"use client";

import { useEffect } from "react";

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div
        className="modal rise"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-top">
          <h2 id="rules-title">The stall steers. One key trades.</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          <section>
            <h3>Vote</h3>
            <p>
              Owner keeps the funds. Visitors vote <strong>Bid</strong>, <strong>Ask</strong>, or{" "}
              <strong>Hold</strong> — one signed ballot each. Ballots stay <strong>blind</strong>{" "}
              until the round ends.
            </p>
            <p>
              Majority is the move. A granted session key runs <code>placeOrderFor</code>. It can
              place, cancel, reduce — not withdraw.
            </p>
            <ul>
              <li>
                <strong>Bid</strong> or <strong>Ask</strong> plurality → PostOnly on that side
              </li>
              <li>
                <strong>Hold</strong>, a tie, or no votes → no order
              </li>
            </ul>
          </section>

          <section>
            <h3>Who ends the round?</h3>
            <p>
              Somnia <strong>Reactivity</strong>. Opening a round schedules a one-shot callback at{" "}
              <code>0x0100</code>. Validators fire <code>RoundClock.onEvent</code> at the deadline —
              no cron, no keeper. The countdown just mirrors that.
            </p>
          </section>

          <section>
            <h3>Scoring</h3>
            <p>You score for matching the majority, not PnL.</p>
            <ul>
              <li>
                Match: <strong className="up">+10</strong>
              </li>
              <li>
                Opposite (Bid vs Ask): <strong className="down">−6</strong>
              </li>
              <li>You held, they traded: 0</li>
              <li>
                Stall held: <strong className="up">+2</strong> for everyone who voted
              </li>
            </ul>
          </section>

          <section>
            <h3>Badges</h3>
            <p>
              First scored round mints one soulbound fruit badge with your name. Later rounds only
              update that token’s score.
            </p>
          </section>

          <p className="modal-note">
            Revoke the grant and the next majority still votes — but the order dies. Mark-to-mid
            scoring is Day 3.
          </p>
        </div>

        <button type="button" className="primary modal-ok" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
