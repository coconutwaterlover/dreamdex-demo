import type { Phase } from "@/lib/desk/types";

export function PhaseCard({
  phase,
  wrongOwner,
  chainEnabled,
}: {
  phase: Phase;
  wrongOwner: boolean;
  chainEnabled: boolean;
}) {
  if (phase === "voting" || phase === "resolving" || phase === "signing" || phase === "scored") {
    return null;
  }

  if (wrongOwner && (phase === "boot" || phase === "connected")) {
    return (
      <div className="armed-card warn rise">
        <h2>Not house owner</h2>
        <p>This wallet cannot arm or revoke the desk. Switch to the configured house owner, or vote once the desk is armed.</p>
      </div>
    );
  }

  if (phase === "armed") {
    return (
      <div className="armed-card rise">
        <h2>Desk armed</h2>
        <p>
          Hot key can place / cancel / reduce — not withdraw. Open a swarm round and let the crowd
          steer the next order.
        </p>
      </div>
    );
  }

  if (phase === "boot" || phase === "connected") {
    return (
      <div className="armed-card rise">
        <h2>{phase === "boot" ? "Cold start" : "Owner connected"}</h2>
        <p>
          {phase === "boot"
            ? chainEnabled
              ? "Connect the house owner wallet on Somnia Shannon, then grant a session key."
              : "Connect the cold wallet that keeps custody, then grant a session key."
            : "Next: grant place + cancel + reduce to a hot session key."}
        </p>
      </div>
    );
  }

  if (phase === "revoked" || phase === "blocked") {
    return (
      <div className="armed-card warn rise">
        <h2>{phase === "blocked" ? "Execute rejected" : "Desk revoked"}</h2>
        <p>
          {phase === "blocked"
            ? "Crowd can still vote in theory — but the hot key is dead. OnlyApprovedContracts."
            : "Operator grants wiped. Funds never left the owner."}
        </p>
      </div>
    );
  }

  return null;
}
