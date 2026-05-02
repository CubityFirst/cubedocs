import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getToken } from "@/lib/auth";

const WORDS = ["research", "campaigns", "ideas", "knowledge", "writing"];

const FEATURES = [
  {
    title: "Version History",
    desc: "Every edit is recorded. Roll back, branch off, compare — nothing is ever lost.",
  },
  {
    title: "Flexible Structure",
    desc: "Nested pages, tags, cross-links. Build any hierarchy that fits your content.",
  },
  {
    title: "Rich Media",
    desc: "Embed images, tables, code blocks, and callouts in any doc.",
  },
  {
    title: "Live Collaboration",
    desc: "Work together in real time. See who's editing, leave comments inline.",
    comingSoon: true,
  },
  {
    title: "Fast Search",
    desc: "Full-text search across every page, heading, and tag in your workspace.",
    comingSoon: true,
  },
  {
    title: "Publish Anywhere",
    desc: "Share a private link or publish a fully styled public site in one click.",
  },
];

function useTypewriter(
  words: string[],
  { typingSpeed = 80, deletingSpeed = 45, pause = 1600 } = {}
) {
  const [displayed, setDisplayed] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pausing" | "deleting">(
    "typing"
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const word = words[wordIdx];
    if (phase === "typing") {
      if (displayed.length < word.length) {
        timeoutRef.current = setTimeout(
          () => setDisplayed(word.slice(0, displayed.length + 1)),
          typingSpeed
        );
      } else {
        timeoutRef.current = setTimeout(() => setPhase("pausing"), pause);
      }
    } else if (phase === "pausing") {
      setPhase("deleting");
    } else if (phase === "deleting") {
      if (displayed.length > 0) {
        timeoutRef.current = setTimeout(
          () => setDisplayed(displayed.slice(0, -1)),
          deletingSpeed
        );
      } else {
        setWordIdx((i) => (i + 1) % words.length);
        setPhase("typing");
      }
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
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

function AnnexLogo({ fill = "#f0ede8", height = 24 }: { fill?: string; height?: number }) {
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

function EditorMockup() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 810,
        background: "#1c1c1c",
        border: "1px solid #2e2e2e",
        borderRadius: 6,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "12px 18px",
          borderBottom: "1px solid #2a2a2a",
          background: "#181818",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{ width: 12, height: 12, borderRadius: "50%", background: "#444" }}
          />
        ))}
        <span
          style={{
            fontSize: 15,
            fontFamily: "'DM Mono', monospace",
            color: "#888",
            marginLeft: 12,
            padding: "3px 12px",
            borderRadius: 3,
            background: "#222",
            border: "1px solid #333",
          }}
        >
          ttrpg-campaign.md
        </span>
      </div>
      <div style={{ padding: "24px 27px" }}>
        <div
          style={{ fontSize: 23, fontWeight: 600, color: "#e0ddd8", marginBottom: 12 }}
        >
          The Curse of Thornwall Keep
        </div>
        <div
          style={{
            fontSize: 17,
            color: "#7a7a7a",
            lineHeight: 1.7,
            marginBottom: 15,
          }}
        >
          Session 4 — the party arrives at Ironhaven and discovers the cult's true
          motives...
        </div>
        {[90, 75, 60].map((w) => (
          <div
            key={w}
            style={{
              height: 12,
              borderRadius: 3,
              background: "#2e2e2e",
              marginBottom: 8,
              width: `${w}%`,
            }}
          />
        ))}
        <div
          style={{
            height: 105,
            background: "#242424",
            borderRadius: 5,
            margin: "15px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: "#555",
              fontFamily: "'DM Mono', monospace",
            }}
          >
            [ map placeholder ]
          </span>
        </div>
        {[85, 50].map((w) => (
          <div
            key={w}
            style={{
              height: 12,
              borderRadius: 3,
              background: "#2e2e2e",
              marginBottom: 8,
              width: `${w}%`,
            }}
          />
        ))}
        <div style={{ marginTop: 12 }}>
          {["combat", "session-4", "lore"].map((tag) => (
            <span
              key={tag}
              style={{
                display: "inline-block",
                fontSize: 14,
                fontFamily: "'DM Mono', monospace",
                color: "#6a6a6a",
                background: "#1c1c1c",
                border: "1px solid #353535",
                padding: "3px 11px",
                borderRadius: 3,
                marginRight: 6,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const word = useTypewriter(WORDS, { typingSpeed: 70, deletingSpeed: 40 });

  useEffect(() => {
    if (getToken()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  return (
    <div
      style={{
        background: "#111",
        height: "100vh",
        overflowY: "auto",
        fontFamily: "'DM Sans', sans-serif",
        color: "#e8e5e0",
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 48px",
          height: 78,
          borderBottom: "1px solid #222",
        }}
      >
        <AnnexLogo />
        <div style={{ display: "flex", gap: 36, alignItems: "center" }}>
          <a
            href="#features"
            style={{ fontSize: 18, color: "#666", textDecoration: "none" }}
          >
            features
          </a>
          <a
            href="#"
            style={{ fontSize: 18, color: "#666", textDecoration: "none" }}
          >
            pricing
          </a>
          <Link
            to="/login"
            style={{ fontSize: 18, color: "#666", textDecoration: "none" }}
          >
            login
          </Link>
          <Link
            to="/register"
            style={{
              fontSize: 17,
              fontWeight: 500,
              color: "#f0ede8",
              border: "1px solid #f0ede8",
              padding: "8px 21px",
              borderRadius: 3,
              textDecoration: "none",
            }}
          >
            get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          padding: "84px 90px 60px",
        }}
      >
        <div
          style={{
            fontSize: 15,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#666",
            marginBottom: 15,
            fontFamily: "'DM Mono', monospace",
          }}
        >
          an annex for your mind
        </div>
        <h1
          style={{
            fontSize: 63,
            fontWeight: 300,
            lineHeight: 1.15,
            color: "#e8e5e0",
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          A place to keep
        </h1>
        <div
          style={{
            fontSize: 63,
            fontWeight: 600,
            lineHeight: 1.15,
            color: "#e8e5e0",
            letterSpacing: "-0.02em",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "1.2em",
            marginBottom: 27,
          }}
        >
          your&nbsp;
          <span
            style={{
              display: "inline-block",
              borderRight: "4px solid #e8e5e0",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {word}
          </span>
        </div>
        <p
          style={{
            fontSize: 20,
            color: "#888",
            lineHeight: 1.6,
            maxWidth: 570,
            margin: "0 auto 36px",
            fontWeight: 300,
          }}
        >
          Annex is the flexible writing platform for any kind of structured
          thought. From tabletop campaigns to technical specs.
        </p>
        <div
          style={{
            display: "flex",
            gap: 15,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 54,
          }}
        >
          <Link
            to="/register"
            style={{
              fontSize: 18,
              fontWeight: 500,
              background: "#e8e5e0",
              color: "#111",
              padding: "14px 33px",
              borderRadius: 3,
              textDecoration: "none",
            }}
          >
            Create your Annex →
          </Link>
          <a
            href="https://docs.cubityfir.st/s/help"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 18,
              color: "#666",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              textDecorationColor: "#444",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            See a demo
          </a>
        </div>
        <EditorMockup />
      </section>

      {/* Features */}
      <section
        id="features"
        style={{ padding: "60px 60px 48px", borderTop: "1px solid #242424" }}
      >
        <div
          style={{
            fontSize: 14,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#555",
            fontFamily: "'DM Mono', monospace",
            marginBottom: 30,
          }}
        >
          What it does
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 30,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                padding: 24,
                border: "1px solid #2a2a2a",
                borderRadius: 5,
                background: "#181818",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: "#252525",
                  borderRadius: 5,
                  marginBottom: 15,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 12 12" fill="none">
                  <rect
                    x="1"
                    y="1"
                    width="10"
                    height="10"
                    rx="1.5"
                    stroke="#888"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M3 6h6M6 3v6"
                    stroke="#888"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#d4d0c8",
                  marginBottom: 8,
                }}
              >
                {f.title}
                {f.comingSoon && (
                  <span
                    style={{
                      display: "inline-block",
                      fontSize: 12,
                      fontFamily: "'DM Mono', monospace",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#555",
                      border: "1px solid #2e2e2e",
                      padding: "2px 8px",
                      borderRadius: 3,
                      marginLeft: 9,
                      verticalAlign: "middle",
                      position: "relative",
                      top: -1,
                    }}
                  >
                    soon
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 17,
                  color: "#7e7e7e",
                  lineHeight: 1.5,
                  fontWeight: 300,
                }}
              >
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #222",
          padding: "24px 60px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#0e0e0e",
        }}
      >
        <AnnexLogo fill="#555" height={18} />
        <div style={{ display: "flex", gap: 30 }}>
          {["Privacy", "Terms", "Docs", "GitHub"].map((l) => (
            <a
              key={l}
              href="#"
              style={{ fontSize: 15, color: "#555", textDecoration: "none" }}
            >
              {l}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
