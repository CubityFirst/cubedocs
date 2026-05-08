import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";

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

export class CollabProvider {
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
