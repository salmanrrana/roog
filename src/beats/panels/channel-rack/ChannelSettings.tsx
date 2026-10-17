import { findChannel, setChannelInstrument, setChannelParam, updateChannel } from "@/core/commands";
import { MASTER_ID } from "@/core/defaults";
import { getInstrument, instruments } from "@/instruments";
import { useSampleLibrary } from "@/persistence";
import { factorySounds } from "@/sounds/factory";
import { edit, useProjectStore } from "@/state/project-store";
import { Knob } from "@/ui/Knob";
import { setChannelSample } from "./actions";
import { toggleExpanded } from "./rack-store";

const SELECT =
  "h-7 min-w-0 rounded-sm border border-line bg-well px-1.5 text-xs text-ink hover:border-ink-dim";

/**
 * Expanded settings for one channel, shown under the grid: instrument, sample,
 * mixer route, and a knob per instrument param (from the registry's specs).
 */
export function ChannelSettings({ channelId }: { readonly channelId: string }) {
  const channel = useProjectStore((s) => findChannel(s.project, channelId));
  const inserts = useProjectStore((s) => s.project.mixer.inserts);
  const samples = useSampleLibrary((s) => s.samples);
  if (!channel) return null;

  const def = getInstrument(channel.instrument);
  const sampleId = channel.sampleId ?? "";
  const knownSample =
    sampleId === "" ||
    factorySounds.some((sound) => sound.id === sampleId) ||
    samples.some((sample) => sample.id === sampleId);

  return (
    <section
      aria-label={`${channel.name} settings`}
      className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t-2 bg-panel-2/60 px-3 py-2.5"
      style={{ borderTopColor: channel.color }}
    >
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg leading-none tracking-wide uppercase">
          {channel.name}
        </h3>
        <button
          type="button"
          onClick={() => toggleExpanded(channelId)}
          className="self-start font-mono text-[10px] text-ink-dim uppercase hover:text-ink"
        >
          Close ▴
        </button>
      </div>

      <label className="flex flex-col gap-1 font-mono text-[10px] text-ink-dim uppercase">
        Instrument
        <select
          className={SELECT}
          value={channel.instrument}
          onChange={(event) => edit((p) => setChannelInstrument(p, channelId, event.target.value))}
        >
          {Object.entries(instruments).map(([kind, item]) => (
            <option key={kind} value={kind}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      {def.usesSample && (
        <label className="flex flex-col gap-1 font-mono text-[10px] text-ink-dim uppercase">
          Sample
          <select
            className={`${SELECT} max-w-48`}
            value={sampleId}
            onChange={(event) =>
              event.target.value
                ? setChannelSample(channelId, event.target.value)
                : edit((p) => updateChannel(p, channelId, { sampleId: null }))
            }
          >
            <option value="">None</option>
            {!knownSample && <option value={sampleId}>Missing sample</option>}
            <optgroup label="Factory">
              {factorySounds.map((sound) => (
                <option key={sound.id} value={sound.id}>
                  {sound.name}
                </option>
              ))}
            </optgroup>
            {samples.length > 0 && (
              <optgroup label="My samples">
                {samples.map((sample) => (
                  <option key={sample.id} value={sample.id}>
                    {sample.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 font-mono text-[10px] text-ink-dim uppercase">
        Mixer
        <select
          className={`${SELECT} max-w-40`}
          value={channel.mixerTrackId}
          onChange={(event) =>
            edit((p) => updateChannel(p, channelId, { mixerTrackId: event.target.value }))
          }
        >
          <option value={MASTER_ID}>Master</option>
          {inserts.map((insert, index) => (
            <option key={insert.id} value={insert.id}>
              {index + 1} · {insert.name}
            </option>
          ))}
        </select>
      </label>

      <div
        className="flex flex-wrap items-end gap-3"
        role="group"
        aria-label={`${def.name} params`}
      >
        {Object.entries(def.params).map(([key, spec]) => (
          <Knob
            key={key}
            spec={spec}
            value={channel.params[key] ?? spec.default}
            color={channel.color}
            onChange={(value, gesture) =>
              edit((p) => setChannelParam(p, channelId, key, value), gesture)
            }
          />
        ))}
      </div>
    </section>
  );
}
