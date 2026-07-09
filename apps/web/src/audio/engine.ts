import { getBuffer } from "./cache";

type ErrorCallback = (message: string) => void;

interface AudioGraph {
  ctx: AudioContext;
  gain: GainNode;
}

export class AudioEngine {
  private graph: AudioGraph | null = null;
  private readonly bufferCache = new Map<string, AudioBuffer>();
  private onError: ErrorCallback | null = null;

  private ensureGraph(): AudioGraph {
    if (this.graph) return this.graph;
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio API unavailable");
    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(ctx.destination);
    this.graph = { ctx, gain };
    return this.graph;
  }

  resume(): void {
    const { ctx } = this.ensureGraph();
    if (ctx.state === "suspended") void ctx.resume();
  }

  setMasterVolume(v: number): void {
    const clamped = Math.max(0, Math.min(1, v));
    const { ctx, gain } = this.ensureGraph();
    gain.gain.setValueAtTime(clamped, ctx.currentTime);
  }

  setOnError(cb: ErrorCallback | null): void {
    this.onError = cb;
  }

  async playSound(soundId: string): Promise<void> {
    const { ctx, gain } = this.ensureGraph();
    let buffer = this.bufferCache.get(soundId);
    if (!buffer) {
      try {
        const arrayBuffer = await getBuffer(soundId);
        buffer = await ctx.decodeAudioData(arrayBuffer);
        this.bufferCache.set(soundId, buffer);
      } catch (err) {
        const message = err instanceof Error ? err.message : `Failed to play sound ${soundId}`;
        this.onError?.(message);
        throw err;
      }
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(0);
  }
}

let engine: AudioEngine | null = null;

export function getEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}
