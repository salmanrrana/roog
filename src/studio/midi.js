// Note and knob input: Web MIDI devices plus the computer keyboard laid out
// like a piano (A W S E D F T G Y H U J K O L P). Z / X shift the octave.

const KEY_NOTES = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
};

function isTyping(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
  );
}

/**
 * @param {{
 *   onNote: (note: number, velocity: number) => void,
 *   onControl: (key: string, value: number) => void,
 *   onStatus: (message: string) => void
 * }} handlers - velocity and control values are 0..1; control keys look like "1:74" (channel:cc)
 */
export function createNoteInput({ onNote, onControl, onStatus }) {
  const held = new Map();
  let octave = 0;
  let midiReady = false;

  document.addEventListener("keydown", (event) => {
    if (
      event.repeat ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      isTyping(event.target)
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "z" || key === "x") {
      octave = Math.max(-3, Math.min(3, octave + (key === "z" ? -1 : 1)));
      onStatus(`Keyboard octave ${octave >= 0 ? "+" : ""}${octave}`);
      return;
    }

    if (key in KEY_NOTES && !held.has(key)) {
      const note = 60 + octave * 12 + KEY_NOTES[key];

      held.set(key, note);
      onNote(note, 0.8);
    }
  });

  document.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();

    if (held.has(key)) {
      onNote(held.get(key), 0);
      held.delete(key);
    }
  });

  // Losing focus mid-note would leave keys stuck on.
  window.addEventListener("blur", () => {
    held.forEach((note) => onNote(note, 0));
    held.clear();
  });

  function handleMessage({ data }) {
    const [status, first, second = 0] = data;
    const kind = status & 0xf0;
    const channel = (status & 0x0f) + 1;

    if (kind === 0x90 && second > 0) {
      onNote(first, second / 127);
    } else if (kind === 0x80 || kind === 0x90) {
      onNote(first, 0);
    } else if (kind === 0xb0) {
      onControl(`${channel}:${first}`, second / 127);
    }
  }

  return {
    /** Ask for MIDI access (call from a click). Resolves to the number of connected inputs. */
    async enableMidi() {
      if (midiReady || !navigator.requestMIDIAccess) {
        return 0;
      }

      try {
        const access = await navigator.requestMIDIAccess();
        const attach = () =>
          access.inputs.forEach(
            (input) => (input.onmidimessage = handleMessage),
          );

        attach();
        access.onstatechange = attach;
        midiReady = true;
        return access.inputs.size;
      } catch {
        return 0;
      }
    },
  };
}
