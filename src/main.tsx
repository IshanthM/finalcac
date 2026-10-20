import { render } from 'preact';
import './style.css';
import { engine } from './audio/engine.ts';
import { getState, useRoute } from './state.ts';
import { Calibrate } from './ui/Calibrate.tsx';
import { Debug } from './ui/Debug.tsx';
import { Demo } from './ui/Demo.tsx';
import { Home } from './ui/Home.tsx';

engine.setProfile(getState().profile);
const debug = new URLSearchParams(location.search).get('debug') === '1';

function App() {
  const route = useRoute();
  if (debug) return <Debug />;
  if (route === 'calibrate') return <Calibrate />;
  if (route === 'demo') return <Demo />;
  return <Home />;
}

render(<App />, document.getElementById('app')!);
