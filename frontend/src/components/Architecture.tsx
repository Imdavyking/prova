import { useState, useEffect } from "react";
import { CheckCircle, Clock, Loader } from "lucide-react";

const FLOW_STAGES = [
  {
    id: "register",
    label: "Rule Registered",
    chain: "Prova Registry",
    color: "#FF5500",
    detail: "User registers: balance < 0.5 ETH → transfer 100 USDC on Solana",
    icon: "📋",
  },
  {
    id: "monitor",
    label: "Condition Detected",
    chain: "Ethereum Mainnet",
    color: "#627EEA",
    detail: "Block #21,847,293 — wallet 0x4F8a...9B2c balance: 0.412 ETH",
    icon: "🔍",
  },
  {
    id: "proof",
    label: "ZK Proof Generated",
    chain: "Prova Node (SP1)",
    color: "#FFB800",
    detail: "Groth16 proof: 0x4a8f2c1e9b3d7056f8c2a4e1b9d3f70…",
    icon: "🔐",
  },
  {
    id: "verify",
    label: "Proof Verified",
    chain: "Solana Testnet",
    color: "#9945FF",
    detail: "On-chain verifier confirms state proof is valid",
    icon: "✅",
  },
  {
    id: "execute",
    label: "Action Executed",
    chain: "Solana Testnet",
    color: "#14F195",
    detail: "TX: 5xG3...YmPq — 100 USDC transferred. Executor fee: 0.002 SOL",
    icon: "⚡",
  },
];

function StageRow({
  stage,
  status,
  isLast,
}: {
  stage: (typeof FLOW_STAGES)[number];
  status: "done" | "active" | "pending";
  isLast: boolean;
}) {
  const statusIcon = {
    done: <CheckCircle size={16} className="text-emerald-400" />,
    active: <Loader size={16} className="text-orange-500 animate-spin" />,
    pending: <Clock size={16} className="text-[#333]" />,
  }[status];

  return (
    <div className={`relative flex gap-5 ${!isLast ? "pb-6" : ""}`}>
      {/* Timeline rail */}
      {!isLast && (
        <div
          className="absolute left-[19px] top-8 w-px h-full"
          style={{
            background:
              status === "done" ? stage.color : "rgba(255,255,255,0.06)",
            opacity: status === "done" ? 0.4 : 1,
          }}
        />
      )}

      {/* Node */}
      <div
        className="relative z-10 w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0 text-lg transition-all duration-500"
        style={{
          background: status === "pending" ? "#111" : `${stage.color}18`,
          border: `1px solid ${status === "pending" ? "rgba(255,255,255,0.06)" : stage.color + "40"}`,
          boxShadow: status === "active" ? `0 0 20px ${stage.color}40` : "none",
        }}
      >
        {status === "pending" ? "○" : stage.icon}
      </div>

      {/* Content */}
      <div className="flex-1 pt-1.5">
        <div className="flex items-center gap-3 mb-0.5">
          <span
            className="font-heading font-semibold text-sm transition-colors duration-300"
            style={{ color: status === "pending" ? "#444" : "#F0EEE8" }}
          >
            {stage.label}
          </span>
          {statusIcon}
        </div>
        <p
          className="font-mono text-xs mb-1"
          style={{
            color: stage.color,
            opacity: status === "pending" ? 0.3 : 0.8,
          }}
        >
          {stage.chain}
        </p>
        {status !== "pending" && (
          <p className="font-mono text-xs text-[#555] leading-relaxed">
            {stage.detail}
          </p>
        )}
      </div>
    </div>
  );
}

export default function Architecture() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      setActiveIdx((i) => {
        if (i >= FLOW_STAGES.length) {
          setTimeout(() => setActiveIdx(0), 1500);
          return i;
        }
        return i + 1;
      });
    }, 1800);
    return () => clearInterval(t);
  }, [running]);

  const getStatus = (i: number) => {
    if (i < activeIdx) return "done";
    if (i === activeIdx) return "active";
    return "pending";
  };

  return (
    <section id="architecture" className="section relative overflow-hidden">
      <div
        className="absolute right-0 top-0 w-[600px] h-[600px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at top right, rgba(255,85,0,0.05) 0%, transparent 60%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          {/* Left — copy */}
          <div>
            <p className="font-mono text-xs text-orange-500 tracking-[0.2em] uppercase mb-4">
              Architecture
            </p>
            <h2 className="font-display font-black text-4xl md:text-5xl text-white leading-tight mb-6">
              The proof is the
              <br />
              <span className="text-orange-500">trust anchor.</span>
            </h2>
            <p className="font-body text-[#666] leading-relaxed mb-10">
              Every other automation protocol asks you to trust a relayer, an
              oracle, or a committee. Prova asks you to trust math. A ZK state
              proof is cryptographic evidence that a condition happened —
              verifiable by anyone, on-chain.
            </p>

            {/* Key distinction boxes */}
            <div className="space-y-3">
              {[
                {
                  label: "Oracles tell you what happened.",
                  sub: "You trust them to be honest.",
                },
                {
                  label: "Relayers say it happened.",
                  // FIXED: "trust them to not lie" → "trust them not to lie"
                  sub: "You trust them not to lie.",
                },
                {
                  label: "Prova proves it happened.",
                  sub: "Math. Not trust.",
                  highlight: true,
                },
              ].map(({ label, sub, highlight }) => (
                <div
                  key={label}
                  className={`px-5 py-4 rounded-sm border transition-all ${
                    highlight
                      ? "border-orange-500/40 bg-orange-500/5"
                      : "border-[rgba(255,255,255,0.05)] bg-[#0A0A0A]"
                  }`}
                >
                  <p
                    className={`font-heading font-semibold text-sm ${highlight ? "text-orange-400" : "text-[#555]"}`}
                  >
                    {label}
                  </p>
                  <p
                    className={`font-mono text-xs mt-0.5 ${highlight ? "text-orange-500/60" : "text-[#333]"}`}
                  >
                    {sub}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — animated flow */}
          <div>
            <div className="card rounded-sm p-8">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="font-heading font-bold text-white text-base">
                    Execution Flow
                  </h3>
                  <p className="font-mono text-xs text-[#444] mt-0.5">
                    ETH → ZK Proof → Solana
                  </p>
                </div>
                <button
                  onClick={() => {
                    setRunning((r) => !r);
                    setActiveIdx(0);
                  }}
                  className="font-mono text-xs border border-[rgba(255,85,0,0.2)] text-orange-500 px-3 py-1.5 rounded-sm hover:bg-orange-500/10 transition-colors"
                >
                  {running ? "⏸ Pause" : "▶ Play"}
                </button>
              </div>

              {/* Steps */}
              <div>
                {FLOW_STAGES.map((stage, i) => (
                  <StageRow
                    key={stage.id}
                    stage={stage}
                    status={getStatus(i)}
                    isLast={i === FLOW_STAGES.length - 1}
                  />
                ))}
              </div>

              {/* Bottom time estimate */}
              {activeIdx >= FLOW_STAGES.length && (
                <div className="mt-6 pt-5 border-t border-[rgba(255,255,255,0.05)]">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#444]">
                      Total execution time
                    </span>
                    <span className="font-mono text-sm text-emerald-400 font-medium">
                      ~28 seconds
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="font-mono text-xs text-[#444]">
                      Human intervention
                    </span>
                    <span className="font-mono text-sm text-orange-500 font-medium">
                      None
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
