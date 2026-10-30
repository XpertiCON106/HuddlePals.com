/** Dashboard date ranges. Values match the Worker's `range` query parameter. */
export const RANGES = [
  { value: "1", label: "24 hours", short: "24H" },
  { value: "7", label: "7 days", short: "7D" },
  { value: "30", label: "30 days", short: "30D" },
  { value: "60", label: "60 days", short: "60D" },
  { value: "90", label: "90 days", short: "90D" },
  { value: "180", label: "180 days", short: "180D" },
  { value: "365", label: "1 year", short: "1Y" },
  { value: "all", label: "All time", short: "All" },
] as const;

export type RangeValue = (typeof RANGES)[number]["value"];

// The common ranges get a button; the rest sit in a "More…" select.
const QUICK: RangeValue[] = ["7", "30", "90", "all"];

export function rangeText(value: RangeValue): string {
  if (value === "all") return "all time";
  return `the last ${RANGES.find((range) => range.value === value)?.label ?? "30 days"}`;
}

export function RangePicker({ value, onChange }: { value: RangeValue; onChange: (value: RangeValue) => void }) {
  const inMore = !QUICK.includes(value);
  return (
    <div className="a-range" role="group" aria-label="Date range">
      <div className="a-segment">
        {RANGES.filter((range) => QUICK.includes(range.value)).map((range) => (
          <button
            key={range.value}
            type="button"
            aria-pressed={value === range.value}
            title={range.label}
            onClick={() => onChange(range.value)}
          >
            {range.short}
          </button>
        ))}
      </div>
      <select
        aria-label="More ranges"
        className={inMore ? "a-select is-active" : "a-select"}
        value={inMore ? value : ""}
        onChange={(event) => event.target.value && onChange(event.target.value as RangeValue)}
      >
        <option value="">More…</option>
        {RANGES.filter((range) => !QUICK.includes(range.value)).map((range) => (
          <option key={range.value} value={range.value}>
            {range.label}
          </option>
        ))}
      </select>
    </div>
  );
}
