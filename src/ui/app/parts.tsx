import type { ComponentChildren } from 'preact';
import { goBack } from '../../state.ts';
import { Icon, type IconName } from '../Icon.tsx';

/** A tappable (or static) list row in an inset group: icon tile, title, subtitle, value and chevron. */
export function Row({ icon, tone = '', title, sub, value, onClick, href, chevron = true, external = false }: {
  icon?: IconName; tone?: '' | 'blue' | 'amber' | 'red'; title: string; sub?: string; value?: ComponentChildren; onClick?: () => void; href?: string; chevron?: boolean; external?: boolean;
}) {
  const inner = (
    <>
      {icon && <span class={`ico ${tone}`}><Icon name={icon} /></span>}
      <span class="row-main"><span class="row-title">{title}</span>{sub && <span class="row-sub">{sub}</span>}</span>
      {value !== undefined && <span class="row-val">{value}</span>}
      {(onClick || href) && chevron && <span class="row-val"><Icon name="chevron" /></span>}
    </>
  );
  if (href) return <a class="row" href={href} {...(external ? { target: '_blank', rel: 'noopener' } : {})}>{inner}</a>;
  if (onClick) return <button class="row" onClick={onClick}>{inner}</button>;
  return <div class="row">{inner}</div>;
}

export function Head({ title, sub, back, right }: { title: string; sub?: string; back?: boolean; right?: ComponentChildren }) {
  return (
    <header class="screen-head">
      <div>
        {back && <button class="btn btn-plain" style={{ marginLeft: '-8px', minHeight: '48px' }} onClick={() => goBack()} aria-label="Go back"><Icon name="back" />Back</button>}
        <h1 class="large">{title}</h1>
        {sub && <p class="sub">{sub}</p>}
      </div>
      {right}
    </header>
  );
}
