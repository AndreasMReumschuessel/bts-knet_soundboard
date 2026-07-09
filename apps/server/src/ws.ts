import { WebSocketServer, WebSocket, type RawData } from "ws";
import type { Server } from "node:http";
import {
  ClientMessageType,
  ServerMessageType,
  WS_PATH,
  WsErrorCode,
  parseClientToServerMessage,
  type ClientToServerMessage,
  type ServerToClientMessage,
  type SoundMetadata,
  type WsErrorCodeValue,
} from "@bts-soundboard/shared";
import type { Catalog } from "./storage/catalog.js";

export interface WsDeps {
  catalog: Catalog;
}

export interface WsManager {
  /** Broadcast a message to ALL connected clients (including any originator). */
  broadcast(message: ServerToClientMessage): void;
  /** Number of currently connected WS clients (surfaced via `/health`). */
  readonly clientCount: number;
}

/**
 * Attach a `ws` WebSocketServer to an existing HTTP server on `WS_PATH` and
 * implement the broadcast-play semantics from ADR-0002:
 *  - on connect: send `sound_list` (full catalog metadata);
 *  - on `request_sync`: send `sound_list`;
 *  - on `play`: validate, then broadcast S→C `play` (with server-set
 *    `serverTimestamp`) to EVERY client INCLUDING the originator;
 *  - on any invalid frame: send S→C `error` `code: "invalid_message"`;
 *  - on `play` with unknown `soundId`: send S→C `error` `code: "unknown_sound"`
 *    to that client only (no broadcast).
 *
 * WS carries metadata only — never audio bytes (ADR-0002/0003).
 */
export function createWsManager(server: Server, deps: WsDeps): WsManager {
  const clients = new Set<WebSocket>();
  const wss = new WebSocketServer({ server, path: WS_PATH });

  wss.on("connection", (socket) => {
    clients.add(socket);
    send(socket, soundListMessage(deps.catalog.list()));

    socket.on("message", (data) => {
      let parsed: ClientToServerMessage;
      try {
        parsed = parseClientToServerMessage(parseJson(data));
      } catch (err) {
        send(socket, errorMessage(WsErrorCode.invalid_message, describe(err)));
        return;
      }
      handleMessage(socket, parsed);
    });

    const cleanup = (): void => {
      clients.delete(socket);
    };
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });

  function handleMessage(socket: WebSocket, msg: ClientToServerMessage): void {
    switch (msg.type) {
      case ClientMessageType.play: {
        if (!deps.catalog.has(msg.soundId)) {
          send(socket, errorMessage(WsErrorCode.unknown_sound, `Unknown soundId: ${msg.soundId}`));
          return;
        }
        // Echo to ALL clients including the originator. `serverTimestamp` is
        // authoritative; `triggeredBy` is forwarded unchanged.
        const broadcastMsg: ServerToClientMessage = {
          type: ServerMessageType.play,
          soundId: msg.soundId,
          triggeredBy: msg.triggeredBy,
          serverTimestamp: Date.now(),
        };
        broadcast(broadcastMsg);
        return;
      }
      case ClientMessageType.request_sync: {
        send(socket, soundListMessage(deps.catalog.list()));
        return;
      }
      default: {
        // Unreachable: `parseClientToServerMessage` only yields the two above.
        const _exhaustive: never = msg;
        void _exhaustive;
        send(socket, errorMessage(WsErrorCode.invalid_message, "Unhandled message type"));
      }
    }
  }

  function broadcast(message: ServerToClientMessage): void {
    const json = JSON.stringify(message);
    for (const c of clients) {
      if (c.readyState === WebSocket.OPEN) c.send(json);
    }
  }

  function send(socket: WebSocket, message: ServerToClientMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  return {
    broadcast,
    get clientCount() {
      return clients.size;
    },
  };
}

function soundListMessage(sounds: SoundMetadata[]): ServerToClientMessage {
  return { type: ServerMessageType.sound_list, sounds };
}

function errorMessage(code: WsErrorCodeValue, message: string): ServerToClientMessage {
  return { type: ServerMessageType.error, code, message };
}

function parseJson(data: RawData): unknown {
  const text = Buffer.isBuffer(data)
    ? data.toString("utf8")
    : Array.isArray(data)
      ? Buffer.concat(data).toString("utf8")
      : Buffer.from(data).toString("utf8");
  return JSON.parse(text);
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
