import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { getHighlighter, highlighterReady } from "@/lib/shiki";
import { Button } from "@/components/ui/button";
import { DiceRoll } from "@/components/DiceRoll";

const THEME = "github-dark-dimmed";

function highlight(code: string, lang: string): string | null {
  const h = getHighlighter();
  if (!h) return null;
  try {
    return h.codeToHtml(code, { lang, theme: THEME });
  } catch {
    // Unknown language — fall back to plain text
    return h.codeToHtml(code, { lang: "text", theme: THEME });
  }
}

interface CodeBlockProps {
  lang: string;
  code: string;
}

/** Highlighted fenced code block using Shiki (github-dark-dimmed theme). */
export function CodeBlock({ lang, code }: CodeBlockProps) {
  const [html, setHtml] = useState<string | null>(() => highlight(code, lang));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // If highlighter wasn't ready on first render, wait for it then re-render.
    if (html !== null) return;
    highlighterReady.then(() => setHtml(highlight(code, lang)));
  }, [code, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const copyButton = (
    <Button
      size="icon"
      variant="ghost"
      onClick={copy}
      className="pdf-print-hide absolute top-2 right-2 h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-white/10"
      aria-label="Copy code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );

  if (html) {
    return (
      <div className="not-prose relative my-4 rounded-md text-sm [&>pre]:overflow-x-auto [&>pre]:p-4">
        {/* Shiki escapes all user code content — safe to set innerHTML */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
        {copyButton}
      </div>
    );
  }

  // Plain fallback shown only on the very first page load before Shiki is ready.
  return (
    <div className="not-prose relative my-4">
      <pre className="overflow-x-auto rounded-md bg-[#22272e] p-4 text-sm text-[#adbac7]">
        <code>{code}</code>
      </pre>
      {copyButton}
    </div>
  );
}

/**
 * Drop-in replacement for react-markdown's `code` component.
 * Renders fenced code blocks with Shiki and inline code as-is.
 */
export function MarkdownCode({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"code"> & { node?: unknown }) {
  const match = /language-(\w+)/.exec(className ?? "");

  if (match) {
    // Fenced code block
    return <CodeBlock lang={match[1]} code={String(children).replace(/\n$/, "")} />;
  }

  // Inline dice roller: `dice: 3d6+4`
  if (typeof children === "string" && children.startsWith("dice:")) {
    return <DiceRoll notation={children.slice(5).trim()} />;
  }

  // Inline code
  return (
    <code
      className="rounded bg-zinc-700/50 px-1 py-0.5 text-[0.875em] text-zinc-200"
      {...props}
    >
      {children as ReactNode}
    </code>
  );
}
