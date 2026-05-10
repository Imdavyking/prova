// src/components/Navbar.tsx
import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

const NAV_LINKS = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Architecture", href: "/#architecture" },
  { label: "Demo", href: "/#demo" },
  { label: "Why Prova", href: "/#why-prova" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isApp = location.pathname === "/app";

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled || isApp
          ? "bg-black/90 backdrop-blur-md border-b border-[rgba(255,85,0,0.12)]"
          : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-20">
        {/* Wordmark */}
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative w-8 h-8 flex-shrink-0">
            <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
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
          </div>
          <span className="font-display font-black text-xl tracking-tight text-white group-hover:text-orange-500 transition-colors">
            PROVA
          </span>
        </Link>

        {/* Desktop nav — hide on /app */}
        {!isApp && (
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="font-heading text-sm font-medium text-[#888] hover:text-white tracking-wide transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>
        )}

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          {isApp ? (
            <Link to="/" className="btn-ghost text-xs px-5 py-2.5 rounded-sm">
              ← Back to Home
            </Link>
          ) : (
            <>
              <a
                href="/#demo"
                className="btn-ghost text-xs px-5 py-2.5 rounded-sm"
              >
                View Demo
              </a>
              <Link
                to="/app"
                className="btn-orange text-xs px-5 py-2.5 rounded-sm"
              >
                Launch App
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden flex flex-col gap-1.5 p-2"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span
            className={`block w-6 h-0.5 bg-white transition-all ${menuOpen ? "rotate-45 translate-y-2" : ""}`}
          />
          <span
            className={`block w-6 h-0.5 bg-white transition-all ${menuOpen ? "opacity-0" : ""}`}
          />
          <span
            className={`block w-6 h-0.5 bg-white transition-all ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`}
          />
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-black/95 border-t border-[rgba(255,85,0,0.12)] px-6 py-6 flex flex-col gap-5">
          {!isApp &&
            NAV_LINKS.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="font-heading text-base text-[#aaa] hover:text-white"
              >
                {label}
              </a>
            ))}
          <Link
            to={isApp ? "/" : "/app"}
            onClick={() => setMenuOpen(false)}
            className="btn-orange text-sm px-5 py-3 rounded-sm text-center mt-2"
          >
            {isApp ? "← Back to Home" : "Launch App"}
          </Link>
        </div>
      )}
    </header>
  );
}
