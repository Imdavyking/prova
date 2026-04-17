import { ArrowRight, Github, FileText } from "lucide-react";

export default function CTA() {
  return (
    <section className="section relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 grid-bg opacity-60" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(255,85,0,0.12) 0%, transparent 65%)",
        }}
      />

      {/* Diagonal orange lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="absolute h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,85,0,0.15), transparent)",
              top: `${15 + i * 14}%`,
              left: "-10%",
              right: "-10%",
              transform: `rotate(${-2 + i * 0.8}deg)`,
            }}
          />
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-6 relative text-center">
        <p className="font-mono text-xs text-orange-500 tracking-[0.25em] uppercase mb-6">
          Build on Prova
        </p>

        <h2 className="font-display font-black text-5xl md:text-7xl text-white leading-none mb-6">
          PROVA.
          <br />
          <span className="text-orange-500">PROVE IT.</span>
        </h2>

        <p className="font-body text-xl text-[#666] max-w-2xl mx-auto leading-relaxed mb-12">
          Trustless cross-chain automation. Set a condition. It executes. No
          human. No bots. Cryptographic proof — or it didn't happen.
        </p>

        <div className="flex flex-wrap gap-4 justify-center mb-20">
          <a
            href="#demo"
            className="btn-orange flex items-center gap-2 px-8 py-4 rounded-sm"
          >
            <span className="text-sm">View Live Demo</span>
            <ArrowRight size={16} strokeWidth={2.5} />
          </a>
          <a
            href="#how-it-works"
            className="btn-ghost flex items-center gap-2 px-8 py-4 rounded-sm"
          >
            <Github size={15} />
            <span className="text-sm">Read the Docs</span>
          </a>
          <a
            href="#architecture"
            className="btn-ghost flex items-center gap-2 px-8 py-4 rounded-sm"
          >
            <FileText size={15} />
            <span className="text-sm">Technical Paper</span>
          </a>
        </div>

        {/* Supported chains */}
        <div>
          <p className="font-mono text-xs text-[#333] uppercase tracking-widest mb-6">
            Supports any EVM · Solana · Cosmos · Substrate
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { name: "Ethereum", color: "#627EEA" },
              { name: "Solana", color: "#9945FF" },
              { name: "Base", color: "#0052FF" },
              { name: "Arbitrum", color: "#28A0F0" },
              { name: "Optimism", color: "#FF0420" },
              { name: "Polygon", color: "#8247E5" },
              { name: "Cosmos", color: "#2E3148" },
              { name: "+ more", color: "#333" },
            ].map(({ name, color }) => (
              <span
                key={name}
                className="font-mono text-xs px-3 py-1.5 rounded-sm border"
                style={{
                  color,
                  borderColor: `${color}30`,
                  background: `${color}08`,
                }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
