// Pure patch rules: which jacks can connect, how modules flow into rack rows,
// and how a patch is encoded for share links. No DOM, no audio.

export const PATCH_VERSION = 1;

/** Rack shape: three rows of 100 HP each. */
export const RACK = { rows: 3, rowHp: 100 };

/**
 * Outputs connect to inputs. Gates only talk to gates; audio and cv are both
 * voltages and patch into each other freely (audio-rate modulation!).
 * @param {{ dir: string, type: string }} from
 * @param {{ dir: string, type: string }} to
 */
export function canPatch(from, to) {
  if (from.dir !== "out" || to.dir !== "in") {
    return false;
  }

  return (from.type === "gate") === (to.type === "gate");
}

/**
 * Flow modules left-to-right into fixed-width rows. A module that does not fit
 * in the remaining space starts the next row. Returns null when the rack is full.
 * @param {string[]} order
 * @param {(id: string) => number} hpOf
 * @param {{ rows: number, rowHp: number }} rack
 * @returns {string[][] | null}
 */
export function layoutRows(order, hpOf, rack) {
  const rows = [[]];
  let used = 0;

  for (const id of order) {
    const hp = hpOf(id);

    if (hp > rack.rowHp) {
      return null;
    }

    if (used + hp > rack.rowHp) {
      rows.push([]);
      used = 0;
    }

    rows[rows.length - 1].push(id);
    used += hp;
  }

  return rows.length <= rack.rows ? rows : null;
}

/** Encode a patch object into a URL-safe string for share links. */
export function encodePatch(patch) {
  const bytes = new TextEncoder().encode(JSON.stringify(patch));
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** Decode a share-link string. Returns null for anything malformed. */
export function decodePatch(text) {
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const patch = JSON.parse(new TextDecoder().decode(bytes));

    return isPatchShape(patch) ? patch : null;
  } catch {
    return null;
  }
}

/** Loose shape check so a hand-edited or stale patch fails soft, not loud. */
export function isPatchShape(patch) {
  return (
    patch !== null &&
    typeof patch === "object" &&
    Array.isArray(patch.modules) &&
    Array.isArray(patch.cables) &&
    patch.cables.every(
      (cable) =>
        Array.isArray(cable) &&
        cable.length === 4 &&
        cable.every((part) => typeof part === "string"),
    ) &&
    patch.modules.every(
      (module) =>
        typeof module?.id === "string" && typeof module?.type === "string",
    )
  );
}
