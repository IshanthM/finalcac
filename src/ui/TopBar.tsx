import { go, goBack } from '../state.ts';
import { Icon } from './Icon.tsx';

/** Back button plus an optional label on the right. Every sub-screen starts with one so nobody gets stuck. */
export function TopBar({ title, home = false }: { title?: string; home?: boolean }) {
  return (
    <div class="topbar">
      <button class="btn btn-quiet" onClick={() => (home ? go('') : goBack())} aria-label={home ? 'Back to home' : 'Go back'}>
        <Icon name="back" />Back
      </button>
      {title && <span class="eyebrow">{title}</span>}
    </div>
  );
}
