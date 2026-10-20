import { useState } from 'preact/hooks';
import { Bezel } from './Bezel.tsx';
import { ZONE_TYPE_LABEL, type Zone, type ZoneType } from '../state.ts';

const TYPES: ZoneType[] = ['fitting', 'floor', 'register'];

export function ZoneForm({ initial, onSave, cta = 'Save zone' }: { initial: Zone | null; onSave: (z: Zone) => void; cta?: string }) {
  const [name, setName] = useState(initial?.name ?? 'Fitting Room 2');
  const [type, setType] = useState<ZoneType>(initial?.type ?? 'fitting');
  const ok = name.trim().length > 0;
  return (
    <form onSubmit={(ev) => { ev.preventDefault(); if (ok) onSave({ name: name.trim().slice(0, 40), type }); }}>
      <Bezel>
      <label class="field">
        <span>Zone name</span>
        <input class="input" value={name} maxLength={40} autoComplete="off" onInput={(e) => setName((e.target as HTMLInputElement).value)} aria-label="Zone name" />
      </label>
      <fieldset class="seg" aria-label="Zone type">
        <legend>Zone type</legend>
        {TYPES.map((t) => (
          <label key={t} class={type === t ? 'on' : ''}>
            <input type="radio" name="zt" value={t} checked={type === t} onChange={() => setType(t)} />
            {ZONE_TYPE_LABEL[t]}
          </label>
        ))}
      </fieldset>
      {type === 'register' && <p class="muted">Register zones log “Checkout” quietly instead of sounding an alarm.</p>}
      <button class="btn btn-primary" type="submit" disabled={!ok}>{cta}</button>
      </Bezel>
    </form>
  );
}
