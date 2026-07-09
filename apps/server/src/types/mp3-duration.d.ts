/**
 * Ambient declaration for `mp3-duration` (v1.x, CJS, ships no types). It accepts
 * a filename OR a Buffer and returns a Promise<number> of seconds (float). We
 * pass a Buffer so the file is parsed from memory (no second disk read).
 */
declare module "mp3-duration" {
  type Mp3DurationCallback = (err: Error | null, duration: number) => void;
  function mp3Duration(
    target: string | Buffer,
    callback: Mp3DurationCallback,
  ): Promise<number>;
  function mp3Duration(
    target: string | Buffer,
    cbrEstimate?: boolean,
    callback?: Mp3DurationCallback,
  ): Promise<number>;
  export = mp3Duration;
}
