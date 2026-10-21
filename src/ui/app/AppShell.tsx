import { useEffect, useState } from 'preact/hooks';
import { engine } from '../../audio/engine.ts';
import { useIncidents } from '../../hub/incidents.ts';
import { chooseRole, acknowledgeAlert, syncRuntime } from '../../runtime.ts';
import { go, setState, useAppState, useRoute } from '../../state.ts';
import { AlertOverlay } from '../AlertOverlay.tsx';
import { Mark } from '../Brand.tsx';
import { Calibrate } from '../Calibrate.tsx';
import { Icon, type IconName } from '../Icon.tsx';
import { JoinStore } from '../JoinStore.tsx';
import { Sheet } from '../Sheet.tsx';
import { ZoneForm } from '../ZoneForm.tsx';
import { About } from './About.tsx';
import { AlertsTab } from './AlertsTab.tsx';
import { HomeTab } from './HomeTab.tsx';
import { Row } from './parts.tsx';
import { SettingsTab } from './SettingsTab.tsx';
import { Welcome } from './Welcome.tsx';
import { ZonesTab } from './ZonesTab.tsx';

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: '', label: 'Home', icon: 'house' },
  { id: 'alerts', label: 'Alerts', icon: 'bell' },
  { id: 'zones', label: 'Zones', icon: 'squares' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];

function activeTab(route: string): string {
  if (route === 'alerts' || route === 'zones' || route === 'settings') return route;
  if (route === 'calibrate' || route === 'about') return 'settings';
  return '';
}

export function AppShell() {
  const s = useAppState();
  const route = useRoute();
  const incidents = useIncidents();
  const [sheet, setSheet] = useState<'zone' | 'role' | null>(null);
  const openCount = incidents.filter((i) => i.kind === 'tamper' && !i.ackedAt && !i.test).length;

  // Keep the role runtime in step with role, store and zone; keep the detector's profile current.
  useEffect(() => { syncRuntime(); }, [s.role, s.storeCode, s.zone?.name, s.zone?.type]);
  useEffect(() => { engine.setProfile(s.profile); }, [s.profile]);
  // A listener or demo with no zone gets the zone sheet straight away.
  useEffect(() => { if ((s.role === 'listener') && s.storeCode && !s.zone && route === '') setSheet('zone'); }, [s.role, s.storeCode, s.zone, route]);

  const tab = activeTab(route);
  const showWelcome = route === 'welcome' || (!s.welcomed && route === '');

  let screen;
  if (route === 'alerts') screen = <AlertsTab />;
  else if (route === 'zones') screen = <ZonesTab openZoneSheet={() => setSheet('zone')} />;
  else if (route === 'settings') screen = <SettingsTab openRoleSheet={() => setSheet('role')} openZoneSheet={() => setSheet('zone')} />;
  else if (route === 'about') screen = <About />;
  else if (route === 'calibrate') screen = <Calibrate />;
  else if (route === 'join/listener') screen = <JoinStore role="listener" next="" />;
  else if (route === 'join/staff') screen = <JoinStore role="staff" next="" />;
  else screen = <HomeTab openZoneSheet={() => setSheet('zone')} />;

  return (
    <>
      <nav class="nav" aria-label="Main">
        <div class="nav-brand"><Mark />Resonance</div>
        {TABS.map((t) => (
          <a key={t.id} class="nav-item" href={`#/${t.id}`} aria-current={tab === t.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); go(t.id); }}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
            {t.id === 'alerts' && openCount > 0 && <span class="badge-dot" aria-label={`${openCount} open`}>{openCount}</span>}
          </a>
        ))}
      </nav>
      <main class="content">{screen}</main>

      <AlertOverlay onAck={(id) => acknowledgeAlert(id)} />
      {showWelcome && <Welcome onDone={() => { if (route === 'welcome') go(''); }} />}

      {sheet === 'zone' && (
        <Sheet title="This phone's zone" onClose={() => setSheet(null)}>
          <p class="muted">Each phone gets a zone, so staff know where a ring was heard.</p>
          <ZoneForm initial={s.zone} cta="Save zone" onSave={(z) => { setState({ zone: z }); setSheet(null); }} />
        </Sheet>
      )}
      {sheet === 'role' && (
        <Sheet title="What is this phone for?" onClose={() => setSheet(null)}>
          <div class="group">
            <Row icon="play" title="Demo" sub="One phone plays both roles" onClick={() => { chooseRole('demo'); setSheet(null); go(''); }} />
            <Row icon="mic" tone="blue" title="Listener" sub="Hears tag rings in its zone" onClick={() => { chooseRole('listener'); setSheet(null); go(s.storeCode ? '' : 'join/listener'); }} />
            <Row icon="bell" tone="amber" title="Staff console" sub="Gets alerts and sees zones" onClick={() => { chooseRole('staff'); setSheet(null); go(s.storeCode ? '' : 'join/staff'); }} />
          </div>
        </Sheet>
      )}
    </>
  );
}
