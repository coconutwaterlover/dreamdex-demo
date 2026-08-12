export function Status({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "live" | "ok" | "warn" | "mute";
}) {
  return (
    <div className={`status ${tone}`}>
      <div className="top">
        <span className="dot pulse" aria-hidden />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}
