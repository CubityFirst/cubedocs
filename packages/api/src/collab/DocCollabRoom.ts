import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import type { Env } from "../index";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

interface WsAttachment {
  userId: string;
  userName: string;
  clientId: number | null;
}

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  // wrangler dev can deserialize stored Uint8Arrays as plain objects
  if (value && typeof value === "object") {
    try { return new Uint8Array(Object.values(value as Record<string, number>)); } catch { /* */ }
  }
  return null;
}

export class DocCollabRoom implements DurableObject {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;

  private ydoc: Y.Doc | null = null;
  private awareness: awarenessProtocol.Awareness | null = null;
  private editors: Map<string, string> | null = null; // userId → userName
  private lastAlarmSetAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.ydoc) return;

    const ydoc = new Y.Doc();
    this.ydoc = ydoc;
    try {
      const raw = await this.ctx.storage.get<unknown>("ydoc");
      const stored = toUint8Array(raw);
      if (stored) Y.applyUpdate(ydoc, stored);
    } catch (err) {
      console.error("[DocCollabRoom] failed to restore ydoc from storage:", err);
    }

    this.editors = new Map();
    try {
      const stored = await this.ctx.storage.get<{ id: string; name: string }[]>("editors");
      if (stored) {
        for (const e of stored) this.editors.set(e.id, e.name);
      }
    } catch { /* */ }

    const awareness = new awarenessProtocol.Awareness(ydoc);
    // The Awareness constructor starts a 3s setInterval to expire stale clients. That timer
    // prevents WebSocket hibernation, so the DO accrues memory × wall-time billing the entire
    // session. Kill it — webSocketClose already removes awareness state on disconnect.
    clearInterval((awareness as unknown as { _checkInterval: ReturnType<typeof setInterval> })._checkInterval);
    this.awareness = awareness;

    ydoc.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const msg = encoding.toUint8Array(encoder);
      for (const ws of this.ctx.getWebSockets()) {
        if (ws !== origin) {
          try { ws.send(msg); } catch { /* socket may be closing */ }
        }
      }
    });

    // Use the captured `awareness` reference — not `this.awareness` — so that if the room is
    // torn down and re-initialised, the old interval callbacks still reference the correct
    // (now-destroyed) instance and don't accidentally encode clients against a fresh meta map.
    awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      const changedClients = [...added, ...updated, ...removed];
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients));
      const msg = encoding.toUint8Array(encoder);
      for (const ws of this.ctx.getWebSockets()) {
        if (ws !== origin) {
          try { ws.send(msg); } catch { /* socket may be closing */ }
        }
      }
    });
  }

  private teardown(): void {
    // Destroy awareness first so its setInterval is cleared and no stale update events fire
    // after this room is re-initialised with a new Y.Doc / Awareness pair.
    if (this.awareness) {
      try { this.awareness.destroy(); } catch { /* */ }
      this.awareness = null;
    }
    if (this.ydoc) {
      try { this.ydoc.destroy(); } catch { /* */ }
      this.ydoc = null;
    }
    this.editors = null;
  }

  async fetch(request: Request): Promise<Response> {
    // WebSocket upgrade must be checked first — upgrade requests are GET requests too,
    // so checking method before Upgrade header would intercept them with the wrong branch.
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request);
    }

    // Internal — returns and clears the set of users who have contributed edits
    if (request.method === "GET") {
      const stored = await this.ctx.storage.get<{ id: string; name: string }[]>("editors") ?? [];
      await this.ctx.storage.delete("editors");
      if (this.editors) this.editors.clear();
      return new Response(JSON.stringify({ editors: stored }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Internal cleanup — called when the document is deleted
    if (request.method === "DELETE") {
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.close(1001, "Document deleted"); } catch { /* */ }
      }
      try { await this.ctx.storage.deleteAll(); } catch { /* */ }
      this.teardown();
      return new Response(null, { status: 204 });
    }

    return new Response("Method not allowed", { status: 405 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const userId = request.headers.get("X-User-Id") ?? "";
    const userName = request.headers.get("X-User-Name") ?? "";
    const projectId = request.headers.get("X-Project-Id") ?? "";
    const docId = request.headers.get("X-Doc-Id") ?? "";

    try {
      const existingKey = await this.ctx.storage.get<string>("docKey");
      if (!existingKey && projectId && docId) {
        await this.ctx.storage.put("docKey", `${projectId}/${docId}`);
      }
    } catch (err) {
      console.error("[DocCollabRoom] storage error in fetch:", err);
    }

    await this.ensureLoaded();

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ userId, userName, clientId: null } satisfies WsAttachment);

    try {
      const syncEncoder = encoding.createEncoder();
      encoding.writeVarUint(syncEncoder, MSG_SYNC);
      syncProtocol.writeSyncStep1(syncEncoder, this.ydoc!);
      server.send(encoding.toUint8Array(syncEncoder));

      const awarenessStates = this.awareness!.getStates();
      if (awarenessStates.size > 0) {
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(awarenessEncoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness!, Array.from(awarenessStates.keys())));
        server.send(encoding.toUint8Array(awarenessEncoder));
      }
    } catch (err) {
      console.error("[DocCollabRoom] error sending initial sync state:", err);
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      await this.ensureLoaded();

      const data = typeof message === "string"
        ? new TextEncoder().encode(message)
        : new Uint8Array(message);

      const decoder = decoding.createDecoder(data);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case MSG_SYNC: {
          const replyEncoder = encoding.createEncoder();
          encoding.writeVarUint(replyEncoder, MSG_SYNC);
          let syncType: number;
          try {
            syncType = syncProtocol.readSyncMessage(decoder, replyEncoder, this.ydoc!, ws);
          } catch (err) {
            console.error("[DocCollabRoom] sync protocol error:", err);
            break;
          }
          if (encoding.length(replyEncoder) > 1) {
            try { ws.send(encoding.toUint8Array(replyEncoder)); } catch { /* */ }
          }
          if (syncType === 2) {
            // Throttle alarm rewrites to once every 5s. Each setAlarm is a storage write,
            // and the previous code rewrote the alarm on every keystroke. The alarm still
            // fires ~30s after the last edit (between 30s and 35s, depending on which
            // 5s bucket the last edit landed in), so persistence behavior is unchanged.
            const now = Date.now();
            if (now - this.lastAlarmSetAt > 5000) {
              this.lastAlarmSetAt = now;
              this.ctx.storage.setAlarm(now + 30_000).catch(() => { /* */ });
            }
            // Track this user as a contributor
            const att = ws.deserializeAttachment() as WsAttachment | null;
            if (att?.userId && this.editors && !this.editors.has(att.userId)) {
              this.editors.set(att.userId, att.userName);
              const list = Array.from(this.editors.entries()).map(([id, name]) => ({ id, name }));
              this.ctx.storage.put("editors", list).catch(() => { /* */ });
            }
          }
          break;
        }
        case MSG_AWARENESS: {
          const updateBytes = decoding.readVarUint8Array(decoder);

          const attachment = ws.deserializeAttachment() as WsAttachment | null;
          if (attachment?.clientId === null) {
            try {
              const d = decoding.createDecoder(updateBytes);
              const numClients = decoding.readVarUint(d);
              if (numClients > 0) {
                const clientId = decoding.readVarUint(d);
                ws.serializeAttachment({ ...attachment, clientId });
              }
            } catch { /* best-effort */ }
          }

          try {
            awarenessProtocol.applyAwarenessUpdate(this.awareness!, updateBytes, ws);
          } catch (err) {
            console.error("[DocCollabRoom] awareness update error:", err);
          }
          break;
        }
      }
    } catch (err) {
      console.error("[DocCollabRoom] webSocketMessage error:", err);
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    try {
      await this.ensureLoaded();

      const attachment = ws.deserializeAttachment() as WsAttachment | null;
      if (attachment?.clientId != null) {
        try {
          awarenessProtocol.removeAwarenessStates(this.awareness!, [attachment.clientId], ws);
        } catch { /* */ }
      }

      if (this.ctx.getWebSockets().length === 0) {
        await this.persist();
        // Schedule eviction 7 days from now; a reconnect will cancel this via the next edit alarm
        this.ctx.storage.setAlarm(Date.now() + 7 * 24 * 60 * 60 * 1000).catch(() => { /* */ });
        // Drop in-memory ydoc/awareness so the DO can be evicted instead of sitting idle
        this.teardown();
      }
    } catch (err) {
      console.error("[DocCollabRoom] webSocketClose error:", err);
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("[DocCollabRoom] webSocketError:", error);
    try { ws.close(1011, "Internal error"); } catch { /* */ }
  }

  async alarm(): Promise<void> {
    try {
      const lastActivity = await this.ctx.storage.get<number>("lastActivity") ?? 0;
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastActivity >= sevenDays) {
        // No activity for 7 days — evict the room entirely
        await this.ctx.storage.deleteAll();
        this.teardown();
      } else {
        await this.persist();
      }
    } catch (err) {
      console.error("[DocCollabRoom] alarm error:", err);
    }
  }

  private async persist(): Promise<void> {
    if (!this.ydoc) return;

    const bytes = Y.encodeStateAsUpdate(this.ydoc);
    await this.ctx.storage.put("ydoc", bytes);
    await this.ctx.storage.put("lastActivity", Date.now());

    const text = this.ydoc.getText("content").toString();
    const docKey = await this.ctx.storage.get<string>("docKey");
    if (docKey && text.trim()) {
      await this.env.ASSETS.put(docKey, text);
    }
  }
}
