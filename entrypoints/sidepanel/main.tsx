import { createRoot } from 'react-dom/client';
import { Sidebar } from '../../ui/Sidebar';
import '../../ui/style.css';
createRoot(document.getElementById('root')!).render(<Sidebar nativePanel />);
