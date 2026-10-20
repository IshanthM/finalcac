import { useState } from 'preact/hooks';
import { CODE_RE, createStore, normalizeCode, storeExists } from '../net/config.ts';
import { go, setState, type Role } from '../state.ts';
import { TopBar } from './TopBar.tsx';

/** Enter a short store code, or create a new store. */
export function JoinStore({ role, next }: { role: Extract<Role, 'listener' | 'staff'>; next: string }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const valid = CODE_RE.test(code);

  const finish = (c: string): void => { setState({ role, storeCode: c }); go(next); };
  const join = async (): Promise<void> => {
    setBusy(true); setErr('');
    try {
      if (await storeExists(code)) finish(code);
      else setErr('No store has that code. Check the code on the staff phone and try again.');
    } catch (e) {
      setErr(e instanceof Error ? `${e.message}. Check your connection and try again.` : 'Could not reach the relay. Check your connection and try again.');
    } finally { setBusy(false); }
  };
  const create = async (): Promise<void> => {
    setBusy(true); setErr('');
    try { finish(await createStore()); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Could not create a store.'); }
    finally { setBusy(false); }
  };

  return (
    <main class="page">
      <TopBar title={role === 'listener' ? 'Listener' : 'Staff'} home />
      <h1>{role === 'listener' ? 'Join a store' : 'Open the console'}</h1>
      <p class="lede">Enter the 6-character code from the staff phone, or start a new store.</p>
      <form class="panel" onSubmit={(ev) => { ev.preventDefault(); if (valid && !busy) void join(); }}>
        <label class="field">
          <span>Store code</span>
          <input
            class="input code" value={code} inputMode="text" autoCapitalize="characters" autoComplete="off" spellcheck={false}
            aria-label="Store code" aria-describedby="code-help" maxLength={9} placeholder="K7M2QX"
            onInput={(e) => setCode(normalizeCode((e.target as HTMLInputElement).value))}
          />
        </label>
        <p id="code-help" class="muted">Letters and numbers only.</p>
        <button class="btn btn-primary" type="submit" disabled={!valid || busy}>{busy ? 'Checking…' : 'Join store'}</button>
      </form>
      {err && <p class="error" role="alert">{err}</p>}
      <div class="actions">
        <button class="btn" onClick={() => void create()} disabled={busy}>Create a new store</button>
      </div>
    </main>
  );
}
