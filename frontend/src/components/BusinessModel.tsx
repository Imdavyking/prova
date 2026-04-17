import { TrendingUp, Users, Layers } from "lucide-react";

const STREAMS = [
  {
    icon: TrendingUp,
    title: "Execution Fees",
    desc: "Every rule execution collects a fee from the user, split between the protocol treasury and the executing node. Volume-based revenue that scales with usage.",
    metric: "Per-execution",
    color: "#FF5500",
  },
  {
    icon: Users,
    title: "Protocol Integrations",
    desc: "DeFi protocols, vaults, and DAOs pay an integration fee to embed Prova execution directly into their smart contracts — no rebuild required.",
    metric: "Recurring SaaS",
    color: "#FFB800",
  },
  {
    icon: Layers,
    title: "Registry Standard",
    desc: "As adoption grows, the Prova registry becomes the canonical cross-chain automation standard. Rule composition and premium condition types generate additional premium revenue.",
    metric: "Network moat",
    color: "#FF7700",
  },
];

export default function BusinessModel() {
  return (
    <section className="section relative border-t border-[rgba(255,255,255,0.04)]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          {/* Left */}
          <div>
            <p className="font-mono text-xs text-orange-500 tracking-[0.2em] uppercase mb-4">
              Business Model
            </p>
            <h2 className="font-display font-black text-4xl md:text-5xl text-white leading-tight mb-6">
              Revenue is built
              <br />
              <span className="text-orange-500">into the protocol.</span>
            </h2>
            <p className="font-body text-[#666] leading-relaxed mb-8">
              No governance token speculation. No VC-subsidized usage. Every
              action on Prova pays an execution fee — the protocol earns every
              time the system does what it was built to do.
            </p>

            {/* Funnel viz */}
            <div className="space-y-2">
              {[
                {
                  label: "Users register rules",
                  width: "w-full",
                  bg: "bg-[#1A1A1A]",
                },
                {
                  label: "Conditions trigger",
                  width: "w-5/6",
                  bg: "bg-[#1F1810]",
                  color: "text-orange-800",
                },
                {
                  label: "Proofs generated + verified",
                  width: "w-4/6",
                  bg: "bg-[#281A0A]",
                },
                {
                  label: "Execution fee collected",
                  width: "w-3/6",
                  bg: "bg-orange-500/20",
                  color: "text-orange-400",
                  highlight: true,
                },
              ].map(({ label, width, bg, color, highlight }) => (
                <div
                  key={label}
                  className={`${width} ${bg} border ${highlight ? "border-orange-500/30" : "border-[rgba(255,255,255,0.04)]"} rounded-sm px-4 py-2.5 transition-all`}
                >
                  <span
                    className={`font-mono text-xs ${color || "text-[#555]"}`}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right */}
          <div className="space-y-4">
            {STREAMS.map(({ icon: Icon, title, desc, metric, color }) => (
              <div key={title} className="card rounded-sm p-6 flex gap-5">
                <div
                  className="w-10 h-10 rounded-sm flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${color}15`,
                    border: `1px solid ${color}25`,
                  }}
                >
                  <Icon size={18} style={{ color }} strokeWidth={1.5} />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-heading font-semibold text-white text-sm">
                      {title}
                    </h3>
                    <span
                      className="font-mono text-xs px-2 py-0.5 rounded-full"
                      style={{ color, background: `${color}15` }}
                    >
                      {metric}
                    </span>
                  </div>
                  <p className="font-body text-xs text-[#666] leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
