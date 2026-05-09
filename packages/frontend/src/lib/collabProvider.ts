import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { getToken } from "./auth";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

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

export interface CollabProviderOptions {
  // Soft signal — server rejected one frame but the room is still usable. We keep reconnecting.
  onWarning?: (reason: string) => void;
  // Terminal signal — room is in a state where reconnecting is pointless (currently: doc size
  // cap exceeded, room frozen server-side). The provider stops trying after this fires.
  onFatal?: (reason: string) => void;
}

export class CollabProvider {
  private ws: WebSocket | null = null;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private failuresWithoutOpen = 0;
  private currentAttemptOpened = false;
  private lastCloseCode = 0;
  private lastCloseReason = "";

  constructor(
    private readonly ydoc: Y.Doc,
    private readonly awareness: Awareness,
    private readonly docId: string,
    private readonly options: CollabProviderOptions = {},
  ) {
    this.ydoc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    this.connect();
  }

  private connect() {
    if (this.destroyed) return;
    // Re-read the token on each attempt so that a refreshed login or revoked
    // session doesn't leave us pounding the server with a stale token forever.
    const token = getToken();
    if (!token) {
      this.destroyed = true;
      return;
    }
    this.currentAttemptOpened = false;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/docs/${this.docId}/collab?token=${encodeURIComponent(token)}`);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("open", this.onOpen);
    ws.addEventListener("message", this.onMessage);
    const onDisconnect = (ev: Event) => {
      ws.removeEventListener("close", onDisconnect);
      ws.removeEventListener("error", onDisconnect);
      // CloseEvent carries the server's close code/reason; an `error` event has neither.
      // The error case will be followed by a close event in normal browser behavior, but
      // if we somehow only get error we want to still reconnect, so default to 0.
      if (ev instanceof CloseEvent) {
        this.lastCloseCode = ev.code;
        this.lastCloseReason = ev.reason;
      } else {
        this.lastCloseCode = 0;
        this.lastCloseReason = "";
      }
      this.onClose();
    };
    ws.addEventListener("close", onDisconnect);
    ws.addEventListener("error", onDisconnect);
    this.ws = ws;
  }

  private send(type: number, payload: Uint8Array) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
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
    this.reconnectDelay = 1000;
    this.failuresWithoutOpen = 0;
    this.currentAttemptOpened = true;
    this.sendSyncPayload(0, Y.encodeStateVector(this.ydoc));
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
            const [numEntries] = readVarUint(payload, 0);
            if (numEntries > 0) {
              const yText = this.ydoc.getText("content");
              if (yText.length > 0) {
                this.ydoc.transact(() => { yText.delete(0, yText.length); });
              }
            }
            const diff = Y.encodeStateAsUpdate(this.ydoc, payload);
            this.sendSyncPayload(1, diff);
            break;
          }
          case 1:
          case 2: {
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

    // Terminal close codes — server is telling us reconnecting won't help.
    // 1008 (policy violation) is what the server sends when the doc size cap is exceeded
    // (the room is frozen and any reconnect immediately re-freezes on load).
    if (this.lastCloseCode === 1008) {
      this.destroyed = true;
      this.options.onFatal?.(this.lastCloseReason || "Document is read-only.");
      return;
    }

    // Soft close codes — single frame rejected but the room is still usable.
    // 1009 (message too big) means our last frame exceeded MAX_MESSAGE_BYTES on the server.
    // We let the normal reconnect flow happen so the user can keep editing.
    if (this.lastCloseCode === 1009) {
      this.options.onWarning?.(this.lastCloseReason || "Last change was too large to sync.");
    }

    // If the socket closed without ever firing `open`, the upgrade was rejected
    // (auth failure, project flag turned off, etc.) — give up after a few
    // tries instead of pounding the server every 30s and spamming Vite's WS
    // proxy with ECONNABORTED/ECONNRESET errors.
    if (!this.currentAttemptOpened) {
      this.failuresWithoutOpen++;
      if (this.failuresWithoutOpen >= 5) {
        this.destroyed = true;
        return;
      }
    }
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
