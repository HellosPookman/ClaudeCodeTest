interface Props {
  value?: number | null;
  label: string;
  threshold?: number;
}

export default function ConfidenceBar({ value, label, threshold = 0.9 }: Props) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  const ok = value >= threshold;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span className={ok ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${ok ? "bg-green-500" : "bg-orange-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
