import { chime } from '../../alert/siren.ts';
import { unlockOutputs } from '../../alert/unlock.ts';
import { enableAlerts, leaveStore, useRuntime } from '../../runtime.ts';
import { go, useAppState } from '../../state.ts';
import { Head, Row } from './parts.tsx';

const ROLE: Record<string, string> = { demo: 'Demo', listener: 'Listener', staff: 'Staff console' };
const REPO = 'https://github.com/IshanthM/finalcac';

export function SettingsTab({ openRoleSheet, openZoneSheet }: { openRoleSheet: () => void; openZoneSheet: () => void }) {
  const s = useAppState();
  const rt = useRuntime();
  const base = import.meta.env.BASE_URL;
  return (
    <div class="screen">
      <Head title="Settings" />
      <p class="sect">This phone</p>
      <div class="group">
        <Row icon="user" title="Role" value={s.role ? ROLE[s.role] : 'Not set'} onClick={openRoleSheet} />
        {(s.role === 'listener' || s.role === 'demo') && <Row icon="pin" title="Zone" value={s.zone?.name ?? 'Not set'} onClick={openZoneSheet} />}
        {s.storeCode && <Row icon="store" tone="amber" title="Store code" value={<span class="mono">{s.storeCode}</span>} chevron={false} />}
        {s.storeCode && <Row icon="back" tone="red" title="Leave store" onClick={leaveStore} chevron={false} />}
      </div>

      <p class="sect">Tag</p>
      <div class="group">
        <Row icon="tune" tone="blue" title="Tag profile" sub="Ring a tag five times to teach phones what to hear" value={s.profile ? `${Math.round(s.profile.freqHz).toLocaleString('en-US')} Hz` : 'Not calibrated'} onClick={() => go('calibrate')} />
      </div>

      <p class="sect">Alerts</p>
      <div class="group">
        {s.role === 'staff' && <Row icon="bell" title="Siren and voice" sub="Tap once per session so this phone can play sound" value={rt.armed ? 'On' : 'Off'} onClick={enableAlerts} chevron={false} />}
        <Row icon="bell" title="Play a test chime" onClick={() => { unlockOutputs(); chime(); }} chevron={false} />
      </div>

      <p class="sect">About</p>
      <div class="group">
        <Row icon="info" title="How it works" onClick={() => go('about')} />
        <Row icon="play" title="Replay the welcome" onClick={() => go('welcome')} />
        <Row icon="chart" title="Event dashboard" value="Web" href={`${base}dashboard.html${s.storeCode ? `?store=${s.storeCode}` : ''}`} />
        <Row icon="bug" title="Debug recorder" sub="Record real rings as WAV files" href={`${base}?debug=1`} />
        <Row icon="next" title="Source code" value="GitHub" href={REPO} external />
      </div>
      <p class="muted" style={{ textAlign: 'center', marginTop: '24px', fontSize: '15px' }}>Resonance. Audio never leaves your phone.</p>
    </div>
  );
}
