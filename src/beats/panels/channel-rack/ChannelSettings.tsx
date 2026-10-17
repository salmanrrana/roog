import { useEffect, useRef } from "react";
import { findChannel, setChannelParam, updateChannel } from "@/core/commands";
import { engine } from "@/engine";
import { getInstrument, instruments } from "@/instruments";
import { useSampleLibrary } from "@/persistence";
import { factorySounds } from "@/sounds/factory";
import { edit, useProjectStore } from "@/state/project-store";
import { Button, Select } from "@/ui/Button";
import { ParamControl } from "@/ui/ParamControl";
import { routeOptions, setChannelSample, setInstrument } from "./actions";
import { toggleExpanded } from "./rack-store";

/**
 * Settings band for one channel, under the rack: instrument, sample (previewed
 * when picked), Out, and a ParamControl per instrument param (knobs for amounts,
 * segmented buttons for choices). Scrolls itself into view when opened.
 */
export function ChannelSettings({ channelId }: { readonly channelId: string }) {
  const channel = useProjectStore((s) => findChannel(s.project, channelId));
  const inserts = useProjectStore((s) => s.project.mixer.inserts);
  const samples = useSampleLibrary((s) => s.samples);
  const region = useRef<HTMLElement>(null);

  // Keep the whole panel in view when it opens, and when a new instrument changes its size.
  const instrument = channel?.instrument;
  useEffect(() => {
    region.current?.scrollIntoView({ block: "nearest" });
  }, [channelId, instrument]);

  if (!channel) return null;

  const def = getInstrument(channel.instrument);
  const sampleId = channel.sampleId ?? "";
  const knownSample =
    sampleId === "" ||
    factorySounds.some((sound) => sound.id === sampleId) ||
    samples.some((sample) => sample.id === sampleId);

  return (
    <section
      ref={region}
      aria-label={`${channel.name} settings`}
      className="border-t-2 bg-panel-2/60 px-3 py-2.5"
      style={{ borderTopColor: channel.color }}
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="truncate font-display text-lg leading-none tracking-wide uppercase">
          {channel.name}
        </h3>
        <span className="caption">settings</span>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Close settings"
          title="Close settings"
          className="ml-auto"
          onClick={() => toggleExpanded(channelId)}
        >
          ✕
        </Button>
      </div>

      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="flex flex-col gap-1">
          <span className="caption">Instrument</span>
          <Select
            aria-label="Instrument"
            value={channel.instrument}
            onChange={(event) => setInstrument(channelId, event.target.value)}
          >
            {Object.entries(instruments).map(([kind, item]) => (
              <option key={kind} value={kind}>
                {item.name}
              </option>
            ))}
          </Select>
          {!def.usesSample && channel.sampleId !== null && (
            <p className="max-w-48 text-2xs text-ink-dim">
              The sample stays on this channel. Switch back to Sampler to hear it.
            </p>
          )}
        </div>

        {def.usesSample && (
          <div className="flex flex-col gap-1">
            <span className="caption">Sample</span>
            <span className="flex items-center gap-1.5">
              <Select
                aria-label="Sample"
                className="w-44"
                value={sampleId}
                onChange={(event) => {
                  const id = event.target.value;
                  if (!id) return edit((p) => updateChannel(p, channelId, { sampleId: null }));
                  setChannelSample(channelId, id);
                  engine.previewSample(id);
                }}
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
              </Select>
              {!knownSample && (
                <span className="text-amber" title="Sample missing: it was deleted from My samples">
                  ⚠
                </span>
              )}
            </span>
            {sampleId === "" && (
              <p className="max-w-48 text-2xs text-ink-dim">
                Drop a sound on this row or pick one here
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span className="caption">Out</span>
          <Select
            aria-label="Out"
            className="w-44"
            value={channel.mixerTrackId}
            onChange={(event) =>
              edit((p) => updateChannel(p, channelId, { mixerTrackId: event.target.value }))
            }
          >
            {routeOptions(inserts).map((track) => (
              <option key={track.id} value={track.id}>
                {track.label}
              </option>
            ))}
          </Select>
        </div>

        <div
          className="flex flex-wrap items-start gap-4"
          role="group"
          aria-label={`${def.name} params`}
        >
          {Object.entries(def.params).map(([key, spec]) => (
            <ParamControl
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
      </div>
    </section>
  );
}
