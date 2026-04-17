import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";

const HASHES = [
  "0x4a8f2c1e9b3d7056f8c2a4e1b9d3f705",
  "0xf1e3a9c5b7d2048e6f1a3c9e5b7d2048",
  "0x2b4d8e0f6a2c8e4b0d6f2a4c8e0b6d2f",
  "0x7c1e5b9d3f071a5c7e1b5d9f3071a5c7",
];

function ProofTerminal() {
  const [lines, setLines] = useState<
    {
      text: string;
      type: "cmd" | "info" | "div" | "alert" | "warn" | "proof" | "success";
    }[]
  >([]);
  const [cursor, setCursor] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const SEQUENCE: {
    delay: number;
    text: string;
    type: "cmd" | "info" | "div" | "alert" | "warn" | "proof" | "success";
  }[] = [
    { delay: 400, text: "> Monitoring ETH mainnet...", type: "cmd" },
    { delay: 900, text: "wallet: 0x4F8a...9B2c", type: "info" },
    { delay: 1400, text: "condition: balance < 0.5 ETH", type: "info" },
    { delay: 2200, text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━", type: "div" },
    { delay: 2800, text: "⚡ CONDITION TRIGGERED", type: "alert" },
    { delay: 3200, text: "block: #21,847,293", type: "info" },
    {
      delay: 3600,
      text: "balance: 0.412 ETH  [below threshold]",
      type: "warn",
    },
    { delay: 4200, text: "━━━━━━━━━━━━━━━━━━━━━━━━━━━", type: "div" },
    { delay: 4600, text: "> Generating ZK state proof...", type: "cmd" },
    { delay: 5000, text: "circuit: groth16-bn254", type: "info" },
    { delay: 5500, text: "witness: computing...", type: "info" },
    { delay: 6200, text: "proof: 0x4a8f2c1e9b3d...", type: "proof" },
    { delay: 6800, text: "✓ Proof verified on Solana", type: "success" },
    { delay: 7300, text: "> Executing action...", type: "cmd" },
    { delay: 7900, text: "tx: 5xG3...YmPq — confirmed", type: "success" },
    { delay: 8500, text: "✓ Fee collected. Rule complete.", type: "success" },
  ];

  useEffect(() => {
    const timers = SEQUENCE.map(({ delay, text, type }) =>
      setTimeout(
        () =>
          setLines((prev) => {
            const next = [...prev, { text, type }];
            return next.length > 14 ? next.slice(next.length - 14) : next;
          }),
        delay,
      ),
    );
    const restart = setTimeout(() => {
      setLines([]);
      timers.forEach(clearTimeout);
    }, 11000);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(restart);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length === 0 ? 0 : undefined]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  useEffect(() => {
    const t = setInterval(() => setCursor((c) => !c), 530);
    return () => clearInterval(t);
  }, []);

  const colorMap = {
    cmd: "text-orange-400",
    info: "text-[#888]",
    div: "text-[#333]",
    alert: "text-orange-500 font-bold",
    warn: "text-amber-400",
    proof: "text-emerald-400",
    success: "text-emerald-400 font-medium",
  };

  return (
    <div className="relative rounded-sm overflow-hidden border border-[rgba(255,85,0,0.2)] bg-[#080808]">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[rgba(255,255,255,0.06)] bg-[#0F0F0F]">
        <span className="w-3 h-3 rounded-full bg-red-500/60" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/60" />
        <span className="w-3 h-3 rounded-full bg-green-500/60" />
        <span className="ml-3 font-mono text-xs text-[#444]">
          prova — proof-engine — live
        </span>
        <span className="ml-auto w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
      </div>
      {/* Scan line */}
      <div className="relative overflow-hidden">
        <div className="scan-line" style={{ top: 0 }} />
      </div>
      {/* Content */}
      <div
        ref={containerRef}
        className="h-72 overflow-y-auto px-5 py-4 font-mono text-xs leading-6 space-y-0.5"
        style={{ scrollBehavior: "smooth" }}
      >
        {lines.map((line, i) => (
          <div key={i} className={`${colorMap[line.type] || "text-[#aaa]"}`}>
            {line.text}
          </div>
        ))}
        {lines.length > 0 && (
          <span
            className={`inline-block w-2 h-3.5 bg-orange-500 ${cursor ? "opacity-100" : "opacity-0"}`}
          />
        )}
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col justify-center pt-20 overflow-hidden grid-bg">
      {/* Ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse, rgba(255,85,0,0.08) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-[600px] h-[400px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at bottom right, rgba(255,184,0,0.04) 0%, transparent 60%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 w-full py-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left — copy */}
          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 border border-orange-500/30 bg-orange-500/5 rounded-full px-4 py-1.5">
              <ShieldCheck
                size={13}
                className="text-orange-500"
                strokeWidth={2.5}
              />
              <span className="font-mono text-xs text-orange-400 tracking-widest uppercase">
                Trustless Cross-Chain Automation
              </span>
            </div>

            {/* Headline */}
            <h1 className="font-display font-black leading-none text-white">
              <span className="block text-4xl md:text-5xl lg:text-6xl">
                SET A RULE.
              </span>
              <span
                className="block text-4xl md:text-5xl lg:text-6xl mt-1"
                style={{
                  color: "#FF5500",
                  textShadow: "0 0 60px rgba(255,85,0,0.4)",
                }}
              >
                IT EXECUTES.
              </span>
              <span className="block text-4xl md:text-5xl lg:text-6xl mt-1 text-white/80">
                NO HUMANS.
              </span>
            </h1>

            {/* Subheading */}
            <p className="font-body text-lg text-[#888] leading-relaxed max-w-xl">
              Prove a condition on one chain. Execute an action on another.
              Entirely trustless — cryptographic proof, not oracles. Not a
              bridge. Not an oracle. A new primitive.
            </p>

            {/* Mini rule example */}
            <div className="border border-[rgba(255,85,0,0.15)] bg-[#0A0A0A] rounded-sm p-4 space-y-2">
              <p className="font-mono text-xs text-[#444] uppercase tracking-widest">
                Example Rule
              </p>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0 mt-1.5" />
                <p className="font-mono text-sm">
                  <span className="text-[#888]">WHEN</span>
                  <span className="text-white">
                    {" "}
                    ETH wallet balance drops below 0.5 ETH
                  </span>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-1.5" />
                <p className="font-mono text-sm">
                  <span className="text-[#888]">DO </span>
                  <span className="text-white">
                    {" "}
                    transfer 100 USDC on Solana automatically
                  </span>
                </p>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <a
                href="#demo"
                className="btn-orange flex items-center gap-2 px-7 py-3.5 rounded-sm text-sm"
              >
                See Live Demo
                <ArrowRight size={15} strokeWidth={2.5} />
              </a>
              <a
                href="#how-it-works"
                className="btn-ghost flex items-center gap-2 px-7 py-3.5 rounded-sm text-sm"
              >
                How It Works
              </a>
            </div>

            {/* Stats */}
            <div className="flex gap-8 pt-2">
              {[
                { value: "< 30s", label: "Proof to Execution" },
                { value: "∞", label: "Chain Combinations" },
                { value: "0", label: "Trusted Parties" },
              ].map(({ value, label }) => (
                <div key={label}>
                  <p className="font-display font-bold text-2xl text-orange-500">
                    {value}
                  </p>
                  <p className="font-mono text-xs text-[#555] mt-0.5">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — terminal */}
          <div className="space-y-4 animate-float">
            <ProofTerminal />
            {/* Chain labels */}
            <div className="flex justify-between items-center px-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span className="font-mono text-xs text-[#555]">
                  Source: Ethereum
                </span>
              </div>
              <div className="font-mono text-xs text-[#333]">
                ━━━━ ZK Proof ━━━━
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-[#555]">
                  Destination: Solana
                </span>
                <span className="w-2 h-2 rounded-full bg-purple-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom divider */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,85,0,0.3), transparent)",
        }}
      />
    </section>
  );
}
