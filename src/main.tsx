import { render } from 'preact';
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import './style.css';
import { engine } from './audio/engine.ts';
import './ui/spotlight.ts';
import { getState, useRoute } from './state.ts';
import { Calibrate } from './ui/Calibrate.tsx';
import { Island } from './ui/Island.tsx';
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
  let screen = <Home />;
  if (debug) screen = <Debug />;
  else if (route === 'calibrate') screen = <Calibrate />;
  else if (route === 'demo') screen = <Demo />;
  else if (route === 'join/listener') screen = <JoinStore role="listener" next="listener" />;
  else if (route === 'join/staff') screen = <JoinStore role="staff" next="console" />;
  else if (route === 'listener') screen = <Listener />;
  else if (route === 'console') screen = <Console />;
  return <><Island backHref={debug ? import.meta.env.BASE_URL : undefined} />{screen}</>;
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
