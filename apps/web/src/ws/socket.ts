import type { ClientToServerMessage, ServerToClientMessage } from "@bts-soundboard/shared";
import { parseServerToClientMessage } from "@bts-soundboard/shared";

import type { ConnectionState } from "../types";
import { WS_URL } from "../config";

type MessageListener = (msg: ServerToClientMessage) => void;
type StateListener = (s: ConnectionState) => void;
type ErrorListener = (message: string) => void;

const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const JITTER_MS = 250;

export class SoundboardSocket {
  private readonly url: string;
  private ws: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private manualClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.manualClose = false;
    this.setState("connecting");

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.attempt = 0;
      this.setState("connected");
      this.send({ type: "request_sync" });
    });

    ws.addEventListener("message", (event: MessageEvent) => {
      this.handleMessage(event);
    });

    ws.addEventListener("close", () => {
      this.ws = null;
      this.setState("disconnected");
      if (!this.manualClose) this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      const message = "WebSocket connection error";
      console.warn("[ws] socket error:", message);
      this.errorListeners.forEach((l) => l(message));
    });
  }

  send(msg: ClientToServerMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  close(): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState("disconnected");
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== "string") return;
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Malformed server frame";
      console.warn("[ws] malformed frame:", message);
      this.errorListeners.forEach((l) => l(message));
      return;
    }
    let msg: ServerToClientMessage;
    try {
      msg = parseServerToClientMessage(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid server message";
      console.warn("[ws] invalid message:", message);
      this.errorListeners.forEach((l) => l(message));
      return;
    }
    this.messageListeners.forEach((l) => l(msg));
  }

  private setState(s: ConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateListeners.forEach((l) => l(s));
  }

  private scheduleReconnect(): void {
    if (this.manualClose) return;
    this.setState("reconnecting");
    const base = Math.min(MIN_BACKOFF_MS * 2 ** this.attempt, MAX_BACKOFF_MS);
    this.attempt += 1;
    const delay = Math.min(base + Math.random() * JITTER_MS, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

let socket: SoundboardSocket | null = null;

export function getSocket(): SoundboardSocket {
  if (!socket) {
    socket = new SoundboardSocket(WS_URL);
  }
  socket.connect();
  return socket;
}
