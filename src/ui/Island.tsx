import { go, goBack, useRoute } from '../state.ts';
import { Icon } from './Icon.tsx';

/** Floating glass island: brand on the left, a Back control on every screen except home. */
export function Island({ backHref }: { backHref?: string }) {
  const route = useRoute();
  const home = backHref ? false : route === '' || route === '/';
  return (
    <header class="island">
      <a class="island-brand" href={backHref ?? '#/'} onClick={backHref ? undefined : (e) => { e.preventDefault(); go(''); }} aria-label="Resonance home">
        <span class="mark" aria-hidden="true" />
        <span>Resonance</span>
      </a>
      {!home && (backHref
        ? <a class="island-back" href={backHref} aria-label="Back to the app"><Icon name="back" /><span>App</span></a>
        : <button class="island-back" onClick={() => goBack()} aria-label="Go back"><Icon name="back" /><span>Back</span></button>)}
    </header>
  );
}
