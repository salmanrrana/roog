/**
 * Canvas painting for the playlist timeline: bar ruler, track rows and clips with
 * a mini note preview. Called from the static canvas layer; the playhead and
 * marquee are drawn on the overlay in Timeline.tsx.
 */
import { patternLength } from "@/core/schedule";
import type { Clip, Pattern, PlaylistTrack } from "@/core/schema";
import { BAR_TICKS } from "@/core/timing";
import type { CanvasSize } from "@/ui/canvas";
import { themeColors } from "@/ui/theme";
import { type TimelineView, drawTimeGrid, tickToX, xToTick } from "@/ui/timeline";
import { ROW_HEIGHT, RULER_HEIGHT } from "./view-store";

export interface Scene {
  readonly view: TimelineView;
  readonly scrollY: number;
  readonly tracks: readonly PlaylistTrack[];
  readonly clips: readonly Clip[];
  readonly patterns: ReadonlyMap<string, Pattern>;
  readonly selected: ReadonlySet<string>;
  readonly songEnd: number;
}

interface Preview {
  readonly length: number;
  /** Number of distinct rows: one per channel and pitch, so drum steps show one row per drum. */
  readonly lanes: number;
  readonly notes: readonly {
    readonly tick: number;
    readonly length: number;
    readonly lane: number;
  }[];
}

// Patterns are immutable, so a preview is computed once per pattern version.
const previews = new WeakMap<Pattern, Preview>();

function previewOf(pattern: Pattern): Preview {
  const cached = previews.get(pattern);
  if (cached) return cached;
  const notes: { tick: number; length: number; lane: number }[] = [];
  let lanes = 0;
  for (const channelNotes of Object.values(pattern.notes)) {
    // Higher pitches on top within each channel's band.
    const pitches = [...new Set(channelNotes.map((note) => note.pitch))].sort((a, b) => b - a);
    for (const note of channelNotes) {
      notes.push({
        tick: note.tick,
        length: note.length,
        lane: lanes + pitches.indexOf(note.pitch),
      });
    }
    lanes += pitches.length;
  }
  const preview = { length: patternLength(pattern), lanes, notes };
  previews.set(pattern, preview);
  return preview;
}

/** Paint the whole static layer. */
export function drawTimeline(ctx: CanvasRenderingContext2D, size: CanvasSize, scene: Scene): void {
  const colors = themeColors();
  const { width, height } = size;
  const { view, scrollY, tracks } = scene;
  const tracksBottom = RULER_HEIGHT + tracks.length * ROW_HEIGHT - scrollY;

  ctx.fillStyle = colors.well;
  ctx.fillRect(0, 0, width, height);

  // Grid behind the track rows only.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, RULER_HEIGHT, width, Math.max(0, Math.min(height, tracksBottom) - RULER_HEIGHT));
  ctx.clip();
  ctx.translate(0, RULER_HEIGHT);
  drawTimeGrid(ctx, view, { ...size, height: height - RULER_HEIGHT }, colors);
  ctx.restore();

  ctx.fillStyle = colors.line;
  for (let row = 1; row <= tracks.length; row += 1) {
    const y = RULER_HEIGHT + row * ROW_HEIGHT - scrollY;
    if (y > RULER_HEIGHT && y < height) ctx.fillRect(0, Math.round(y) - 1, width, 1);
  }

  drawClips(ctx, size, scene);
  drawRuler(ctx, size, scene);
}

function drawClips(ctx: CanvasRenderingContext2D, { width, height }: CanvasSize, scene: Scene) {
  const colors = themeColors();
  const { view, scrollY, tracks, patterns, selected } = scene;
  const rowOf = new Map(tracks.map((track, index) => [track.id, index]));
  const muted = new Set(tracks.filter((track) => track.muted).map((track) => track.id));
  ctx.font = "bold 10px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";

  for (const clip of scene.clips) {
    const row = rowOf.get(clip.trackId);
    const pattern = patterns.get(clip.patternId);
    if (row === undefined || !pattern) continue;
    const x = tickToX(view, clip.start);
    const w = clip.length * view.pxPerTick;
    const y = RULER_HEIGHT + row * ROW_HEIGHT - scrollY + 1;
    const h = ROW_HEIGHT - 3;
    if (x > width || x + w < 0 || y > height || y + h < RULER_HEIGHT) continue;

    const alpha = muted.has(clip.trackId) ? 0.35 : 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = pattern.color;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = alpha;
    ctx.fillRect(x, y, w, 13);
    ctx.fillStyle = colors.well;
    ctx.fillText(pattern.name.toUpperCase(), x + 4, y + 7);

    drawPreview(ctx, pattern, clip, x, y + 15, h - 17, width, view.pxPerTick);
    ctx.restore();

    ctx.globalAlpha = alpha;
    if (selected.has(clip.id)) {
      ctx.strokeStyle = colors.amber;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    } else {
      ctx.strokeStyle = pattern.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    ctx.globalAlpha = 1;
  }
}

/** Notes of every visible repeat, plus a divider where the pattern loops. */
function drawPreview(
  ctx: CanvasRenderingContext2D,
  pattern: Pattern,
  clip: Clip,
  x: number,
  top: number,
  bodyHeight: number,
  width: number,
  pxPerTick: number,
) {
  const { length, lanes, notes } = previewOf(pattern);
  const repeatPx = length * pxPerTick;
  const laneHeight = bodyHeight / Math.max(1, lanes);
  const noteHeight = Math.max(1, Math.min(4, laneHeight - 1));
  const first = Math.max(0, Math.floor(-x / repeatPx));

  for (let r = first; r * length < clip.length; r += 1) {
    const base = x + r * repeatPx;
    if (base > width) break;
    if (r > 0) {
      ctx.fillStyle = pattern.color;
      ctx.fillRect(Math.round(base), top - 2, 1, bodyHeight + 4);
    }
    if (repeatPx < 8) continue;
    ctx.fillStyle = pattern.color;
    for (const note of notes) {
      const at = r * length + note.tick;
      if (at >= clip.length) continue;
      const nx = x + at * pxPerTick;
      if (nx > width) continue;
      const ny = top + note.lane * laneHeight + (laneHeight - noteHeight) / 2;
      ctx.fillRect(
        nx,
        ny,
        Math.max(1.5, Math.min(note.length, clip.length - at) * pxPerTick - 1),
        noteHeight,
      );
    }
  }
}

function drawRuler(ctx: CanvasRenderingContext2D, { width }: CanvasSize, scene: Scene) {
  const colors = themeColors();
  const { view, songEnd } = scene;
  ctx.fillStyle = colors["panel-2"];
  ctx.fillRect(0, 0, width, RULER_HEIGHT);
  ctx.fillStyle = colors.line;
  ctx.fillRect(0, RULER_HEIGHT - 1, width, 1);

  // Label every bar, or every 2/4/8... bars when zoomed out.
  const barPx = BAR_TICKS * view.pxPerTick;
  const every = 2 ** Math.max(0, Math.ceil(Math.log2(32 / barPx)));
  const firstBar = Math.floor(view.scrollTick / BAR_TICKS);
  const lastBar = Math.ceil(xToTick(view, width) / BAR_TICKS);
  ctx.font = "bold 10px 'JetBrains Mono', ui-monospace, monospace";
  ctx.textBaseline = "middle";
  for (let bar = firstBar - (firstBar % every); bar <= lastBar; bar += every) {
    const x = Math.round(tickToX(view, bar * BAR_TICKS));
    ctx.fillStyle = colors["ink-dim"];
    ctx.fillRect(x, 10, 1, RULER_HEIGHT - 10);
    ctx.fillStyle = colors.ink;
    ctx.fillText(String(bar + 1), x + 3, 8);
  }

  // Song end: where song mode loops back.
  const endX = Math.round(tickToX(view, songEnd));
  ctx.fillStyle = colors.amber;
  ctx.beginPath();
  ctx.moveTo(endX, RULER_HEIGHT - 1);
  ctx.lineTo(endX - 6, RULER_HEIGHT - 9);
  ctx.lineTo(endX, RULER_HEIGHT - 9);
  ctx.closePath();
  ctx.fill();
}
