import { useEffect, useRef, useState } from 'react';
import {
  APPEARANCE_PRESETS,
  appearanceVariables,
  cloneAppearance,
  defaultAppearance,
  exportTheme,
  hexToHsv,
  hsvToHex,
  isHex,
  parseTheme,
  type Appearance,
} from '../lib/appearance';
import type { SidebarClient } from '../lib/client';
import { useSidebar } from '../lib/store';
import { resolveAppearance } from './theme';

const controls = [
  ['contrast', 'Text contrast', 85, 100],
  ['surfaceOpacity', 'Surface strength', 0, 100],
  ['borderOpacity', 'Border opacity', 0, 40],
  ['shadow', 'Shadow depth', 0, 80],
  ['transparency', 'Sidebar opacity', 85, 100],
  ['blur', 'Backdrop blur', 0, 24],
  ['grain', 'Grain', 0, 6],
  ['softness', 'Surface softness', 0, 8],
  ['radius', 'Corner radius', 2, 16],
  ['density', 'Row density', 85, 115],
  ['motion', 'Animation intensity', 0, 150],
] as const;
export function AppearanceStudio({ client }: { client: SidebarClient }) {
  const metadata = useSidebar((s) => s.metadata)!;
  const workspaceId = metadata.activeWorkspaceId;
  const [scope, setScope] = useState<'global' | 'workspace'>('global');
  const saved = () =>
    cloneAppearance(
      (scope === 'workspace'
        ? metadata.appearance?.workspaces?.[workspaceId]
        : metadata.appearance?.global) ??
        resolveAppearance(
          metadata,
          matchMedia('(prefers-color-scheme: light)').matches,
        ),
    );
  const [value, setValue] = useState<Appearance>(saved),
    [colorTarget, setColorTarget] = useState<'base' | 'accent' | 'secondary'>(
      'accent',
    );
  const [message, setMessage] = useState(
      'Preview changes, then Apply to save.',
    ),
    [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const container = useRef<HTMLDivElement>(null),
    frame = useRef<number>(0);
  const [hueMemory, setHueMemory] = useState<
    Partial<Record<'base' | 'accent' | 'secondary', number>>
  >({});
  const [saturationMemory, setSaturationMemory] = useState<
    Partial<Record<'base' | 'accent' | 'secondary', number>>
  >({});
  const [calculatedHue, calculatedSaturation, v] = hexToHsv(value[colorTarget]);
  const s =
    v > 0
      ? calculatedSaturation
      : (saturationMemory[colorTarget] ?? calculatedSaturation);
  const h =
    s > 0 && v > 0 ? calculatedHue : (hueMemory[colorTarget] ?? calculatedHue);
  const variables = appearanceVariables(value);
  useEffect(() => {
    const tree = container.current?.getRootNode() as
      Document | ShadowRoot | undefined;
    const roots = tree?.querySelectorAll<HTMLElement>('.sidekick-root');
    frame.current = requestAnimationFrame(() =>
      roots?.forEach((root) => {
        for (const [k, v] of Object.entries(appearanceVariables(value)))
          root.style.setProperty(k, v);
      }),
    );
    return () => cancelAnimationFrame(frame.current);
  }, [value]);
  useEffect(() => {
    const tree = container.current?.getRootNode() as
      Document | ShadowRoot | undefined;
    return () => {
      const current = appearanceVariables(
        resolveAppearance(
          useSidebar.getState().metadata,
          matchMedia('(prefers-color-scheme: light)').matches,
        ),
      );
      tree?.querySelectorAll<HTMLElement>('.sidekick-root').forEach((root) => {
        for (const [k, v] of Object.entries(current))
          root.style.setProperty(k, v);
      });
    };
  }, []);
  const update = <K extends keyof Appearance>(key: K, next: Appearance[K]) => {
    setValue((a) => ({ ...a, [key]: next }));
    setError('');
    setMessage('Unsaved preview');
  };
  const gradient = (patch: Partial<Appearance['gradient']>) =>
    update('gradient', { ...value.gradient, ...patch });
  const color = (hue: number, saturation = s, brightness = v) => {
    setHueMemory((previous) => ({ ...previous, [colorTarget]: hue }));
    setSaturationMemory((previous) => ({
      ...previous,
      [colorTarget]: saturation,
    }));
    update(colorTarget, hsvToHex(hue, saturation, brightness));
  };
  const apply = async (config: Appearance | null) => {
    setSaving(true);
    setError('');
    try {
      await client.command({
        type: 'appearance.update',
        config,
        workspaceId: scope === 'workspace' ? workspaceId : undefined,
      });
      setMessage(
        config
          ? 'Appearance saved'
          : 'Override removed. Inherited appearance restored.',
      );
      if (!config)
        setValue(
          resolveAppearance(
            useSidebar.getState().metadata,
            matchMedia('(prefers-color-scheme: light)').matches,
          ),
        );
    } catch {
      setError(
        'Appearance could not be saved. Your stored theme was preserved.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="appearance-studio" ref={container}>
      <div className="studio-heading">
        <div>
          <h3>Appearance Studio</h3>
          <p className="field-note">A quiet space, your way.</p>
        </div>
        <span className="studio-chip">Live preview</span>
      </div>
      <label className="studio-field">
        Apply appearance to
        <select
          aria-label="Appearance scope"
          value={scope}
          onChange={(e) => {
            const next = e.target.value as typeof scope;
            setScope(next);
            setValue(
              cloneAppearance(
                (next === 'workspace'
                  ? metadata.appearance?.workspaces?.[workspaceId]
                  : metadata.appearance?.global) ??
                  resolveAppearance(
                    metadata,
                    matchMedia('(prefers-color-scheme: light)').matches,
                  ),
              ),
            );
            setMessage('Preview changes, then Apply to save.');
          }}
        >
          <option value="global">All workspaces</option>
          <option value="workspace">This workspace</option>
        </select>
      </label>
      <p className="field-note">
        Workspace overrides take priority over global appearance. System mode
        follows your device. Older workspace themes remain until you save an
        appearance.
      </p>
      <div className="preset-grid" role="group" aria-label="Theme presets">
        {Object.entries(APPEARANCE_PRESETS).map(([name, a]) => (
          <button
            type="button"
            key={name}
            aria-label={`Preset ${name}`}
            onClick={() => {
              setValue(cloneAppearance(a));
              setMessage('Unsaved preview');
            }}
          >
            <span style={{ background: a.base, borderColor: a.accent }} />
            <span>{name}</span>
          </button>
        ))}
      </div>
      <label className="studio-field">
        Color mode
        <select
          aria-label="Appearance color mode"
          value={value.mode}
          onChange={(e) => {
            const mode = e.target.value as Appearance['mode'];
            setValue((a) => ({
              ...a,
              mode,
              base: defaultAppearance(
                mode === 'light' ||
                  (mode === 'system' &&
                    matchMedia('(prefers-color-scheme: light)').matches),
              ).base,
            }));
            setMessage('Unsaved preview');
          }}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </label>
      <fieldset>
        <legend>Colors</legend>
        <div className="color-targets">
          {(['base', 'accent', 'secondary'] as const).map((k) => (
            <label key={k}>
              <button
                type="button"
                className={colorTarget === k ? 'chosen' : ''}
                onClick={() => setColorTarget(k)}
                aria-label={`Edit ${k} on color wheel`}
                style={{ background: value[k] }}
              />
              <span>
                {k === 'base'
                  ? 'Base color'
                  : k === 'accent'
                    ? 'Accent color'
                    : 'Secondary accent'}
              </span>
              <input
                aria-label={
                  k === 'base'
                    ? 'Base color'
                    : k === 'accent'
                      ? 'Accent color'
                      : 'Secondary accent'
                }
                defaultValue={value[k]}
                key={value[k]}
                maxLength={7}
                onBlur={(e) => {
                  if (isHex(e.target.value))
                    update(k, e.target.value.toLowerCase());
                  else {
                    e.target.value = value[k];
                    setError('Use a six-digit hex color, for example #93b5d7.');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </label>
          ))}
        </div>
        <div className="color-wheel-row">
          <div
            className="hue-ring"
            role="slider"
            tabIndex={0}
            aria-label="Hue"
            aria-valuemin={0}
            aria-valuemax={359}
            aria-valuenow={Math.round(h) % 360}
            aria-valuetext={`${Math.round(h)} degrees`}
            onKeyDown={(e) => {
              const step = e.shiftKey ? 10 : 1;
              if (
                [
                  'ArrowRight',
                  'ArrowUp',
                  'ArrowLeft',
                  'ArrowDown',
                  'Home',
                  'End',
                ].includes(e.key)
              ) {
                e.preventDefault();
                color(
                  e.key === 'Home'
                    ? 0
                    : e.key === 'End'
                      ? 359
                      : (h +
                          (['ArrowRight', 'ArrowUp'].includes(e.key)
                            ? step
                            : -step) +
                          360) %
                        360,
                );
              }
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              const r = e.currentTarget.getBoundingClientRect();
              color(
                ((Math.atan2(
                  e.clientY - r.y - r.height / 2,
                  e.clientX - r.x - r.width / 2,
                ) *
                  180) /
                  Math.PI +
                  450) %
                  360,
              );
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const r = e.currentTarget.getBoundingClientRect();
              color(
                ((Math.atan2(
                  e.clientY - r.y - r.height / 2,
                  e.clientX - r.x - r.width / 2,
                ) *
                  180) /
                  Math.PI +
                  450) %
                  360,
              );
            }}
          >
            <span
              className="hue-handle"
              style={{ transform: `rotate(${h}deg)` }}
            />
            <span
              className="hue-center"
              style={{ background: value[colorTarget] }}
            />
          </div>
          <div className="color-channels">
            {(
              [
                ['Saturation', s],
                ['Brightness', v],
              ] as const
            ).map(([label, n]) => (
              <label className="studio-range" key={label}>
                <span>
                  {label}
                  <output>{Math.round(n)}%</output>
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  aria-label={label}
                  value={Math.round(n)}
                  onChange={(e) =>
                    color(
                      h,
                      label === 'Saturation' ? Number(e.target.value) : s,
                      label === 'Brightness' ? Number(e.target.value) : v,
                    )
                  }
                />
              </label>
            ))}
          </div>
        </div>
        <div className="color-swatches">
          {[
            '#93b5d7',
            '#8bc9b3',
            '#d7b593',
            '#b7a2d1',
            '#c3c8ce',
            '#e6b5b5',
          ].map((c) => (
            <button
              type="button"
              key={c}
              aria-label={`Use color ${c}`}
              style={{ background: c }}
              onClick={() => update(colorTarget, c)}
            />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Background</legend>
        <label className="studio-field">
          Fill
          <select
            aria-label="Background fill"
            value={value.gradient.type}
            onChange={(e) =>
              gradient({
                type: e.target.value as Appearance['gradient']['type'],
              })
            }
          >
            <option value="solid">Solid</option>
            <option value="linear">Linear gradient</option>
            <option value="radial">Radial gradient</option>
          </select>
        </label>
        {value.gradient.type !== 'solid' && (
          <>
            <div
              className="gradient-preview"
              aria-label="Gradient preview"
              style={{
                backgroundColor: value.base,
                backgroundImage: variables['--sk-gradient'],
              }}
            />
            {value.gradient.stops.map((stop, i) => (
              <div className="gradient-stop" key={i}>
                <input
                  type="color"
                  aria-label={`Gradient stop ${i + 1} color`}
                  value={stop.color}
                  onChange={(e) =>
                    gradient({
                      stops: value.gradient.stops.map((a, j) =>
                        j === i ? { ...a, color: e.target.value } : a,
                      ),
                    })
                  }
                />
                <label>
                  Stop {i + 1}
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={stop.position}
                    aria-label={`Gradient stop ${i + 1} position`}
                    onChange={(e) =>
                      gradient({
                        stops: value.gradient.stops.map((a, j) =>
                          j === i
                            ? { ...a, position: Number(e.target.value) }
                            : a,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remove gradient stop ${i + 1}`}
                  disabled={value.gradient.stops.length <= 2}
                  onClick={() =>
                    gradient({
                      stops: value.gradient.stops.filter((_, j) => j !== i),
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button"
              disabled={value.gradient.stops.length >= 5}
              onClick={() =>
                gradient({
                  stops: [
                    ...value.gradient.stops,
                    { color: value.secondary, position: 50 },
                  ],
                })
              }
            >
              Add color stop
            </button>
            {(value.gradient.type === 'linear'
              ? [['angle', 'Gradient angle', 360]]
              : [
                  ['x', 'Radial center X', 100],
                  ['y', 'Radial center Y', 100],
                ]
            ).map(([k, label, max]) => (
              <label className="studio-range" key={k}>
                <span>
                  {label}
                  <output>{value.gradient[k as 'angle' | 'x' | 'y']}</output>
                </span>
                <input
                  aria-label={String(label)}
                  type="range"
                  min={0}
                  max={Number(max)}
                  value={value.gradient[k as 'angle' | 'x' | 'y']}
                  onChange={(e) =>
                    gradient({ [String(k)]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
            <label className="studio-range">
              <span>
                Gradient intensity<output>{value.gradient.intensity}%</output>
              </span>
              <input
                aria-label="Gradient intensity"
                type="range"
                min={0}
                max={40}
                value={value.gradient.intensity}
                onChange={(e) =>
                  gradient({ intensity: Number(e.target.value) })
                }
              />
            </label>
          </>
        )}
      </fieldset>
      <details className="studio-effects" open>
        <summary>Surface, spacing & motion</summary>
        {controls.map(([k, label, min, max]) => (
          <label className="studio-range" key={k}>
            <span>
              {label}
              <output>
                {value[k]}
                {k === 'blur' || k === 'radius' || k === 'softness'
                  ? ' px'
                  : ''}
              </output>
            </span>
            <input
              type="range"
              aria-label={label}
              min={min}
              max={max}
              value={value[k]}
              onChange={(e) => update(k, Number(e.target.value))}
            />
          </label>
        ))}
        <p className="field-note">
          Opacity stays at 85% or higher for legibility. Blur is capped at 24
          px. Effects and foreground colors adjust when needed to preserve
          legibility. Reduced motion and forced colors override decoration.
        </p>
      </details>
      <div className="studio-actions">
        <button
          type="button"
          className="text-button primary"
          disabled={saving}
          onClick={() => void apply(value)}
        >
          Apply appearance
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setValue(defaultAppearance(value.mode === 'light'));
            setMessage('Default preview. Apply to save.');
          }}
        >
          Reset preview
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setValue(saved());
            setMessage('Saved appearance restored.');
          }}
        >
          Discard preview
        </button>
        <button
          type="button"
          className="text-button"
          disabled={saving}
          onClick={() => void apply(null)}
        >
          Use inherited appearance
        </button>
      </div>
      <div className="studio-transfer">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([exportTheme(value)], { type: 'application/json' }),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'sidekick-theme.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage(
              'Theme exported. No workspace or account data included.',
            );
          }}
        >
          Export theme
        </button>
        <label className="text-button">
          Import theme
          <input
            aria-label="Import theme file"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 20000) setError('Theme file exceeds 20 KB.');
                else
                  void f.text().then((t) => {
                    try {
                      setValue(parseTheme(t));
                      setMessage('Imported preview. Apply to save.');
                      setError('');
                    } catch {
                      setError(
                        'Invalid theme file. Your saved appearance was preserved.',
                      );
                    }
                  });
              }
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="field-note" role="status">
        {message}
      </p>
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
