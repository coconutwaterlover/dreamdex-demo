import type { TapeItem } from "@/lib/desk/types";

export function Tape({ tape }: { tape: TapeItem[] }) {
  return (
    <div className="tape">
      <h2>Execution tape</h2>
      <ul>
        {tape.map((item) => (
          <li key={item.id} className={item.tone}>
            <time>{item.t}</time>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
