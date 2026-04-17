import { Check, X, Minus } from "lucide-react";
import type { P } from "node_modules/@starknet-react/core/dist/index-KYmfBIOq";

const FEATURES = [
  "Cross-chain execution",
  "Cryptographic proof of trigger",
  "No trusted relayer / oracle",
  "Arbitrary condition types",
  "On-chain rule registration",
  "Staked executor network",
  "Composable by other protocols",
];

const PROTOCOLS = [
  {
    name: "Gelato",
    type: "Single-chain automation",
    color: "#FF5500",
    scores: [false, false, false, true, true, false, true],
  },
  {
    name: "Chainlink",
    type: "Oracle + automation",
    color: "#375BD2",
    scores: [false, false, false, true, false, false, true],
  },
  {
    name: "Bridge",
    type: "Asset transfer only",
    color: "#444",
    scores: [true, false, false, false, false, false, false],
  },
  {
    name: "Prova",
    type: "Trustless cross-chain",
    color: "#FF5500",
    isPrimary: true,
    scores: [true, true, true, true, true, true, true],
  },
];

function ScoreCell({
  val,
  isPrimary,
}: {
  val: boolean | null;
  isPrimary?: boolean;
}) {
  if (val === true)
    return (
      <Check
        size={16}
        className={isPrimary ? "text-orange-500" : "text-emerald-500/60"}
        strokeWidth={2.5}
      />
    );
  if (val === false)
    return <X size={16} className="text-[#333]" strokeWidth={2} />;
  return <Minus size={16} className="text-[#333]" strokeWidth={2} />;
}

export default function WhyProva() {
  return (
    <section id="why-prova" className="section relative">
      <div
        className="absolute left-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at left center, rgba(255,85,0,0.05) 0%, transparent 60%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 relative">
        {/* Header */}
        <div className="max-w-2xl mb-16">
          <p className="font-mono text-xs text-orange-500 tracking-[0.2em] uppercase mb-4">
            Why Prova
          </p>
          <h2 className="font-display font-black text-4xl md:text-5xl text-white leading-tight mb-6">
            Nobody does
            <br />
            <span className="text-orange-500">what we do.</span>
          </h2>
          <p className="font-body text-[#666] leading-relaxed">
            Gelato and Chainlink solve single-chain automation. Bridges move
            assets. Nobody proves a condition on Chain A and executes on Chain
            B, trustlessly. That gap is exactly where Prova lives.
          </p>
        </div>

        {/* Comparison table */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className="text-left pb-6 font-mono text-xs text-[#444] uppercase tracking-widest w-56">
                  Capability
                </th>
                {PROTOCOLS.map((p) => (
                  <th key={p.name} className="pb-6 text-center">
                    <div
                      className={`inline-block px-4 py-3 rounded-sm ${p.isPrimary ? "bg-orange-500/10 border border-orange-500/30" : "bg-[#0A0A0A] border border-[rgba(255,255,255,0.05)]"}`}
                    >
                      <p
                        className={`font-heading font-bold text-sm ${p.isPrimary ? "text-orange-400" : "text-[#666]"}`}
                      >
                        {p.name}
                      </p>
                      <p
                        className="font-mono text-xs mt-0.5"
                        style={{ color: p.isPrimary ? "#FF5500" : "#333" }}
                      >
                        {p.type}
                      </p>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((feature, fi) => (
                <tr
                  key={feature}
                  className="border-t border-[rgba(255,255,255,0.04)] group"
                >
                  <td className="py-4 pr-8">
                    <span className="font-body text-sm text-[#777] group-hover:text-[#aaa] transition-colors">
                      {feature}
                    </span>
                  </td>
                  {PROTOCOLS.map((p) => (
                    <td
                      key={p.name}
                      className={`py-4 text-center ${p.isPrimary ? "bg-orange-500/3" : ""}`}
                    >
                      <div className="flex justify-center">
                        <ScoreCell val={p.scores[fi]} isPrimary={p.isPrimary} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Tagline */}
        <div className="mt-16 border border-orange-500/20 bg-orange-500/5 rounded-sm p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <p className="font-display font-black text-2xl text-white mb-2">
                This is infrastructure, not an app.
              </p>
              <p className="font-body text-[#666] max-w-xl">
                Other protocols plug into Prova instead of building their own
                execution layer. The more protocols integrate, the more valuable
                the registry becomes. That's the moat.
              </p>
            </div>
            <a
              href="#architecture"
              className="btn-orange flex-shrink-0 px-8 py-4 rounded-sm text-sm whitespace-nowrap"
            >
              Integrate Prova →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
