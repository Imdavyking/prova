const ITEMS = [
  "0x4a8f2c1e...3d7056f8",
  "PROOF VERIFIED ON-CHAIN",
  "0xf1e3a9c5...b7d20483",
  "CONDITION MET — EXECUTING",
  "0x2b4d8e0f...6a2c8e4b",
  "FEE COLLECTED — RULE COMPLETE",
  "0x7c1e5b9d...3f071a5c",
  "CROSS-CHAIN ACTION CONFIRMED",
  "0xa3f72d1b...9e4c608a",
  "TRUSTLESS EXECUTION — NO HUMAN",
];

export default function Ticker() {
  const doubled = [...ITEMS, ...ITEMS];

  return (
    <div className="overflow-hidden border-y border-[rgba(255,85,0,0.1)] bg-[#060606] py-3">
      <div
        className="flex gap-12 animate-ticker whitespace-nowrap"
        style={{ width: "max-content" }}
      >
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-3 font-mono text-xs">
            <span
              className={
                item.startsWith("0x")
                  ? "text-orange-500/60"
                  : "text-[#444] tracking-[0.15em] uppercase"
              }
            >
              {item}
            </span>
            <span className="text-[#222]">◈</span>
          </span>
        ))}
      </div>
    </div>
  );
}
