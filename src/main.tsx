import { render } from 'preact';
import './style.css';
import { engine } from './audio/engine.ts';
import { getState, useRoute } from './state.ts';
import { Calibrate } from './ui/Calibrate.tsx';
import { Debug } from './ui/Debug.tsx';
import { Console } from './ui/Console.tsx';
import { Demo } from './ui/Demo.tsx';
import { JoinStore } from './ui/JoinStore.tsx';
import { Listener } from './ui/Listener.tsx';
import { Home } from './ui/Home.tsx';

engine.setProfile(getState().profile);
const debug = new URLSearchParams(location.search).get('debug') === '1';

function App() {
  const route = useRoute();
  if (debug) return <Debug />;
  if (route === 'calibrate') return <Calibrate />;
  if (route === 'demo') return <Demo />;
  if (route === 'join/listener') return <JoinStore role="listener" next="listener" />;
  if (route === 'join/staff') return <JoinStore role="staff" next="console" />;
  if (route === 'listener') return <Listener />;
  if (route === 'console') return <Console />;
  return <Home />;
}

render(<App />, document.getElementById('app')!);

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
