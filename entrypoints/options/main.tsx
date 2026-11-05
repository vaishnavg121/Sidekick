import { createRoot } from 'react-dom/client';
import { Sidebar } from '../../ui/Sidebar';
import { useSidebar } from '../../lib/store';
import '../../ui/style.css';
useSidebar.getState().setSettings(true);
createRoot(document.getElementById('root')!).render(
  <div className="options-shell">
    <Sidebar nativePanel embedded />
  </div>,
);
