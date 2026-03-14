// Initialises the Shiki highlighter once at module load.
// codeToHtml() is synchronous after the highlighter is created, so after
// the first async init, all subsequent code blocks highlight with no delay.

import { createHighlighter, type Highlighter } from "shiki";

let _highlighter: Highlighter | null = null;

export const highlighterReady: Promise<Highlighter> = createHighlighter({
  themes: ["github-dark-dimmed"],
  langs: [
    "typescript", "tsx", "javascript", "jsx",
    "python", "rust", "go", "java", "c", "cpp", "csharp",
    "bash", "sh", "powershell",
    "json", "yaml", "toml",
    "html", "css", "scss",
    "sql", "graphql",
    "markdown", "mdx",
    "diff", "text",
  ],
}).then((h) => {
  _highlighter = h;
  return h;
});

export function getHighlighter(): Highlighter | null {
  return _highlighter;
}
