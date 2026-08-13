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
          <h2 id="rules-title">The swarm steers. One key trades.</h2>
          <button type="button" className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <section>
          <h3>Social dynamic</h3>
          <p>
            The house owner keeps the funds. Visitors never touch them. They only vote{" "}
            <strong>Bid</strong>, <strong>Ask</strong>, or <strong>Hold</strong> — one signed
            ballot per wallet.
          </p>
          <p>
            When Somnia <strong>Reactivity</strong> fires the scheduled callback, the{" "}
            <strong>majority vote is the move</strong>. That instruction is carried out by a
            delegated session key the owner already granted — a <code>placeOrderFor</code> call
            on the owner’s behalf. The hot key can place, cancel, and reduce. It cannot withdraw.
          </p>
          <ul>
            <li>
              <strong>Bid</strong> or <strong>Ask</strong> plurality → session key posts a
              PostOnly order on that side.
            </li>
            <li>
              <strong>Hold</strong>, a tie, or no votes → no delegation call. The book stays
              put.
            </li>
          </ul>
        </section>

        <section>
          <h3>Who ends the round?</h3>
          <p>
            Nobody does. Opening a round registers a one-shot{" "}
            <strong>Somnia Reactivity</strong> subscription on the reactivity precompile at{" "}
            <code>0x0100</code> — a <code>Schedule</code> system event set for the round’s
            deadline.
          </p>
          <p>
            Validators hold that subscription in chain state. In the first block whose
            timestamp passes the deadline, they insert a synthetic transaction calling{" "}
            <code>onEvent</code> on the desk’s <code>RoundClock</code> handler, then delete
            the subscription. The desk sees that callback and executes the majority vote.
          </p>
          <ul>
            <li>No cron job, no keeper bot, no browser tab holding the clock</li>
            <li>The countdown above only mirrors the deadline already committed on-chain</li>
            <li>The session key owns the subscription and pays gas for its own callback</li>
          </ul>
        </section>

        <section>
          <h3>Your call vs the swarm</h3>
          <p>
            You score for reading the room — matching the majority — not for PnL (yet).
          </p>
          <ul>
            <li>
              Same side as the majority: <strong className="up">+10</strong>
            </li>
            <li>
              Opposite side (Bid vs Ask): <strong className="down">−6</strong>
            </li>
            <li>You held while they traded: 0</li>
            <li>
              Swarm held: everyone who voted gets <strong className="up">+2</strong>
            </li>
          </ul>
        </section>

        <p className="modal-note">
          Revoke the grant and the next majority still votes — but the delegation call
          dies. Mark-to-mid scoring is Day 3.
        </p>

        <button type="button" className="primary modal-ok" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
