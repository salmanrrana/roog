import { describe, expect, test } from "vitest";
import { type PcmSource, encodeWav } from "./wav";

function pcm(channels: number[][], sampleRate = 44100): PcmSource {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0]?.length ?? 0,
    getChannelData: (index) => new Float32Array(channels[index] ?? []),
  };
}

const text = (view: DataView, offset: number, length: number) =>
  String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));

describe("encodeWav", () => {
  test("writes a 16-bit stereo PCM header", () => {
    const view = new DataView(
      encodeWav(
        pcm(
          [
            [0, 0, 0],
            [0, 0, 0],
          ],
          48000,
        ),
      ),
    );
    expect(text(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 12);
    expect(text(view, 8, 8)).toBe("WAVEfmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(28, true)).toBe(48000 * 4);
    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(12);
    expect(view.byteLength).toBe(44 + 12);
  });

  test("interleaves channels, clamps, and scales to int16", () => {
    const view = new DataView(
      encodeWav(
        pcm([
          [1, -1, 2],
          [0.5, -2, 0],
        ]),
      ),
    );
    const samples = Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([32767, 16384, -32768, -32768, 32767, 0]);
  });

  test("copies mono to both sides", () => {
    const view = new DataView(encodeWav(pcm([[0.25]])));
    expect(view.getInt16(44, true)).toBe(view.getInt16(46, true));
    expect(view.getInt16(44, true)).toBe(8192);
  });
});
