import { useEffect, useState, type CSSProperties } from 'react';
import { useSidebar } from '../lib/store';
import { appearanceVariables, defaultAppearance } from '../lib/appearance';
import type { Metadata } from '../lib/models';
export function resolveAppearance(
  metadata: Metadata | undefined,
  systemLight: boolean,
) {
  const workspace = metadata?.workspaces.find(
    (w) => w.id === metadata.activeWorkspaceId,
  );
  const selected = workspace?.theme ?? 'dark';
  const legacyLight =
    selected === 'system' ? systemLight : selected === 'light';
  const config =
    metadata?.appearance?.workspaces?.[workspace?.id ?? ''] ??
    metadata?.appearance?.global ??
    defaultAppearance(legacyLight);
  // System mode uses a matching base while preserving the user's accent/effects.
  return config.mode === 'system'
    ? { ...config, base: defaultAppearance(systemLight).base }
    : config;
}
export function useAppearance() {
  const metadata = useSidebar((s) => s.metadata);
  const [systemLight, setSystemLight] = useState(
    () => matchMedia('(prefers-color-scheme: light)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: light)');
    const changed = () => setSystemLight(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  const config = resolveAppearance(metadata, systemLight);
  const variables = appearanceVariables(config);
  return {
    config,
    theme: variables['color-scheme'] as 'light' | 'dark',
    style: variables as CSSProperties,
  };
}
export function useTheme() {
  return useAppearance().theme;
}
