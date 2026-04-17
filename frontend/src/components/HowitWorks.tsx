import { BookOpen, Cpu, Zap } from "lucide-react";

const STEPS = [
  {
    number: "01",
    icon: BookOpen,
    title: "Action Registry",
    subtitle: "On-Chain Contract",
    color: "#FF5500",
    description:
      "Users register a rule: a condition to watch, an action to execute, and an execution fee. The registry lives on-chain — immutable, transparent, unstoppable.",
    details: [
      "Stores condition + action pairs",
      "Holds execution fee in escrow",
      "Verifies incoming ZK proofs",
      "Triggers execution on proof submission",
    ],
    tag: "Smart Contract",
  },
  {
    number: "02",
    icon: Cpu,
    title: "Condition Monitor",
    subtitle: "+ Proof Generator",
    color: "#FF8800",
    description:
      "Off-chain nodes watch source chains continuously. The moment a condition triggers, they generate a ZK state proof — a cryptographic certificate that the event happened.",
    details: [
      "Watches any EVM / Solana / Cosmos chain",
      "Detects condition using block data",
      "Generates ZK proof via SP1 (Succinct)",
      "Proof anchors trust — no oracle needed",
    ],
    tag: "Off-Chain Node",
  },
  {
    number: "03",
    icon: Zap,
    title: "Executor Network",
    subtitle: "Staked + Slashable",
    color: "#FFB800",
    description:
      "Executor nodes receive the verified proof, submit it to the destination chain, execute the action, and collect the fee. They stake to participate. Fail or cheat — get slashed.",
    details: [
      "Nodes stake to join the network",
      "Multi-executor confirmation per action",
      "No single point of failure",
      "Slashing enforces honest behavior",
    ],
    tag: "Executor Node",
  },
];

function StepCard({
  step,
  index,
}: {
  step: (typeof STEPS)[number];
  index: number;
}) {
  const Icon = step.icon;

  return (
    <div className="relative group">
      {/* Connector line (not on last) */}
      {index < STEPS.length - 1 && (
        <div
          className="hidden lg:block absolute top-16 left-full w-full h-px z-0"
          style={{
            background: `linear-gradient(90deg, ${step.color}, ${STEPS[index + 1].color})`,
            opacity: 0.3,
          }}
        />
      )}

      <div className="card rounded-sm p-8 h-full relative z-10 group-hover:border-orange-500/30 transition-all duration-300">
        {/* Top row */}
        <div className="flex items-start justify-between mb-6">
          <div
            className="w-12 h-12 rounded-sm flex items-center justify-center"
            style={{
              background: `${step.color}15`,
              border: `1px solid ${step.color}30`,
            }}
          >
            <Icon size={22} style={{ color: step.color }} strokeWidth={1.5} />
          </div>
          <span
            className="font-display font-black text-5xl"
            style={{ color: `${step.color}15` }}
          >
            {step.number}
          </span>
        </div>

        {/* Tag */}
        <div className="inline-flex mb-4">
          <span
            className="font-mono text-xs px-2.5 py-0.5 rounded-full"
            style={{
              color: step.color,
              background: `${step.color}10`,
              border: `1px solid ${step.color}20`,
            }}
          >
            {step.tag}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-heading font-bold text-xl text-white mb-0.5">
          {step.title}
        </h3>
        <p className="font-mono text-xs mb-4" style={{ color: step.color }}>
          {step.subtitle}
        </p>

        {/* Description */}
        <p className="font-body text-sm text-[#777] leading-relaxed mb-6">
          {step.description}
        </p>

        {/* Details list */}
        <ul className="space-y-2">
          {step.details.map((d, i) => (
            <li
              key={i}
              className="flex items-start gap-2.5 font-mono text-xs text-[#555]"
            >
              <span
                className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: step.color, opacity: 0.7 }}
              />
              {d}
            </li>
          ))}
        </ul>

        {/* Bottom glow on hover */}
        <div
          className="absolute inset-x-0 bottom-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: `linear-gradient(90deg, transparent, ${step.color}, transparent)`,
          }}
        />
      </div>
    </div>
  );
}

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="section relative">
      {/* BG accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(255,85,0,0.04) 0%, transparent 60%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 relative">
        {/* Section header */}
        <div className="max-w-2xl mb-20">
          <p className="font-mono text-xs text-orange-500 tracking-[0.2em] uppercase mb-4">
            How It Works
          </p>
          <h2 className="font-display font-black text-4xl md:text-5xl text-white leading-tight mb-6">
            Three components.
            <br />
            <span className="text-orange-500">Zero trust required.</span>
          </h2>
          <p className="font-body text-[#666] leading-relaxed">
            No centralized bots. No trusted relayers. No oracles. Every
            execution is anchored by a cryptographic proof that cannot lie.
          </p>
        </div>

        {/* Cards */}
        <div className="grid lg:grid-cols-3 gap-6 relative">
          {STEPS.map((step, i) => (
            <StepCard key={step.number} step={step} index={i} />
          ))}
        </div>

        {/* Flow arrow beneath on mobile */}
        <div className="lg:hidden flex justify-center gap-4 mt-6 text-[#333] font-mono text-xs">
          {STEPS.map((s, i) => (
            <span key={i} className="flex items-center gap-2">
              <span style={{ color: s.color }}>{s.number}</span>
              {i < STEPS.length - 1 && <span>→</span>}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
