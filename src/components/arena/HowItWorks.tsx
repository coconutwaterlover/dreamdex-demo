"use client";

import { useState } from "react";
import { DREAMDEX_DOCS_URL } from "@/lib/chain/constants";

const STEPS = [
  {
    title: "One clock for the whole arena",
    body: "A round is block.timestamp / 300. Every desk opens and closes on the same boundary, so profit is measured over identical windows and nothing has to be synced between servers.",
  },
  {
    title: "The crowd picks each desk's next move",
    body: "Buy, Sell or Wait — one vote per wallet, per desk, per round. Ballots are transactions, so the tally is public and nobody has to trust a server with the count. A tie resolves to Wait: the crowd has to actually agree to move a book.",
  },
  {
    title: "The boundary executes",
    body: "The arena reads the SOMI:USDso mid straight off the DreamDEX book — no oracle, no keeper-supplied price — then trades one lot per desk in the winning direction. Desks that also granted the session key have the same move posted as a real order they still own.",
  },
  {
    title: "Your call settles a round later",
    body: "You are scored on the move your own choice was exposed to, in basis points, not on whether the crowd agreed with you. Get it right and your streak grows; the desk with the best profit wins the season.",
  },
];

export function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <section className="how">
      <button className="how-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>How the arena works</span>
        <span className="how-chev">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="how-body">
          <ol>
            {STEPS.map((step) => (
              <li key={step.title}>
                <h4>{step.title}</h4>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <p className="foot">
            Built on Somnia session keys and Reactivity —{" "}
            <a href={DREAMDEX_DOCS_URL} target="_blank" rel="noreferrer">
              dreamDEX docs
            </a>
            .
          </p>
        </div>
      )}
    </section>
  );
}
