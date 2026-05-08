import { useEffect, useRef } from "react";
import { EditorView, keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, historyKeymap, history, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { Wikilink } from "./lezer/wikilinkExtension";
import { calloutContinueOnEnter, calloutBreakOnShiftEnter } from "./commands/calloutEnter";
import { tableContinueOnEnter } from "./commands/tableEnter";
import * as Y from "yjs";
import { yCollab } from "y-codemirror.next";
import { Awareness } from "y-protocols/awareness";
import { getToken } from "@/lib/auth";
import { userColor, userColorLight } from "@/lib/userColor";
import { CollabProvider } from "@/lib/collabProvider";
import { ctxCompartment, modeCompartment, modeExtension, ctxExtension, buildCtxForMode, type WysiwygMode } from "./modes";
import type { RendererCtx } from "./context/RendererContext";
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

export interface CollabUser {
  id: string;
  name: string;
}

interface Props {
  mode: WysiwygMode;
  value: string;
  onChange?: (next: string) => void;
  onCursorLine?: (line: number) => void;
  onScrollTop?: (px: number) => void;
  onSave?: () => void;
  autoFocus?: boolean;
  collab?: { docId: string; user: CollabUser };
  onAwarenessChange?: (editors: { userId: string; name: string; color: string }[]) => void;
  rendererCtx?: RendererCtx;
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

function makeTrackerPlugin(
  onCursorLine: (line: number) => void,
) {
  return ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        if (update.selectionSet || update.docChanged) {
          const pos = update.state.selection.main.head;
          const line = update.state.doc.lineAt(pos).number - 1;
          onCursorLine(line);
        }
      }
    },
  );
}

const defaultCtx: RendererCtx = { isPublic: false, revealOnCursor: true };

export function WysiwygEditor({
  mode,
  value,
  onChange,
  onCursorLine,
  onScrollTop,
  onSave,
  autoFocus = false,
  collab,
  onAwarenessChange,
  rendererCtx,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const providerRef = useRef<CollabProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const lastExternalValue = useRef(value);

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCursorLineRef = useRef(onCursorLine);
  onCursorLineRef.current = onCursorLine;
  const onScrollTopRef = useRef(onScrollTop);
  onScrollTopRef.current = onScrollTop;
  const onAwarenessChangeRef = useRef(onAwarenessChange);
  onAwarenessChangeRef.current = onAwarenessChange;

  const initialValueRef = useRef(value);
  const collabRef = useRef(collab);
  const initialModeRef = useRef(mode);
  const initialCtxRef = useRef(rendererCtx ?? defaultCtx);

  // Mount once
  useEffect(() => {
    if (!containerRef.current) return;

    const token = getToken() ?? "";
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
      const color = userColor(collabOpts.user.id);
      const colorLight = userColorLight(collabOpts.user.id);
      awareness.setLocalStateField("user", {
        id: collabOpts.user.id,
        name: collabOpts.user.name,
        color,
        colorLight,
      });

      yText.observe(() => {
        const next = yText.toString();
        lastExternalValue.current = next;
        onChangeRef.current?.(next);
      });

      awareness.on("change", () => {
        if (!onAwarenessChangeRef.current) return;
        const states = awareness!.getStates();
        const editors: { userId: string; name: string; color: string }[] = [];
        states.forEach((state, clientId) => {
          if (clientId === ydoc!.clientID) return;
          if (state?.user) {
            editors.push({
              userId: state.user.id ?? String(clientId),
              name: state.user.name ?? "Unknown",
              color: state.user.color ?? "#888",
            });
          }
        });
        onAwarenessChangeRef.current(editors);
      });

      yjsExtensions.push(yCollab(yText, awareness));

      ydocRef.current = ydoc;
      awarenessRef.current = awareness;

      provider = new CollabProvider(ydoc, awareness, collabOpts.docId, token);
      providerRef.current = provider;
    }

    const extensions = [
      history(),
      markdown({ base: markdownLanguage, extensions: [Wikilink] }),
      editorTheme,
      EditorView.lineWrapping,
      makeTrackerPlugin((line) => onCursorLineRef.current?.(line)),
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

    const scroller = view.scrollDOM;
    const handleScroll = () => onScrollTopRef.current?.(scroller.scrollTop);
    scroller.addEventListener("scroll", handleScroll, { passive: true });

    if (autoFocus) view.focus();

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
      provider?.destroy();
      providerRef.current = null;
      ydocRef.current = null;
      awarenessRef.current = null;
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconfigure mode without remount
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const ctx = buildCtxForMode(rendererCtx ?? defaultCtx, mode);
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

  // Reading mode flows inline (height: auto, no scroll). Editing/raw mode
  // fills its positioned parent (absolute inset-0).
  const layoutClass = mode === "reading"
    ? "cm-wysiwyg cm-wysiwyg--reading"
    : "cm-wysiwyg absolute inset-0 bg-background text-foreground";

  return (
    <div
      ref={containerRef}
      className={layoutClass}
      spellCheck={false}
    />
  );
}
