import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  History,
  Layers,
  Paintbrush,
  Users,
  Search,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { getToken } from "@/lib/auth";
import "./LandingPage.css";

const WORDS = ["research", "campaigns", "ideas", "knowledge", "writing"];

function useTypewriter(
  words: string[],
  { typingSpeed = 75, deletingSpeed = 42, pause = 1700 } = {}
) {
  const [displayed, setDisplayed] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "deleting">("typing");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const word = words[wordIdx];
    if (phase === "typing") {
      if (displayed.length < word.length) {
        t.current = setTimeout(
          () => setDisplayed(word.slice(0, displayed.length + 1)),
          typingSpeed
        );
      } else {
        t.current = setTimeout(() => setPhase("deleting"), pause);
      }
    } else {
      if (displayed.length > 0) {
        t.current = setTimeout(
          () => setDisplayed(displayed.slice(0, -1)),
          deletingSpeed
        );
      } else {
        setWordIdx((i) => (i + 1) % words.length);
        setPhase("typing");
      }
    }
    return () => { if (t.current) clearTimeout(t.current); };
  }, [displayed, phase, wordIdx, words, typingSpeed, deletingSpeed, pause]);

  return displayed;
}

const LOGO_PATHS = [
  {
    transform: "matrix(1,0,0,1,0,449.94983)",
    d: "M2449.091,2323.228L2520.837,2323.228L2645.565,2168.925L2756.693,2323.228L2837.008,2323.455L2695.235,2119.255L2836.52,1921.654L2757.047,1921.654L2645.669,2066.273L2527.46,1921.677L2455.713,1921.654L2591.479,2118.898L2449.091,2323.228Z",
  },
  {
    transform: "matrix(1,0,0,1,-3.368488,462.685578)",
    d: "M2338.686,2198.024L2409.052,2198.024C2409.052,2198.024 2394.219,2326.777 2236.586,2330.478C2031.259,2335.299 2031.005,2122.138 2031.005,2122.138C2031.005,2122.138 2008.563,1935.69 2229.687,1909.659C2302.258,1901.116 2360.068,1955.854 2370.379,1965.82C2421.132,2014.874 2425.157,2144.912 2425.157,2144.912L2107.266,2144.912C2107.266,2144.912 2105.853,2261.392 2226.652,2264.218C2347.45,2267.043 2338.686,2198.024 2338.686,2198.024ZM2104.777,2083.837L2352.873,2083.837C2352.873,2083.837 2350.048,1975.33 2232.499,1973.635C2114.95,1971.939 2104.777,2083.837 2104.777,2083.837Z",
  },
  {
    transform: "matrix(1,0,0,1,463.504217,459.278706)",
    d: "M1196.207,2090.042L1196.207,2321.213L1130.925,2321.213L1130.863,1931.037L1196.207,1931.037L1196.207,1988.007C1196.207,1988.007 1236.973,1911.558 1334.375,1912.407C1444.502,1913.367 1505.301,2004.328 1500.752,2056.264L1500.752,2321.213L1437.908,2321.213L1437.908,2089.269C1437.908,2089.269 1430.223,1976.824 1319.907,1977.145C1209.592,1977.466 1196.207,2090.042 1196.207,2090.042Z",
  },
  {
    transform: "matrix(1,0,0,1,-2.694791,459.203466)",
    d: "M1196.207,2090.042L1196.207,2321.213L1130.925,2321.213L1130.863,1931.037L1196.207,1931.037L1196.207,1988.007C1196.207,1988.007 1236.973,1911.558 1334.375,1912.407C1444.502,1913.367 1504.882,2004.328 1500.333,2056.264L1500.752,2321.213L1437.908,2321.213L1437.908,2089.269C1437.908,2089.269 1430.223,1976.824 1319.907,1977.145C1209.592,1977.466 1196.207,2090.042 1196.207,2090.042Z",
  },
  {
    transform: "matrix(1,0,0,1,-0.867342,459.196446)",
    d: "M974.495,1974.073L974.495,1928.835L1035.78,1928.693L1036.232,2320.759L974.495,2321.211L974.495,2265.769C968.742,2263.974 931.051,2341.441 804.028,2335.607C727.888,2332.11 604.613,2265.542 612.697,2109.244C620.782,1952.946 742.047,1909.829 828.281,1912.524C914.514,1915.219 974.495,1974.073 974.495,1974.073ZM824.05,1974.073C741.018,1974.073 673.606,2041.485 673.606,2124.518C673.606,2207.55 741.018,2274.962 824.05,2274.962C907.083,2274.962 974.495,2207.55 974.495,2124.518C974.495,2041.485 907.083,1974.073 824.05,1974.073Z",
  },
];

function AnnexLogo({ fill = "#e8e4de", height = 16 }: { fill?: string; height?: number }) {
  return (
    <svg
      height={height}
      viewBox="0 0 2226 424"
      xmlns="http://www.w3.org/2000/svg"
      style={{ fill, display: "block" }}
    >
      <g transform="matrix(1,0,0,1,-611.45151,-2371.443353)">
        {LOGO_PATHS.map((p) => (
          <g key={p.transform} transform={p.transform}>
            <path d={p.d} />
          </g>
        ))}
      </g>
    </svg>
  );
}

type TabKey = "api-reference.md" | "authentication.md" | "getting-started.md" | "dnd-campaign.md";

const TABS: Record<TabKey, {
  h: string;
  p: string;
  code: { c: string; t: string }[];
  lines: number[];
  badges: string[];
}> = {
  "api-reference.md": {
    h: "API Reference",
    p: "Programmatically create, read, update and delete docs in your Annex workspace using the REST API.",
    code: [
      { c: "#555", t: "BASE_URL = https://api.annex.app/v1" },
      { c: "#444", t: "Content-Type: application/json" },
    ],
    lines: [88, 72, 80, 65],
    badges: ["REST", "v1", "docs"],
  },
  "authentication.md": {
    h: "Authentication",
    p: "All requests require a bearer token in the Authorization header. Tokens are generated from workspace settings.",
    code: [
      { c: "#555", t: "POST /v1/auth/token" },
      { c: "#4a4a4a", t: "Authorization: Bearer <YOUR_TOKEN>" },
      { c: "#3a3a3a", t: '→  { "token": "ak_...", "expires": 3600 }' },
    ],
    lines: [82, 68, 74],
    badges: ["OAuth2", "bearer", "tokens"],
  },
  "getting-started.md": {
    h: "Getting Started",
    p: "Create your first workspace, invite collaborators, and publish your first doc in under five minutes.",
    code: [
      { c: "#555", t: "1. Create workspace" },
      { c: "#444", t: "2. Add your first page" },
    ],
    lines: [92, 78, 65, 74],
    badges: ["quickstart", "setup"],
  },
  "dnd-campaign.md": {
    h: "The Curse of Thornwall Keep",
    p: "Session 4 — the party arrives at Ironhaven and discovers the cult's true motives...",
    code: [
      { c: "#555", t: "Location: Ironhaven, Dusk Quarter" },
      { c: "#444", t: "Party level: 6  ·  Players: 4" },
    ],
    lines: [88, 70, 60, 80],
    badges: ["combat", "session-4", "lore"],
  },
};

const TAB_ORDER: TabKey[] = [
  "api-reference.md",
  "authentication.md",
  "getting-started.md",
  "dnd-campaign.md",
];

function EditorMockup() {
  const [active, setActive] = useState<TabKey>("api-reference.md");
  const tab = TABS[active];
  return (
    <div className="l-editor">
      <div className="l-editor-titlebar">
        <div className="l-editor-dots">
          <div className="l-editor-dot" />
          <div className="l-editor-dot" />
          <div className="l-editor-dot" />
        </div>
        <div className="l-editor-tabs">
          {TAB_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => setActive(k)}
              className={`l-editor-tab ${active === k ? "l-editor-tab-active" : "l-editor-tab-inactive"}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      <div className="l-editor-body">
        <div className="l-editor-h">{tab.h}</div>
        <div className="l-editor-p">{tab.p}</div>
        {tab.lines.slice(0, 2).map((w, i) => (
          <div key={i} className="l-editor-line" style={{ width: `${w}%` }} />
        ))}
        <div className="l-editor-code">
          {tab.code.map((l, i) => (
            <span key={i} style={{ color: l.c }}>{l.t}</span>
          ))}
        </div>
        {tab.lines.slice(2).map((w, i) => (
          <div key={i} className="l-editor-line" style={{ width: `${w}%` }} />
        ))}
        <div>
          {tab.badges.map((b) => (
            <span key={b} className="l-editor-badge">{b}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

const FEATURES: {
  Icon: LucideIcon;
  title: string;
  desc: string;
  soon?: boolean;
  link?: string;
}[] = [
  { Icon: History, title: "Version History", desc: "Every edit is recorded. Roll back, branch off, compare — nothing is ever lost." },
  { Icon: Layers, title: "Flexible Structure", desc: "Nested pages, tags, cross-links. Build any hierarchy that fits your content." },
  {
    Icon: Paintbrush,
    title: "Rich Media",
    desc: "Embed images, tables, code blocks, and callouts in any doc.",
    link: "https://docs.cubityfir.st/s/help/a0ea410e-95ff-455b-a495-cdf00ea5a890",
  },
  { Icon: Users, title: "Live Collaboration", desc: "Work together in real time. See who's editing, leave inline comments.", soon: true },
  { Icon: Search, title: "Fast Search", desc: "Full-text search across every page, heading, and tag in your workspace.", soon: true },
  { Icon: Globe, title: "Publish Anywhere", desc: "Share a private link or publish a styled public site in one click." },
];

export function LandingPage() {
  const word = useTypewriter(WORDS);
  const isLoggedIn = !!getToken();

  return (
    <div className="landing">
      {/* NAV */}
      <nav className="l-nav">
        <div className="l-nav-inner">
          <AnnexLogo height={21} />
          <div className="l-nav-links">
            <a className="l-nav-link" href="#features">features</a>
            <a className="l-nav-link" href="#pricing">pricing</a>
            {!isLoggedIn && <Link className="l-nav-link" to="/login">login</Link>}
            {isLoggedIn
              ? <Link className="l-nav-cta" to="/dashboard">go to dashboard</Link>
              : <Link className="l-nav-cta" to="/register">get started</Link>}
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="l-hero">
        <div className="l-hero-inner">
          <div className="l-hero-copy">
            <div className="l-hero-pre">an annex for your mind</div>
            <div className="l-hero-headline">A place to keep</div>
            <div className="l-hero-headline-b">
              your&nbsp;<span>{word}</span><span className="l-tw-cursor">&nbsp;</span>
            </div>
            <p className="l-hero-sub">
              Annex is the flexible writing platform for any kind of structured thought,
              from technical specs to tabletop campaigns.
            </p>
            <div className="l-hero-ctas">
              <Link className="l-btn-primary" to="/register">Create your Annex →</Link>
              <a
                className="l-btn-ghost"
                href="https://docs.cubityfir.st/s/help/"
                target="_blank"
                rel="noopener noreferrer"
              >
                See a demo
              </a>
            </div>
          </div>
          <EditorMockup />
        </div>
      </section>

      {/* FEATURES */}
      <hr className="l-section-divider" />
      <section id="features" className="l-features">
        <div className="site-wrap">
          <div className="l-features-label">What it does</div>
          <div className="l-features-grid">
            {FEATURES.map((f) => {
              const inner = (
                <>
                  <div className="l-feature-icon">
                    <f.Icon size={21} />
                  </div>
                  <div className="l-feature-title">
                    {f.title}
                    {f.soon && <span className="l-feature-soon">soon</span>}
                  </div>
                  <div className="l-feature-desc">{f.desc}</div>
                </>
              );
              return f.link ? (
                <a key={f.title} className="l-feature-card" href={f.link}>
                  {inner}
                </a>
              ) : (
                <div key={f.title} className="l-feature-card">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA BAND */}
      <section className="l-cta-band">
        <div className="site-wrap">
          <div className="l-cta-band-headline">
            Ready to build your <b>Annex?</b>
          </div>
          <Link className="l-btn-primary" to="/register">Create your Annex →</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="l-footer">
        <div className="l-footer-inner">
          <AnnexLogo height={18} fill="#383430" />
          <div className="l-footer-links">
            {["Docs", "GitHub", "Privacy", "Terms"].map((l) => (
              <a key={l} className="l-footer-link" href="#">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
