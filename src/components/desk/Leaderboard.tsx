import type { Voter } from "@/lib/desk/types";

export function Leaderboard({
  voters,
  youId,
  onOpenRules,
}: {
  voters: Voter[];
  youId?: string;
  onOpenRules?: () => void;
}) {
  const you = youId?.toLowerCase();
  return (
    <div className="board">
      <div className="board-top">
        <h2>Leaderboard</h2>
        {onOpenRules && (
          <button type="button" className="rules-link" onClick={onOpenRules}>
            How it works
          </button>
        )}
      </div>
      <ol>
        {voters.map((u, i) => (
          <li key={u.id} className={u.id === "you" || (you && u.id === you) ? "you" : ""}>
            <span className="rank">{i + 1}</span>
            <span className="name">
              {u.name}
              {u.vote && <small>{u.vote}</small>}
            </span>
            <span className="pts">
              {u.pts}
              {typeof u.delta === "number" && u.delta !== 0 && (
                <em className={u.delta > 0 ? "up" : "down"}>
                  {u.delta > 0 ? `+${u.delta}` : u.delta}
                </em>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
