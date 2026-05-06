import { useEffect, useRef, useCallback } from "react";
import { EditorView, keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, historyKeymap, history, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import * as Y from "yjs";
import { yCollab } from "y-codemirror.next";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { getToken } from "@/lib/auth";
import { userColor, userColorLight } from "@/lib/userColor";

// y-protocols message constants (match the DO)
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

// Varint encoding helpers for the y-protocols wire format
function encodeVarUint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n >>>= 7; }
  out.push(n & 0x7f);
  return out;
}

function readVarUint(buf: Uint8Array, offset: number): [number, number] {
  let num = 0, shift = 0;
  while (true) {
    const b = buf[offset++];
    num |= (b & 0x7f) << shift;
    shift += 7;
    if ((b & 0x80) === 0) break;
  }
  return [num, offset];
}


// CM6 theme that mirrors the existing textarea look
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "0.875rem",
    lineHeight: "1.625",
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
  // Remote cursor labels
  ".cm-ySelectionInfo": {
    fontSize: "11px",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    padding: "1px 4px",
    borderRadius: "3px",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
});

const LINE_HEIGHT = 22.75; // text-sm (14px) × leading-relaxed (1.625)
const PADDING_TOP = 16;    // p-4

export interface CollabUser {
  id: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onCursorLine: (line: number) => void;
  onScrollTop: (px: number) => void;
  onSave: () => void;
  autoFocus?: boolean;
  collab?: { docId: string; user: CollabUser };
  onAwarenessChange?: (editors: { userId: string; name: string; color: string }[]) => void;
}

// Minimal WebSocket provider implementing the y-websocket binary protocol
class CollabProvider {
  private ws: WebSocket | null = null;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  constructor(
    private readonly ydoc: Y.Doc,
    private readonly awareness: Awareness,
    private readonly docId: string,
    private readonly token: string,
  ) {
    this.ydoc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    this.connect();
  }

  private connect() {
    if (this.destroyed) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/docs/${this.docId}/collab?token=${encodeURIComponent(this.token)}`);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", this.onOpen);
    ws.addEventListener("message", this.onMessage);
    // Use a single once-fired handler per socket to prevent error + close both triggering reconnect
    const onDisconnect = () => {
      ws.removeEventListener("close", onDisconnect);
      ws.removeEventListener("error", onDisconnect);
      this.onClose();
    };
    ws.addEventListener("close", onDisconnect);
    ws.addEventListener("error", onDisconnect);
    this.ws = ws;
  }

  private send(type: number, payload: Uint8Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Message = [type:varint, payload:varUint8Array]
    const typeBytes = encodeVarUint(type);
    const lenBytes = encodeVarUint(payload.length);
    const msg = new Uint8Array(typeBytes.length + lenBytes.length + payload.length);
    msg.set(typeBytes, 0);
    msg.set(lenBytes, typeBytes.length);
    msg.set(payload, typeBytes.length + lenBytes.length);
    this.ws.send(msg);
  }

  private sendSyncPayload(syncType: number, payload: Uint8Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // lib0/y-protocols wire format: [MSG_SYNC][syncType][len(payload)][payload]
    // No outer length prefix — send() adds one that readSyncMessage doesn't expect.
    const typeBytes = encodeVarUint(MSG_SYNC);
    const syncTypeBytes = encodeVarUint(syncType);
    const lenBytes = encodeVarUint(payload.length);
    const msg = new Uint8Array(typeBytes.length + syncTypeBytes.length + lenBytes.length + payload.length);
    msg.set(typeBytes, 0);
    msg.set(syncTypeBytes, typeBytes.length);
    msg.set(lenBytes, typeBytes.length + syncTypeBytes.length);
    msg.set(payload, typeBytes.length + syncTypeBytes.length + lenBytes.length);
    this.ws.send(msg);
  }

  private onOpen = () => {
    this.reconnectDelay = 1000; // reset backoff on successful connect
    // Send sync step 1: our state vector so server can reply with missing updates
    this.sendSyncPayload(0, Y.encodeStateVector(this.ydoc));
    // Announce our local awareness state
    this.sendAwareness([this.ydoc.clientID]);
  };

  private sendAwareness(clientIds: number[]) {
    const states = this.awareness.getStates();
    const present = clientIds.filter(id => states.has(id));
    if (present.length === 0) return;
    const update = encodeAwarenessUpdate(this.awareness, present);
    this.send(MSG_AWARENESS, update);
  }

  private onMessage = (event: MessageEvent) => {
    const data = new Uint8Array(event.data as ArrayBuffer);
    const [msgType, offset] = readVarUint(data, 0);

    switch (msgType) {
      case MSG_SYNC: {
        const [syncType, syncOffset] = readVarUint(data, offset);
        const [payloadLen, payloadOffset] = readVarUint(data, syncOffset);
        const payload = data.slice(payloadOffset, payloadOffset + payloadLen);

        switch (syncType) {
          case 0: {
            // Server sent its state vector (step 1) — reply with our diff (step 2)
            const diff = Y.encodeStateAsUpdate(this.ydoc, payload);
            this.sendSyncPayload(1, diff);
            break;
          }
          case 1:
          case 2: {
            // Step 2 or live update — apply to local doc
            try { Y.applyUpdate(this.ydoc, payload, this.ws); } catch { /* */ }
            break;
          }
        }
        break;
      }
      case MSG_AWARENESS: {
        const [len, dataOffset] = readVarUint(data, offset);
        const update = data.slice(dataOffset, dataOffset + len);
        try { applyAwarenessUpdate(this.awareness, update, this.ws); } catch { /* */ }
        break;
      }
    }
  };

  private onClose = () => {
    if (this.destroyed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      this.connect();
    }, this.reconnectDelay);
  };

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this.ws) return;
    this.sendSyncPayload(2, update);
  };

  private onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (origin === this.ws) return;
    this.sendAwareness([...added, ...updated, ...removed]);
  };

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer != null) clearTimeout(this.reconnectTimer);
    this.ydoc.off("update", this.onDocUpdate);
    this.awareness.off("update", this.onAwarenessUpdate);
    try { this.ws?.close(1000, "unmount"); } catch { /* */ }
  }
}

// CM6 plugin to track cursor line and scroll position
function makeTrackerPlugin(
  onCursorLine: (line: number) => void,
  onScrollTop: (px: number) => void,
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

// Port of applyMarker to CM6 transactions
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

export function MarkdownEditor({
  value,
  onChange,
  onCursorLine,
  onScrollTop,
  onSave,
  autoFocus = false,
  collab,
  onAwarenessChange,
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

  useEffect(() => {
    if (!containerRef.current) return;

    const token = getToken() ?? "";
    let ydoc: Y.Doc | null = null;
    let awareness: Awareness | null = null;
    let provider: CollabProvider | null = null;
    const collabOpts = collabRef.current;

    const extensions = [
      history(),
      markdown(),
      editorTheme,
      EditorView.lineWrapping,
      makeTrackerPlugin(
        (line) => onCursorLineRef.current(line),
        (px) => onScrollTopRef.current(px),
      ),
      keymap.of([
        {
          key: "Mod-s",
          run: () => { onSaveRef.current(); return true; },
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
        indentWithTab,
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !collabOpts) {
          const next = update.state.doc.toString();
          lastExternalValue.current = next;
          onChangeRef.current(next);
        }
      }),
    ];

    if (collabOpts) {
      ydoc = new Y.Doc();
      const yText = ydoc.getText("content");

      // Seed yText immediately so the editor is never blank while connecting.
      // The DO's state takes precedence: if DO already has content, Y.applyUpdate
      // will merge and yCollab will reflect the authoritative state.
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

      // Mirror Y.Text changes to parent state (for preview pane + save button)
      yText.observe(() => {
        const next = yText.toString();
        lastExternalValue.current = next;
        onChangeRef.current(next);
      });

      // Propagate awareness changes to EditorPresence
      awareness.on("change", () => {
        if (!onAwarenessChangeRef.current) return;
        const states = awareness!.getStates();
        const editors: { userId: string; name: string; color: string }[] = [];
        states.forEach((state, clientId) => {
          if (clientId === ydoc!.clientID) return; // exclude self
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

      extensions.push(yCollab(yText, awareness));

      ydocRef.current = ydoc;
      awarenessRef.current = awareness;

      provider = new CollabProvider(ydoc, awareness, collabOpts.docId, token);
      providerRef.current = provider;
    }

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

    // Track scroll on the CM6 scroller
    const scroller = view.scrollDOM;
    const handleScroll = () => onScrollTopRef.current(scroller.scrollTop);
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
  }, []); // mount once only

  // Sync external value changes into the editor (non-collab mode only)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || collabRef.current) return;
    if (value === lastExternalValue.current) return;

    // External value changed — replace editor content
    lastExternalValue.current = value;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 bg-background text-foreground"
      spellCheck={false}
    />
  );
}
