import { render } from 'preact';
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import './style.css';
import './models.css';
import './ui/spotlight.ts';
import { AppShell } from './ui/app/AppShell.tsx';
import { Debug } from './ui/Debug.tsx';

const debug = new URLSearchParams(location.search).get('debug') === '1';
render(debug ? <Debug /> : <AppShell />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const urls = performance.getEntriesByType('resource').map((r) => r.name).concat(location.href.split('#')[0]!);
        reg.active?.postMessage({ type: 'cache', urls });
      })
      .catch(() => undefined);
  });
}
