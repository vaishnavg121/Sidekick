import { useEffect, useState } from 'react';
import { useSidebar } from '../lib/store';
export function useTheme(): 'light' | 'dark' {
  const selected = useSidebar(
    (s) =>
      s.metadata?.workspaces.find((w) => w.id === s.metadata?.activeWorkspaceId)
        ?.theme ?? 'dark',
  );
  const [systemLight, setSystemLight] = useState(
    () => matchMedia('(prefers-color-scheme: light)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: light)');
    const changed = () => setSystemLight(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return selected === 'system' ? (systemLight ? 'light' : 'dark') : selected;
}
