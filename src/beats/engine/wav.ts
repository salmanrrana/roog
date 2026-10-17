/** The parts of an AudioBuffer the encoder reads (a plain object works in tests). */
export type PcmSource = Pick<
  AudioBuffer,
  "numberOfChannels" | "sampleRate" | "length" | "getChannelData"
>;

const HEADER_BYTES = 44;

/**
 * Encode audio as a 16-bit PCM stereo WAV file. Mono input is copied to both
 * sides; channels past the second are dropped. Samples are clamped to -1..1.
 */
export function encodeWav(source: PcmSource): ArrayBuffer {
  const channels = 2;
  const frames = source.length;
  const dataBytes = frames * channels * 2;
  const view = new DataView(new ArrayBuffer(HEADER_BYTES + dataBytes));
  const left = source.getChannelData(0);
  const right = source.numberOfChannels > 1 ? source.getChannelData(1) : left;

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, source.sampleRate, true);
  view.setUint32(28, source.sampleRate * channels * 2, true); // byte rate
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = HEADER_BYTES;
  for (let i = 0; i < frames; i += 1) {
    view.setInt16(offset, toInt16(left[i] ?? 0), true);
    view.setInt16(offset + 2, toInt16(right[i] ?? 0), true);
    offset += 4;
  }
  return view.buffer;
}

function toInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return Math.round(s < 0 ? s * 0x8000 : s * 0x7fff);
}
