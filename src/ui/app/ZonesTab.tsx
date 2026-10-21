import { useAlarms } from '../../alert/alarm.ts';
import { useIncidents } from '../../hub/incidents.ts';
import { useRuntime } from '../../runtime.ts';
import { useAppState, type ZoneType } from '../../state.ts';
import { Icon, type IconName } from '../Icon.tsx';
import { useEngine } from '../useEngine.ts';
import { Head } from './parts.tsx';

const TYPE_ICON: Record<ZoneType, IconName> = { fitting: 'user', floor: 'squares', register: 'store' };
const TYPE_LABEL: Record<ZoneType, string> = { fitting: 'Fitting room', floor: 'Floor', register: 'Register' };

interface Tile { name: string; type: ZoneType; online: boolean; sub?: string }

export function ZonesTab({ openZoneSheet }: { openZoneSheet: () => void }) {
  const s = useAppState();
  const rt = useRuntime();
  const e = useEngine();
  const alarms = useAlarms();
  const incidents = useIncidents();
  const openZones = new Set([...alarms.map((a) => a.zone), ...incidents.filter((i) => i.kind === 'tamper' && !i.ackedAt && !i.test).map((i) => i.zone)]);

  let tiles: Tile[];
  if (s.role === 'demo' && s.zone) tiles = [{ name: s.zone.name, type: s.zone.type, online: e.info.state === 'running', sub: e.info.state === 'running' ? 'Listening' : 'This phone' }];
  else tiles = rt.zones.map((z) => ({ name: z.name, type: z.type, online: z.online, sub: z.online ? 'Listening' : 'Offline' }));

  return (
    <div class="screen">
      <Head title="Zones" sub={tiles.length ? 'Lit zones are listening' : undefined} />
      {tiles.length === 0 ? (
        <div class="group"><div class="empty"><Icon name="squares" /><strong>No zones yet</strong><span>{s.role === 'staff' ? 'On another phone, choose Listener and enter this store’s code.' : 'Start a listener to see zones here.'}</span></div></div>
      ) : (
        <div class="tiles">
          {tiles.map((t) => {
            const alarm = openZones.has(t.name);
            return (
              <div key={t.name} class={`tile ${alarm ? 'alarm' : t.online ? 'on' : 'off'}`}>
                <Icon name={TYPE_ICON[t.type]} />
                <div><div class="tile-name">{t.name}</div><div class="tile-state">{alarm ? 'Tamper' : `${TYPE_LABEL[t.type]}, ${t.sub ?? ''}`}</div></div>
              </div>
            );
          })}
        </div>
      )}
      {(s.role === 'demo' || s.role === 'listener') && <div class="actions"><button class="btn btn-tint" onClick={openZoneSheet}>Change this phone’s zone</button></div>}
    </div>
  );
}
