const PATHS = {
  arrow: 'M7 17 17 7M8 7h9v9',
  mic: 'M12 15a3 3 0 0 0 3-3V7a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm0 0v4m-5-7a5 5 0 0 0 10 0',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0',
  ring: 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.7 4.7a10.4 10.4 0 0 0 0 14.6M19.3 4.7a10.4 10.4 0 0 1 0 14.6',
  play: 'M8 5.5v13l10.5-6.5L8 5.5Z',
  tune: 'M4 8h9m4 0h3M4 16h3m4 0h9M15 6v4M9 14v4',
  chart: 'M5 20V11m7 9V4m7 16v-6',
  bug: 'M9 9h6v6a3 3 0 0 1-6 0V9Zm3-4v4M4.5 12H9m6 0h4.5M6 7l3 2m9-2-3 2M6 19l3-2m9 2-3-2',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  store: 'M4 10v9h16v-9M3 10l1.5-5h15L21 10M9 19v-5h6v5',
  staff: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  back: 'm14 6-6 6 6 6',
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative by default (the text next to it names the control); pass `label` when it stands alone. */
export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label} focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
