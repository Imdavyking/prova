import { useState } from "react";
import { Play, ExternalLink, CheckCircle2 } from "lucide-react";

const DEMO_STEPS = [
  {
    id: 1,
    title: "Register Rule",
    desc: "Alice deposits 0.1 ETH as execution fee and registers her condition on the Prova registry.",
    code: `provRegistry.register({
  condition: {
    chain:    "ethereum:1",
    type:     "balance_below",
    address:  "0x4F8a...9B2c",
    threshold: parseEther("0.5")
  },
  action: {
    chain:  "solana:mainnet",
    type:   "transfer",
    token:  "USDC",
    amount: 100_000000n, // 100 USDC
    to:     "7Gsn...3Ppz"
  },
  fee: parseEther("0.1")
})`,
    chain: "Prova Registry",
    chainColor: "#FF5500",
  },
  {
    id: 2,
    title: "Condition Triggered",
    desc: "Block #21,847,293 is mined. Prova monitors detect Alice's balance has dropped below the threshold.",
    code: `// Block #21,847,293 observed
// wallet: 0x4F8a...9B2c
// prev balance: 0.612 ETH
// new  balance: 0.412 ETH  ← BELOW 0.5 ETH
//
// Condition matched. Rule ID: #8294
// Initiating ZK proof generation...`,
    chain: "Ethereum Mainnet",
    chainColor: "#627EEA",
  },
  {
    id: 3,
    title: "ZK Proof Generated",
    desc: "A Groth16 state proof is generated proving the balance drop happened in block #21,847,293.",
    code: `// SP1 proof generation
circuit:    groth16-bn254
block:      21847293
storageKey: keccak256(addr, slot)
value:      0x412... (< threshold)

proof_a: [0x4a8f2c1e..., 0x9b3d7056...]
proof_b: [[0xf1e3a9c5..., 0xb7d20483...]]
proof_c: [0x2b4d8e0f..., 0x6a2c8e4b...]

✓ Proof size: 264 bytes
✓ Verification gas: ~280k`,
    chain: "Prova Node",
    chainColor: "#FFB800",
  },
  {
    id: 4,
    title: "Proof Verified + Executed",
    desc: "The proof is submitted to Solana. The verifier confirms it on-chain. The transfer fires.",
    code: `// Solana program: prova_executor
verifyProof(proof, publicInputs) → OK
executeAction({
  token:  "USDC",
  amount: 100_000000,
  to:     "7Gsn...3Ppz"
})

TX: 5xGHuF3...YmPqZ2
Slot: 295,847,102
Status: confirmed ✓

Executor fee paid: 0.002 SOL`,
    chain: "Solana Testnet",
    chainColor: "#14F195",
  },
];

export default function Demo() {
  const [active, setActive] = useState(0);
  const step = DEMO_STEPS[active];

  return (
    <section id="demo" className="section relative">
      <div
        className="absolute inset-0 pointer-events-none grid-bg"
        style={{ opacity: 0.4 }}
      />

      <div className="max-w-7xl mx-auto px-6 relative">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <p className="font-mono text-xs text-orange-500 tracking-[0.2em] uppercase mb-4">
              Demo
            </p>
            <h2 className="font-display font-black text-4xl md:text-5xl text-white leading-tight">
              The demo that shows
              <br />
              <span className="text-orange-500">the impossible.</span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <span className="font-mono text-xs text-[#555]">Testnet live</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Step selector */}
          <div className="lg:col-span-2 space-y-2">
            {DEMO_STEPS.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setActive(i)}
                className={`w-full text-left px-5 py-4 rounded-sm border transition-all duration-200 ${
                  active === i
                    ? "border-orange-500/50 bg-orange-500/8"
                    : "border-[rgba(255,255,255,0.05)] bg-[#0A0A0A] hover:border-orange-500/20"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="font-display font-black text-2xl leading-none"
                    style={{ color: active === i ? "#FF5500" : "#222" }}
                  >
                    {String(s.id).padStart(2, "0")}
                  </span>
                  <div className="flex-1">
                    <p
                      className={`font-heading font-semibold text-sm ${active === i ? "text-white" : "text-[#555]"}`}
                    >
                      {s.title}
                    </p>
                    <p
                      className="font-mono text-xs mt-0.5"
                      style={{ color: active === i ? s.chainColor : "#333" }}
                    >
                      {s.chain}
                    </p>
                  </div>
                  {active === i && (
                    <CheckCircle2
                      size={14}
                      className="text-orange-500 flex-shrink-0"
                    />
                  )}
                </div>
              </button>
            ))}

            {/* Summary */}
            <div className="mt-6 p-5 border border-emerald-500/20 bg-emerald-500/5 rounded-sm">
              <p className="font-mono text-xs text-emerald-500 uppercase tracking-widest mb-3">
                End Result
              </p>
              <p className="font-body text-sm text-[#777] leading-relaxed">
                100 USDC transferred on Solana. Zero human input. Zero bots.
                Cryptographic proof on-chain.
              </p>
            </div>
          </div>

          {/* Code panel */}
          <div className="lg:col-span-3">
            <div
              className="rounded-sm overflow-hidden border transition-all duration-300"
              style={{ borderColor: `${step.chainColor}30` }}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-5 py-3 border-b"
                style={{
                  borderColor: `${step.chainColor}15`,
                  background: `${step.chainColor}08`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-red-500/50" />
                    <span className="w-3 h-3 rounded-full bg-yellow-500/50" />
                    <span className="w-3 h-3 rounded-full bg-green-500/50" />
                  </div>
                  <span className="font-mono text-xs text-[#444]">
                    step-{step.id}.{step.chain.toLowerCase().replace(/ /g, "-")}
                    .ts
                  </span>
                </div>
                <span
                  className="font-mono text-xs px-2.5 py-0.5 rounded-full"
                  style={{
                    color: step.chainColor,
                    background: `${step.chainColor}15`,
                    border: `1px solid ${step.chainColor}25`,
                  }}
                >
                  {step.chain}
                </span>
              </div>

              {/* Description */}
              <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.04)] bg-[#080808]">
                <p className="font-body text-sm text-[#888] leading-relaxed">
                  {step.desc}
                </p>
              </div>

              {/* Code */}
              <div className="bg-[#050505] p-5">
                <pre
                  className="font-mono text-xs leading-6 overflow-x-auto"
                  style={{ color: "#AAA" }}
                >
                  <code>{step.code}</code>
                </pre>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between mt-4">
              <button
                onClick={() => setActive((a) => Math.max(0, a - 1))}
                disabled={active === 0}
                className="font-mono text-xs text-[#444] hover:text-white disabled:opacity-20 transition-colors px-3 py-2"
              >
                ← Previous
              </button>
              <div className="flex gap-2 items-center">
                {DEMO_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className="w-2 h-2 rounded-full transition-all"
                    style={{ background: i === active ? "#FF5500" : "#222" }}
                  />
                ))}
              </div>
              <button
                onClick={() =>
                  setActive((a) => Math.min(DEMO_STEPS.length - 1, a + 1))
                }
                disabled={active === DEMO_STEPS.length - 1}
                className="font-mono text-xs text-[#444] hover:text-white disabled:opacity-20 transition-colors px-3 py-2"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
