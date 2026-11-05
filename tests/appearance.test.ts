import { describe, expect, it } from 'vitest';
import {
  APPEARANCE_PRESETS,
  appearanceVariables,
  cloneAppearance,
  contrastRatio,
  defaultAppearance,
  exportTheme,
  hexToHsv,
  hsvToHex,
  isAppearance,
  parseTheme,
} from '../lib/appearance';
import { createMetadata } from '../lib/models';
import {
  MetadataRepository,
  isMetadata,
  type StorageArea,
} from '../lib/repository';
import { exportBackup, mergeBackup } from '../lib/backup';
import { isCommand } from '../lib/protocol';
import { resolveAppearance } from '../ui/theme';

describe('appearance integrity and accessible tokens', () => {
  it.each(Object.keys(APPEARANCE_PRESETS))(
    '%s validates, round-trips and generates readable text',
    (name) => {
      const a = APPEARANCE_PRESETS[name]!;
      expect(isAppearance(a)).toBe(true);
      expect(parseTheme(exportTheme(a))).toEqual(a);
      const variables = appearanceVariables(a);
      for (const key of [
        '--sk-text',
        '--sk-muted',
        '--sk-accent',
        '--sk-secondary',
      ])
        expect(contrastRatio(variables[key]!, a.base)).toBeGreaterThanOrEqual(
          4.5,
        );
    },
  );
  it.each(['#ff0000', '#00ff00', '#0000ff', '#93b5d7', '#000000', '#ffffff'])(
    'color wheel round-trips %s',
    (hex) => {
      expect(hsvToHex(...hexToHsv(hex))).toBe(hex);
    },
  );
  it.each([
    { base: 'url(https://evil.test)' },
    { accent: 'red;display:none' },
    { blur: 1000 },
    { grain: -1 },
    { transparency: 0 },
    { motion: Infinity },
    { arbitraryCss: 'body{}' },
    { constructor: {} },
    {
      gradient: {
        type: 'linear',
        angle: 0,
        x: 0,
        y: 0,
        intensity: 100,
        stops: [],
      },
    },
  ] as Record<string, unknown>[])(
    'rejects unsafe or out-of-range theme values %j',
    (patch) => {
      const a = { ...defaultAppearance(), ...patch };
      expect(isAppearance(a)).toBe(false);
      expect(isCommand({ type: 'appearance.update', config: a })).toBe(false);
      expect(() =>
        parseTheme(JSON.stringify({ format: 'sidekick-theme', appearance: a })),
      ).toThrow();
    },
  );
  it('bounds gradient stops and rejects executable imports without changing existing state', () => {
    const a = defaultAppearance();
    a.gradient.stops[0]!.color = 'javascript:alert(1)';
    expect(isAppearance(a)).toBe(false);
    expect(() => parseTheme('{')).toThrow('JSON');
    expect(() => parseTheme('x'.repeat(20001))).toThrow('20 KB');
  });
  it('resolves workspace over global over legacy/system and restores inheritance', () => {
    const m = createMetadata(),
      id = m.activeWorkspaceId;
    m.workspaces[0]!.theme = 'system';
    expect(resolveAppearance(m, true).base).toBe(defaultAppearance(true).base);
    m.appearance = { global: cloneAppearance(APPEARANCE_PRESETS.Graphite!) };
    expect(resolveAppearance(m, true).base).toBe(
      APPEARANCE_PRESETS.Graphite!.base,
    );
    m.appearance.workspaces = {
      [id]: cloneAppearance(APPEARANCE_PRESETS['Deep Ocean']!),
    };
    expect(resolveAppearance(m, false).base).toBe(
      APPEARANCE_PRESETS['Deep Ocean']!.base,
    );
    delete m.appearance.workspaces[id];
    expect(resolveAppearance(m, false).base).toBe(
      APPEARANCE_PRESETS.Graphite!.base,
    );
  });
  it('preserves v0.2 data and IDs through appearance edits and clear operations', async () => {
    let data: Record<string, unknown> = {};
    const area: StorageArea = {
      get: async (k) => structuredClone({ [k]: data[k] }),
      set: async (v) => {
        data = { ...data, ...structuredClone(v) };
      },
    };
    const r = new MetadataRepository(area),
      before = await r.get(),
      a = defaultAppearance();
    expect(isMetadata(before)).toBe(true);
    await r.updateAppearance(a, before.activeWorkspaceId);
    const changed = await r.get();
    expect(changed.workspaces).toEqual(before.workspaces);
    expect(changed.preferences).toEqual(before.preferences);
    expect(changed.appearance?.workspaces?.[before.activeWorkspaceId]).toEqual(
      a,
    );
    await expect(r.updateAppearance(a, 'forged')).rejects.toThrow('Workspace');
    await r.updateAppearance(null, before.activeWorkspaceId);
    expect((await r.get()).appearance?.workspaces).toEqual({});
  });
  it('backs up appearance and remaps imported overrides without overwriting global preferences', () => {
    const old = createMetadata(),
      incoming = createMetadata();
    old.appearance = { global: defaultAppearance() };
    incoming.appearance = {
      global: defaultAppearance(true),
      workspaces: {
        [incoming.activeWorkspaceId]: cloneAppearance(
          APPEARANCE_PRESETS.Graphite!,
        ),
      },
    };
    const imported = mergeBackup(old, exportBackup(incoming));
    expect(isMetadata(imported)).toBe(true);
    expect(imported.appearance?.global).toEqual(old.appearance.global);
    expect(
      imported.appearance?.workspaces?.[imported.workspaces[1]!.id],
    ).toEqual(APPEARANCE_PRESETS.Graphite);
    expect(imported.workspaces[0]!.id).toBe(old.workspaces[0]!.id);
  });
  it('keeps tiny/large effect limits readable even when an accent matches the base', () => {
    const a = defaultAppearance();
    a.base = a.accent = '#777777';
    a.contrast = 85;
    expect(
      contrastRatio(appearanceVariables(a)['--sk-text']!, a.base),
    ).toBeGreaterThanOrEqual(4.5);
    a.surfaceOpacity = 100;
    expect(appearanceVariables(a)['--sk-surface']).toMatch(
      /rgb\(255 255 255 \/ 0\./,
    );
  });
});
