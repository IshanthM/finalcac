/** Phosphor Light icons (official @phosphor-icons/core assets, inlined at build time). One family, one stroke weight. */
import arrowUpRight from '@phosphor-icons/core/assets/light/arrow-up-right-light.svg?raw';
import arrowRight from '@phosphor-icons/core/assets/light/arrow-right-light.svg?raw';
import bell from '@phosphor-icons/core/assets/light/bell-ringing-light.svg?raw';
import broadcast from '@phosphor-icons/core/assets/light/broadcast-light.svg?raw';
import bug from '@phosphor-icons/core/assets/light/bug-light.svg?raw';
import chart from '@phosphor-icons/core/assets/light/chart-bar-light.svg?raw';
import check from '@phosphor-icons/core/assets/light/check-light.svg?raw';
import clock from '@phosphor-icons/core/assets/light/clock-light.svg?raw';
import caretLeft from '@phosphor-icons/core/assets/light/caret-left-light.svg?raw';
import lock from '@phosphor-icons/core/assets/light/lock-simple-light.svg?raw';
import mapPin from '@phosphor-icons/core/assets/light/map-pin-light.svg?raw';
import mic from '@phosphor-icons/core/assets/light/microphone-light.svg?raw';
import play from '@phosphor-icons/core/assets/light/play-light.svg?raw';
import shield from '@phosphor-icons/core/assets/light/shield-check-light.svg?raw';
import sliders from '@phosphor-icons/core/assets/light/sliders-horizontal-light.svg?raw';
import storefront from '@phosphor-icons/core/assets/light/storefront-light.svg?raw';
import waveform from '@phosphor-icons/core/assets/light/waveform-light.svg?raw';
import wifiSlash from '@phosphor-icons/core/assets/light/wifi-slash-light.svg?raw';
import copy from '@phosphor-icons/core/assets/light/copy-light.svg?raw';
import house from '@phosphor-icons/core/assets/light/house-simple-light.svg?raw';
import gear from '@phosphor-icons/core/assets/light/gear-six-light.svg?raw';
import squares from '@phosphor-icons/core/assets/light/squares-four-light.svg?raw';
import chevron from '@phosphor-icons/core/assets/light/caret-right-light.svg?raw';
import info from '@phosphor-icons/core/assets/light/info-light.svg?raw';
import user from '@phosphor-icons/core/assets/light/user-light.svg?raw';

const ICONS = {
  arrow: arrowUpRight, next: arrowRight, bell, broadcast, bug, chart, check, clock, back: caretLeft, lock, pin: mapPin, mic, play,
  shield, tune: sliders, store: storefront, wave: waveform, offline: wifiSlash, user, copy, house, gear, squares, chevron, info,
} as const;

export type IconName = keyof typeof ICONS;

/** Decorative by default (the text next to it names the control); pass `label` when it stands alone. */
export function Icon({ name, label, cls = '' }: { name: IconName; label?: string; cls?: string }) {
  return (
    <span
      class={`icon ${cls}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      // Static, bundled SVG markup from the icon package; never user input.
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
