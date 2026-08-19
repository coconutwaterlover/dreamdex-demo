"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatEther } from "viem";
import { useAccount } from "wagmi";
import { useArena } from "@/hooks/useArena";
import { useArenaActions } from "@/hooks/useArenaActions";
import { ArenaShell } from "./ArenaShell";

const NAME_RE = /^[A-Za-z0-9 ._-]{3,24}$/;

export function CreateDeskPage() {
  const router = useRouter();
  const { address } = useAccount();
  const feed = useArena(address);
  const actions = useArenaActions();
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);

  const bondWei = BigInt(feed.state.createBondWei || "0");
  const bond = bondWei ? formatEther(bondWei) : "—";
  const valid = NAME_RE.test(name.trim());
  const mine = address ? feed.desks.filter((d) => d.owner.toLowerCase() === address.toLowerCase()) : [];

  const submit = async () => {
    if (!valid) return;
    await actions.createDesk(name.trim(), bondWei);
    setDone(true);
    await feed.refresh();
    const created = feed.desks.length;
    router.push(`/desk/${created}`);
  };

  return (
    <ArenaShell>
      <main className="arena-main narrow">
        <section className="hero">
          <div>
            <p className="eyebrow">Open a desk</p>
            <h1>Put a book in the arena.</h1>
            <p className="pitch">
              Your desk starts on the same 1,000 USDso paper book as everybody else and trades the same
              five-minute rounds. What makes it yours is the crowd you bring — and, if you want it, a real
              session key so the winning move also hits the live DreamDEX book.
            </p>
          </div>
        </section>

        <section className="panel">
          <label className="field">
            <span>Desk name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="night-market"
              maxLength={24}
              spellCheck={false}
            />
            <span className="foot">
              3–24 characters. Letters, numbers, space, dot, dash, underscore.
              {name && !valid && <strong className="warn"> That name won&apos;t pass the contract.</strong>}
            </span>
          </label>

          <dl className="bondinfo">
            <div>
              <dt>Bond</dt>
              <dd className="num">{bond} STT</dd>
              <dd className="foot">Returned in full when you retire the desk.</dd>
            </div>
            <div>
              <dt>Starting book</dt>
              <dd className="num">1,000 USDso</dd>
              <dd className="foot">Identical for every desk, so profit is comparable.</dd>
            </div>
            <div>
              <dt>Lot size</dt>
              <dd className="num">1,000 SOMI</dd>
              <dd className="foot">Position capped at ±5 lots.</dd>
            </div>
          </dl>

          {actions.error && (
            <p className="alert" onClick={actions.clearError}>
              {actions.error}
            </p>
          )}

          <button className="btn btn-accent btn-lg" disabled={!valid || !!actions.busy} onClick={() => void submit()}>
            {actions.busy === "create" ? "Opening…" : done ? "Opened" : `Open desk · ${bond} STT bond`}
          </button>
          <p className="foot">
            The same transaction mints your soulbound desk badge. One badge per wallet; it tracks your best
            desk&apos;s profit for as long as the arena runs.
          </p>
        </section>

        {mine.length > 0 && (
          <section className="panel">
            <h3>Desks you already run</h3>
            <ul className="you-desks">
              {mine.map((d) => (
                <li key={d.deskId}>
                  <Link href={`/desk/${d.deskId}`}>{d.name}</Link>
                  <span className="foot">{d.armed ? "live orders" : "paper"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="panel">
          <h3>Want real orders too?</h3>
          <p className="foot">
            Open the desk first, then use the owner controls on its page to grant the arena&apos;s session key
            and approve USDso. The grant is a per-selector approval in dreamDEX&apos;s
            OperatorPermissionsRegistry: the session key can place orders that you own and that settle to you,
            and it can never move your funds. Revoke it any time and the next round is paper again.
          </p>
        </section>
      </main>
    </ArenaShell>
  );
}
