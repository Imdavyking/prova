export default function Footer() {
  return (
    <footer className="border-t border-[rgba(255,85,0,0.1)] bg-[#050505]">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <svg viewBox="0 0 32 32" fill="none" className="w-7 h-7">
                <rect width="32" height="32" rx="4" fill="#FF5500" />
                <path
                  d="M9 24V8h8.5C21.09 8 24 10.5 24 14c0 3.5-2.91 6-6.5 6H13v4H9z"
                  fill="#000"
                />
                <path
                  d="M13 16h4.5C19.43 16 20 14.9 20 14c0-.9-.57-2-2.5-2H13v4z"
                  fill="#FF5500"
                />
              </svg>
              <span className="font-display font-black text-lg text-white tracking-tight">
                PROVA
              </span>
            </div>
            <p className="font-body text-xs text-[#444] leading-relaxed">
              Trustless cross-chain automation. Prove a condition. Execute an
              action. No humans.
            </p>
          </div>

          {/* Links */}
          {[
            {
              title: "Protocol",
              links: [
                "How It Works",
                "Architecture",
                "ZK Proofs",
                "Executor Network",
              ],
            },
            {
              title: "Developers",
              links: ["Documentation", "SDK", "GitHub", "Testnet"],
            },
            {
              title: "Community",
              links: ["Twitter / X", "Discord", "Blog", "Colosseum Hackathon"],
            },
          ].map(({ title, links }) => (
            <div key={title}>
              <p className="font-mono text-xs text-[#444] uppercase tracking-widest mb-4">
                {title}
              </p>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="font-body text-sm text-[#555] hover:text-white transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[rgba(255,255,255,0.04)] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="font-mono text-xs text-[#333]">
            © 2025 Prova Protocol. Built for Colosseum Hackathon.
          </p>
          <p className="font-mono text-xs text-[#222]">
            Set a rule. It executes. No human. No bots.
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span className="font-mono text-xs text-[#333]">Testnet live</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
