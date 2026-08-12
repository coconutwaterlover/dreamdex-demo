import type { DeskView } from "@/lib/desk/types";
import { Status } from "./Status";

export function DeskStrip({
  desk,
  ownerLabel,
  sessionLabel,
  round,
  phaseVoting,
  busy,
  onRevoke,
}: {
  desk: DeskView;
  ownerLabel: string;
  sessionLabel: string;
  round: number;
  phaseVoting: boolean;
  busy: boolean;
  onRevoke: () => void;
}) {
  return (
    <section className="desk rise">
      <Status
        label="Owner"
        value={desk.owner ? ownerLabel : "offline"}
        tone={desk.owner ? "live" : "mute"}
      />
      <Status
        label="Session"
        value={desk.revoked ? "REVOKED" : desk.session ? sessionLabel : "offline"}
        tone={desk.revoked ? "warn" : desk.session ? "live" : "mute"}
      />
      <Status label="Round" value={round ? `#${round}` : "—"} tone={phaseVoting ? "live" : "mute"} />
      <Status label="Fee" value="0% maker/taker" tone={desk.live ? "ok" : "mute"} />
      <button className="kill" type="button" disabled={!desk.approved || busy} onClick={onRevoke}>
        Revoke desk
      </button>
    </section>
  );
}
