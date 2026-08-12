"use client";

import { useDeskRound } from "@/hooks/useDeskRound";
import { useHouseDesk } from "@/hooks/useHouseDesk";
import { DeskStrip } from "./DeskStrip";
import { Leaderboard } from "./Leaderboard";
import { OrderBook } from "./OrderBook";
import { PhaseCard } from "./PhaseCard";
import { RoundPanel } from "./RoundPanel";
import { Tape } from "./Tape";
import "./desk.css";

export function DreamDesk() {
  const house = useHouseDesk();
  const desk = useDeskRound({
    ownerLabel: house.ownerLabel,
    sessionLabel: house.sessionLabel,
    chainEnabled: house.chainEnabled,
    ownerConnected: house.isConnected && house.isHouseOwner,
    isHouseOwner: house.isHouseOwner,
    wrongOwner: house.wrongOwner,
    approved: house.approved,
    connectOwner: house.connectOwner,
    grantSession: house.grantSession,
    revokeDesk: house.revokeDesk,
  });

  return (
    <main className={`shell ${desk.desk.revoked ? "is-revoked" : ""}`}>
      <header className="hero rise">
        <div>
          <p className="eyebrow">dreamDEX · Swarm Desk</p>
          <h1>DreamDesk</h1>
          <p className="pitch">
            Owner grants a hot key. Crowd votes Bid / Ask / Hold. Every 5 minutes the poll
            resolves, the session key executes, and the leaderboard keeps score.
          </p>
        </div>
        <button
          type="button"
          className="play"
          disabled={desk.autoplaying || desk.busy}
          onClick={desk.playDemo}
        >
          <span className="play-icon" aria-hidden />
          {desk.autoplaying ? "Playing demo" : "Play demo"}
        </button>
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
            onVote={desk.castVote}
          />
          <PhaseCard
            phase={desk.phase}
            wrongOwner={house.wrongOwner}
            chainEnabled={house.chainEnabled}
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
          <Leaderboard voters={desk.voters} />
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
    </main>
  );
}
