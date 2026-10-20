import { render } from 'preact';
import './style.css';
import { Debug } from './ui/Debug.tsx';
import { Home } from './ui/Home.tsx';

const debug = new URLSearchParams(location.search).get('debug') === '1';
render(debug ? <Debug /> : <Home />, document.getElementById('app')!);
