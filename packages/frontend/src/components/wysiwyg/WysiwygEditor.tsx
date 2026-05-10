import { useCallback, useEffect, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { ChangeSet, EditorState } from "@codemirror/state";
import { defaultKeymap, historyKeymap, history, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Wikilink } from "./lezer/wikilinkExtension";
import { Comment as MdCommentExt } from "./lezer/commentExtension";
import { calloutContinueOnEnter, calloutBreakOnShiftEnter } from "./commands/calloutEnter";
import { tableContinueOnEnter } from "./commands/tableEnter";
import * as Y from "yjs";
import { yCollab } from "y-codemirror.next";
import { Awareness } from "y-protocols/awareness";
import { userColor, userColorLight } from "@/lib/userColor";
import { CollabProvider } from "@/lib/collabProvider";
import { ctxCompartment, modeCompartment, modeExtension, ctxExtension, buildCtxForMode, type WysiwygMode } from "./modes";
import { defaultRendererCtx, type RendererCtx } from "./context/RendererContext";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bold, ClipboardPaste, Copy, Italic, Link as LinkIcon, List, ListChecks, ListOrdered, Pilcrow, Scissors, Type, Underline } from "lucide-react";
import "./styles.css";

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
  },
  ".cm-scroller": {
    overflow: "auto",
    height: "100%",
    padding: "16px",
    boxSizing: "border-box",
  },
  ".cm-content": {
    padding: "0 0 22.75px 0",
    caretColor: "currentColor",
  },
  ".cm-line": { padding: "0" },
  ".cm-focused": { outline: "none" },
  ".cm-editor": { height: "100%" },
});

interface CollabUser {
  id: string;
  name: string;
  personalPlan?: "free" | "ink";
  personalPlanStyle?: string | null;
  personalPresenceColor?: string | null;
}

interface Props {
  mode: WysiwygMode;
  value: string;
  onChange?: (next: string) => void;
  onSave?: () => void;
  autoFocus?: boolean;
  collab?: { docId: string; user: CollabUser };
  onAwarenessChange?: (editors: { userId: string; name: string; color: string; personalPlan?: "free" | "ink"; personalPlanStyle?: string | null }[]) => void;
  // Terminal signal from collab server — reconnecting won't help (doc size cap exceeded
  // server-side, or our last frame was too big and local state has diverged). The provider
  // stops reconnecting; the parent should drop out of collab mode.
  onCollabFatal?: (reason: string) => void;
  rendererCtx?: RendererCtx;
  onPasteImage?: (file: File) => Promise<{ url: string; alt: string }>;
}

function applyMarkerCm(view: EditorView, marker: string) {
  const sel = view.state.selection.main;
  const selected = view.state.sliceDoc(sel.from, sel.to);
  const ml = marker.length;

  const before = sel.from >= ml ? view.state.sliceDoc(sel.from - ml, sel.from) : "";
  const after = view.state.sliceDoc(sel.to, sel.to + ml);

  const exactWrap = (s: string) => {
    if (s.length < ml * 2 + 1 || !s.startsWith(marker) || !s.endsWith(marker)) return false;
    if (marker === "*") return s[ml] !== "*" && s[s.length - ml - 1] !== "*";
    return true;
  };

  const outerMatch =
    before === marker &&
    after === marker &&
    (marker !== "*" || (
      view.state.sliceDoc(sel.from - ml - 1, sel.from - ml) !== "*" &&
      view.state.sliceDoc(sel.to + ml, sel.to + ml + 1) !== "*"
    ));

  if (outerMatch) {
    view.dispatch({
      changes: [
        { from: sel.from - ml, to: sel.from, insert: "" },
        { from: sel.to, to: sel.to + ml, insert: "" },
      ],
      selection: { anchor: sel.from - ml, head: sel.to - ml },
    });
    return;
  }

  if (exactWrap(selected)) {
    const inner = selected.slice(ml, selected.length - ml);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: inner },
      selection: { anchor: sel.from, head: sel.from + inner.length },
    });
    return;
  }

  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: marker + selected + marker },
    selection: { anchor: sel.from + ml, head: sel.to + ml },
  });
}

type ListKind = "bullet" | "numbered" | "task";
const ANY_LIST_PREFIX = /^(\s*)(?:- \[[ xX]\] |- |\d+\. )/;

function applyLinePrefixCm(view: EditorView, kind: ListKind) {
  const sel = view.state.selection.main;
  const startLine = view.state.doc.lineAt(sel.from);
  const endLine = view.state.doc.lineAt(sel.to);

  const lines: { from: number; text: string; existing: RegExpMatchArray | null }[] = [];
  for (let n = startLine.number; n <= endLine.number; n++) {
    const line = view.state.doc.line(n);
    lines.push({ from: line.from, text: line.text, existing: line.text.match(ANY_LIST_PREFIX) });
  }

  const isThisKind = (m: RegExpMatchArray | null) => {
    if (!m) return false;
    const rest = m[0].slice(m[1].length);
    if (kind === "bullet") return rest === "- ";
    if (kind === "task") return /^- \[[ xX]\] $/.test(rest);
    return /^\d+\. $/.test(rest);
  };
  const allThisKind = lines.length > 0 && lines.every(l => isThisKind(l.existing));

  const newPrefix = (i: number, indent: string): string => {
    if (kind === "bullet") return `${indent}- `;
    if (kind === "task") return `${indent}- [ ] `;
    return `${indent}${i + 1}. `;
  };

  const changes = lines.map((l, i) => {
    const indent = l.existing?.[1] ?? "";
    const existingLen = l.existing?.[0].length ?? indent.length;
    if (allThisKind) {
      return { from: l.from + indent.length, to: l.from + existingLen, insert: "" };
    }
    return { from: l.from, to: l.from + existingLen, insert: newPrefix(i, indent) };
  });

  const changeSet = ChangeSet.of(changes, view.state.doc.length);
  view.dispatch({
    changes: changeSet,
    selection: {
      anchor: changeSet.mapPos(sel.anchor, 1),
      head: changeSet.mapPos(sel.head, 1),
    },
  });
}

export function WysiwygEditor({
  mode,
  value,
  onChange,
  onSave,
  autoFocus = false,
  collab,
  onAwarenessChange,
  onCollabFatal,
  rendererCtx,
  onPasteImage,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastExternalValue = useRef(value);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onAwarenessChangeRef = useRef(onAwarenessChange);
  onAwarenessChangeRef.current = onAwarenessChange;
  const onCollabFatalRef = useRef(onCollabFatal);
  onCollabFatalRef.current = onCollabFatal;
  const onPasteImageRef = useRef(onPasteImage);
  onPasteImageRef.current = onPasteImage;

  const initialValueRef = useRef(value);
  const collabRef = useRef(collab);
  const initialModeRef = useRef(mode);
  const initialCtxRef = useRef(rendererCtx ?? defaultRendererCtx);

  // Mount once
  useEffect(() => {
    if (!containerRef.current) return;

    let ydoc: Y.Doc | null = null;
    let awareness: Awareness | null = null;
    let provider: CollabProvider | null = null;
    const collabOpts = collabRef.current;
    const initialMode = initialModeRef.current;
    const initialCtx = buildCtxForMode(initialCtxRef.current, initialMode);

    // Yjs collab setup must happen BEFORE building the extensions array so we
    // can insert yCollab ahead of the decoration plugin. Otherwise our
    // EditorView.decorations provider runs before yCollab's setup, which can
    // misorder remote-cursor decorations relative to our content decorations.
    const yjsExtensions: ReturnType<typeof yCollab>[] = [];
    if (collabOpts) {
      ydoc = new Y.Doc();
      const yText = ydoc.getText("content");

      const initialValue = initialValueRef.current;
      if (initialValue.length > 0) {
        ydoc.transact(() => { yText.insert(0, initialValue); });
      }

      awareness = new Awareness(ydoc);
      // Ink supporters can override the deterministic per-user colour. We
      // only apply it for the foreground colour — the soft "background"
      // colour used for selection highlights stays derived so it always
      // pairs cleanly with the foreground regardless of what hex they
      // picked.
      const overrideColor = collabOpts.user.personalPlan === "ink" ? collabOpts.user.personalPresenceColor ?? null : null;
      const color = overrideColor ?? userColor(collabOpts.user.id);
      const colorLight = userColorLight(collabOpts.user.id);
      awareness.setLocalStateField("user", {
        id: collabOpts.user.id,
        name: collabOpts.user.name,
        color,
        colorLight,
        personalPlan: collabOpts.user.personalPlan ?? "free",
        personalPlanStyle: collabOpts.user.personalPlanStyle ?? null,
      });

      yText.observe(() => {
        const next = yText.toString();
        lastExternalValue.current = next;
        onChangeRef.current?.(next);
      });

      awareness.on("change", () => {
        if (!onAwarenessChangeRef.current) return;
        const states = awareness!.getStates();
        const editors: { userId: string; name: string; color: string; personalPlan?: "free" | "ink"; personalPlanStyle?: string | null }[] = [];
        states.forEach((state, clientId) => {
          if (clientId === ydoc!.clientID) return;
          if (state?.user) {
            editors.push({
              userId: state.user.id ?? String(clientId),
              name: state.user.name ?? "Unknown",
              color: state.user.color ?? "#888",
              personalPlan: state.user.personalPlan === "ink" ? "ink" : "free",
              personalPlanStyle: typeof state.user.personalPlanStyle === "string" ? state.user.personalPlanStyle : null,
            });
          }
        });
        onAwarenessChangeRef.current(editors);
      });

      yjsExtensions.push(yCollab(yText, awareness));

      provider = new CollabProvider(ydoc, awareness, collabOpts.docId, {
        onFatal: (reason) => onCollabFatalRef.current?.(reason),
      });
    }

    const extensions = [
      history(),
      markdown({ base: markdownLanguage, extensions: [Wikilink, MdCommentExt] }),
      editorTheme,
      EditorView.lineWrapping,
      keymap.of([
        {
          key: "Mod-s",
          run: () => { onSaveRef.current?.(); return true; },
          preventDefault: true,
        },
        {
          key: "Mod-b",
          run: (view) => { applyMarkerCm(view, "**"); return true; },
          preventDefault: true,
        },
        {
          key: "Mod-i",
          run: (view) => { applyMarkerCm(view, "*"); return true; },
          preventDefault: true,
        },
        {
          key: "Mod-u",
          run: (view) => { applyMarkerCm(view, "__"); return true; },
          preventDefault: true,
        },
        // Context-aware Enter handling. Each command returns false when not
        // applicable so the next handler (or the default) gets a turn.
        { key: "Enter", run: tableContinueOnEnter },
        { key: "Enter", run: calloutContinueOnEnter },
        { key: "Shift-Enter", run: calloutBreakOnShiftEnter },
        indentWithTab,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      ...yjsExtensions,
      EditorView.domEventHandlers({
        paste(event, view) {
          if (view.state.readOnly) return false;
          const handler = onPasteImageRef.current;
          if (!handler) return false;
          const items = event.clipboardData?.items;
          if (!items) return false;
          const imageFiles: File[] = [];
          for (const item of items) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
              const f = item.getAsFile();
              if (f) imageFiles.push(f);
            }
          }
          if (imageFiles.length === 0) return false;
          event.preventDefault();
          const pasteSel = view.state.selection.main;
          (async () => {
            const inserts: string[] = [];
            for (const file of imageFiles) {
              try {
                const { url, alt } = await handler(file);
                inserts.push(`![${alt}](${url})`);
              } catch { /* parent surfaces error toast */ }
            }
            if (inserts.length === 0) return;
            const text = inserts.join("\n");
            view.dispatch({
              changes: { from: pasteSel.from, to: pasteSel.to, insert: text },
              selection: { anchor: pasteSel.from + text.length },
            });
          })();
          return true;
        },
      }),
      ctxCompartment.of(ctxExtension(initialCtx)),
      modeCompartment.of(modeExtension(initialMode)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !collabOpts) {
          const next = update.state.doc.toString();
          lastExternalValue.current = next;
          onChangeRef.current?.(next);
        }
      }),
    ];

    const state = EditorState.create({
      doc: collabOpts ? (ydoc!.getText("content").toString() || initialValueRef.current) : value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;
    lastExternalValue.current = value;

    if (autoFocus) view.focus();

    return () => {
      provider?.destroy();
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconfigure mode without remount
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const ctx = buildCtxForMode(rendererCtx ?? defaultRendererCtx, mode);
    view.dispatch({
      effects: [
        modeCompartment.reconfigure(modeExtension(mode)),
        ctxCompartment.reconfigure(ctxExtension(ctx)),
      ],
    });
  }, [mode, rendererCtx]);

  // Sync external value (non-collab mode only)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || collabRef.current) return;
    if (value === lastExternalValue.current) return;
    lastExternalValue.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  const [hasSelection, setHasSelection] = useState(false);

  const refreshSelection = useCallback(() => {
    const view = viewRef.current;
    if (!view) { setHasSelection(false); return; }
    setHasSelection(!view.state.selection.main.empty);
  }, []);

  const handleCut = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    if (sel.empty) return;
    const text = view.state.sliceDoc(sel.from, sel.to);
    try { await navigator.clipboard.writeText(text); } catch { return; }
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: "" },
      selection: { anchor: sel.from },
    });
    view.focus();
  }, []);

  const handleCopy = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    if (sel.empty) return;
    const text = view.state.sliceDoc(sel.from, sel.to);
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    view.focus();
  }, []);

  const handlePaste = useCallback(async () => {
    const view = viewRef.current;
    if (!view) return;
    let text = "";
    try { text = await navigator.clipboard.readText(); } catch { return; }
    if (!text) return;
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection: { anchor: sel.from + text.length },
    });
    view.focus();
  }, []);

  const handleFormat = useCallback((marker: "**" | "*" | "__") => {
    const view = viewRef.current;
    if (!view) return;
    applyMarkerCm(view, marker);
    view.focus();
  }, []);

  const handleList = useCallback((kind: ListKind) => {
    const view = viewRef.current;
    if (!view) return;
    applyLinePrefixCm(view, kind);
    view.focus();
  }, []);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const linkRangeRef = useRef<{ from: number; to: number }>({ from: 0, to: 0 });

  const handleOpenLinkDialog = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const selected = view.state.sliceDoc(sel.from, sel.to);
    linkRangeRef.current = { from: sel.from, to: sel.to };
    setLinkText(selected);
    setLinkUrl("");
    setLinkDialogOpen(true);
  }, []);

  const handleSubmitLink = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const view = viewRef.current;
    if (!view) return;
    const url = linkUrl.trim();
    if (!url) return;
    const text = linkText.trim() || url;
    const insert = `[${text}](${url})`;
    const { from, to } = linkRangeRef.current;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
    setLinkDialogOpen(false);
    view.focus();
  }, [linkText, linkUrl]);

  // Reading mode flows inline (height: auto, no scroll). Editing/raw mode
  // fills its positioned parent (absolute inset-0).
  const layoutClass = mode === "reading"
    ? "cm-wysiwyg cm-wysiwyg--reading"
    : "cm-wysiwyg absolute inset-0 bg-background text-foreground";

  const containerEl = (
    <div
      ref={containerRef}
      className={layoutClass}
      spellCheck={false}
    />
  );

  if (mode === "reading") return containerEl;

  return (
    <>
    <ContextMenu onOpenChange={(open) => { if (open) refreshSelection(); }}>
      <ContextMenuTrigger asChild>{containerEl}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem disabled={!hasSelection} onSelect={handleCut}>
          <Scissors />
          Cut
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasSelection} onSelect={handleCopy}>
          <Copy />
          Copy
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={handlePaste}>
          <ClipboardPaste />
          Paste
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleOpenLinkDialog}>
          <LinkIcon />
          Create link…
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger
            disabled={!hasSelection}
            className="gap-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
          >
            <Type />
            Format
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuItem onSelect={() => handleFormat("**")}>
              <Bold />
              Bold
              <ContextMenuShortcut>Ctrl+B</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => handleFormat("*")}>
              <Italic />
              Italic
              <ContextMenuShortcut>Ctrl+I</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => handleFormat("__")}>
              <Underline />
              Underline
              <ContextMenuShortcut>Ctrl+U</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2">
            <Pilcrow />
            Paragraph
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuItem onSelect={() => handleList("bullet")}>
              <List />
              Bullet list
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => handleList("numbered")}>
              <ListOrdered />
              Numbered list
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => handleList("task")}>
              <ListChecks />
              Task list
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
      </ContextMenuContent>
    </ContextMenu>
    <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmitLink} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link-text">Text</Label>
            <Input
              id="link-text"
              placeholder="Link text"
              value={linkText}
              onChange={e => setLinkText(e.target.value)}
              autoFocus={linkText.length === 0}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              type="url"
              placeholder="https://example.com"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              autoFocus={linkText.length > 0}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!linkUrl.trim()}>Insert</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
