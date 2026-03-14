import { useState, useEffect, type ReactNode } from "react";
import { getHighlighter, highlighterReady } from "@/lib/shiki";

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

  useEffect(() => {
    // If highlighter wasn't ready on first render, wait for it then re-render.
    if (html !== null) return;
    highlighterReady.then(() => setHtml(highlight(code, lang)));
  }, [code, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  if (html) {
    return (
      <div
        className="not-prose my-4 overflow-x-auto rounded-md text-sm [&>pre]:p-4"
        // Shiki escapes all user code content — safe to set innerHTML
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Plain fallback shown only on the very first page load before Shiki is ready.
  return (
    <pre className="not-prose my-4 overflow-x-auto rounded-md bg-[#22272e] p-4 text-sm text-[#adbac7]">
      <code>{code}</code>
    </pre>
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
