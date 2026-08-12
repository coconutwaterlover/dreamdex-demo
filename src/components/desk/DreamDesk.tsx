"use client";

import { useEffect, useState } from "react";
import { useDeskRound } from "@/hooks/useDeskRound";
import { useHouseDesk } from "@/hooks/useHouseDesk";
import { DeskStrip } from "./DeskStrip";
import { Leaderboard } from "./Leaderboard";
import { OrderBook } from "./OrderBook";
import { PhaseCard } from "./PhaseCard";
import { RoundPanel } from "./RoundPanel";
import { RulesModal } from "./RulesModal";
import { Tape } from "./Tape";
import "./desk.css";

const RULES_SEEN = "dreamdesk-rules-seen";

export function DreamDesk() {
  const house = useHouseDesk();
  const desk = useDeskRound({
    ownerLabel: house.ownerLabel,
    sessionLabel: house.sessionLabel,
    chainEnabled: house.chainEnabled,
    ownerConnected: house.isConnected && house.isHouseOwner,
    isHouseOwner: house.isHouseOwner,
    isConnected: house.isConnected,
    address: house.address,
    wrongOwner: house.wrongOwner,
    approved: house.approved,
    connectWallet: house.connectWallet,
    grantSession: house.grantSession,
    revokeDesk: house.revokeDesk,
    signVote: house.signVote,
  });
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    if (desk.phase !== "voting") return;
    try {
      if (sessionStorage.getItem(RULES_SEEN)) return;
      sessionStorage.setItem(RULES_SEEN, "1");
    } catch {
      // private mode
    }
    setRulesOpen(true);
  }, [desk.phase]);

  return (
    <main className={`shell ${desk.desk.revoked ? "is-revoked" : ""}`}>
      <header className="hero rise">
        <div>
          <p className="eyebrow">dreamDEX · Swarm Desk</p>
          <h1>DreamDesk</h1>
          <p className="pitch">
            The owner delegates a hot key. The crowd votes. Majority is the move — the
            session key places it with <code>placeOrderFor</code>. Funds never leave the
            owner.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="ghost" onClick={() => setRulesOpen(true)}>
            How the swarm works
          </button>
          <button
            type="button"
            className="play"
            disabled={desk.autoplaying || desk.busy}
            onClick={desk.playDemo}
          >
            <span className="play-icon" aria-hidden />
            {desk.autoplaying ? "Playing demo" : "Play demo"}
          </button>
        </div>
      </header>

      <DeskStrip
        desk={desk.desk}
        ownerLabel={house.ownerLabel}
        sessionLabel={house.sessionLabel}
        round={desk.round}
        phaseVoting={desk.phase === "voting"}
        busy={desk.busy || house.writing}
        onRevoke={desk.revoke}
      />

      <section className="stage">
        <div className="main-col">
          <RoundPanel
            phase={desk.phase}
            round={desk.round}
            clock={desk.clock}
            votes={desk.votes}
            totalVotes={desk.totalVotes}
            myVote={desk.myVote}
            winner={desk.winner}
            signProgress={desk.signProgress}
            sessionLabel={house.sessionLabel}
            roundMid={desk.roundMid}
            mid={desk.mid}
            autoplaying={desk.autoplaying}
            canVote={!desk.liveMode || house.isConnected}
            liveMode={desk.liveMode}
            executeHash={desk.executeHash}
            executeError={desk.executeError}
            liveBallots={desk.liveBallots}
            voters={desk.voters}
            youId={house.address}
            onVote={desk.castVote}
            onOpenRules={() => setRulesOpen(true)}
          />
          <PhaseCard
            phase={desk.phase}
            wrongOwner={house.wrongOwner && !house.approved}
            chainEnabled={house.chainEnabled}
            hideBlocked={
              !!desk.winner ||
              desk.totalVotes > 0 ||
              !!desk.executeHash ||
              !!desk.executeError
            }
          />
          <Tape tape={desk.tape} />
        </div>

        <aside className="side">
          <OrderBook
            desk={desk.desk}
            mid={desk.mid}
            levels={desk.levels}
            winner={desk.winner}
            phase={desk.phase}
            bid={desk.bid}
            ask={desk.ask}
          />
          <Leaderboard
            voters={desk.voters}
            youId={house.address}
            onOpenRules={() => setRulesOpen(true)}
          />
        </aside>
      </section>

      <footer className="actions rise">
        <button
          type="button"
          className="primary"
          disabled={!desk.primary.action || (desk.busy && desk.phase !== "voting") || desk.autoplaying}
          onClick={() => desk.primary.action?.()}
        >
          {desk.primary.label}
        </button>
        {house.isHouseOwner && (desk.phase === "armed" || desk.phase === "scored") && (
          <button
            type="button"
            className="ghost"
            disabled={house.writing || !house.quoteToken}
            onClick={() => {
              void house.approveUsdso().catch(() => undefined);
            }}
          >
            Approve USDso
          </button>
        )}
        {desk.phase !== "boot" && (
          <button
            type="button"
            className="ghost"
            onClick={desk.reset}
            disabled={desk.busy && desk.autoplaying}
          >
            Reset
          </button>
        )}
      </footer>
      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />
    </main>
  );
}
