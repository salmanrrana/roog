/** Drag payload type for a sample id: set by the browser, read by the channel rack. */
export const SAMPLE_MIME = "application/x-roog-sample";

/** True when a drag carries a sample from the browser or files from the desktop. */
export function carriesSamples(data: DataTransfer): boolean {
  return data.types.includes(SAMPLE_MIME) || data.types.includes("Files");
}
