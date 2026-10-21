import { go, goBack, useRoute } from '../state.ts';
import { Icon } from './Icon.tsx';

/** Brand mark: five bars that fade, like a ring dying away. */
function Mark() {
  return (
    <svg viewBox="0 0 22 16" aria-hidden="true" focusable="false">
      {[[0, 16], [4.5, 10], [9, 13], [13.5, 6], [18, 8]].map(([x, h]) => <rect key={x} x={x} y={(16 - h!) / 2} width="2.2" height={h} fill="currentColor" />)}
    </svg>
  );
}

/** Slim top bar: brand on the left, a Back control on every screen except home. */
export function Island({ backHref }: { backHref?: string }) {
  const route = useRoute();
  const home = backHref ? false : route === '' || route === '/';
  return (
    <header class="island">
      <a class="island-brand" href={backHref ?? '#/'} onClick={backHref ? undefined : (e) => { e.preventDefault(); go(''); }} aria-label="Resonance home">
        <Mark /><span>Resonance</span>
      </a>
      {!home && (backHref
        ? <a class="island-back" href={backHref} aria-label="Back to the app"><Icon name="back" /><span>App</span></a>
        : <button class="island-back" onClick={() => goBack()} aria-label="Go back"><Icon name="back" /><span>Back</span></button>)}
    </header>
  );
}
