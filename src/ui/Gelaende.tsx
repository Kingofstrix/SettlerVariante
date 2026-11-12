// Geländebilder und Verläufe für die Hexfelder. Jedes Bild steht genau einmal in <defs>
// und wird je Feld per <use> eingesetzt. Ursprung ist die Feldmitte; der Zahlenchip sitzt darunter.
import type { JSX } from 'preact';
import type { Gelaende } from '../engine';

export const GELAENDE_ARTEN: Gelaende[] = ['wald', 'huegel', 'weide', 'acker', 'gebirge', 'wueste'];

function baum(x: number, y: number, s: number): JSX.Element {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <rect x="-3.5" y="-5" width="7" height="15" rx="2" fill="#6b4423" />
      <path d="M0,-46 16,-23H9L20,-4H-20L-9,-23H-16Z" fill="#1c5a36" />
      <path d="M0,-46-16,-23H-9L-20,-4H0Z" fill="#2f804e" />
      <path d="M0,-46 16,-23H9L20,-4H-20L-9,-23H-16Z" fill="none" stroke="#113c23" stroke-width="2.4" stroke-linejoin="round" />
    </g>
  );
}

function aehre(x: number, dreh: number): JSX.Element {
  return (
    <g transform={`translate(${x},-15) rotate(${dreh}) scale(0.9)`}>
      <path d="M0,0V-34" stroke="#8a5f00" stroke-width="3.2" stroke-linecap="round" />
      <g fill="#fff3ae" stroke="#8a5f00" stroke-width="1.7">
        <ellipse cx="0" cy="-53" rx="5.2" ry="9.5" />
        <ellipse cx="-7.5" cy="-42" rx="4.6" ry="8.4" transform="rotate(-26 -7.5 -42)" />
        <ellipse cx="7.5" cy="-42" rx="4.6" ry="8.4" transform="rotate(26 7.5 -42)" />
        <ellipse cx="-7.5" cy="-27" rx="4.6" ry="8.4" transform="rotate(-26 -7.5 -27)" />
        <ellipse cx="7.5" cy="-27" rx="4.6" ry="8.4" transform="rotate(26 7.5 -27)" />
      </g>
    </g>
  );
}

function bild(g: Gelaende): JSX.Element {
  switch (g) {
    case 'wald':
      return (
        <>
          {baum(-31, -24, 0.86)}
          {baum(31, -24, 0.86)}
          {baum(0, -30, 1.12)}
        </>
      );
    case 'huegel':
      return (
        <>
          <g fill="#a9461f" stroke="#6a2412" stroke-width="2.4" stroke-linejoin="round">
            <rect x="-34" y="-38" width="32" height="18" rx="3" />
            <rect x="2" y="-38" width="32" height="18" rx="3" />
            <rect x="-16" y="-60" width="32" height="18" rx="3" fill="#b9512a" />
          </g>
          <path d="M-29,-33.5h22M7,-33.5h22M-11,-55.5h22" stroke="#eba887" stroke-width="2.6" stroke-linecap="round" />
        </>
      );
    case 'weide':
      return (
        <>
          <path d="M-46,-14q3,-9 6,0M-39,-14q3,-7 6,0M38,-16q3,-9 6,0M45,-16q3,-7 6,0" fill="none" stroke="#5c8f30" stroke-width="2.6" stroke-linecap="round" />
          <rect x="-13" y="-30" width="5.5" height="14" rx="2" fill="#35373d" />
          <rect x="5" y="-30" width="5.5" height="14" rx="2" fill="#35373d" />
          <g fill="#fff" stroke="#5b6670" stroke-width="2.2">
            <circle cx="-13" cy="-41" r="13" />
            <circle cx="3" cy="-47" r="14" />
            <circle cx="6" cy="-35" r="12" />
            <circle cx="-4" cy="-37" r="11" stroke="none" />
          </g>
          <ellipse cx="24" cy="-44" rx="8.5" ry="10.5" fill="#35373d" />
          <ellipse cx="17" cy="-52" rx="4.5" ry="2.6" fill="#35373d" transform="rotate(-28 17 -52)" />
        </>
      );
    case 'acker':
      return (
        <>
          {aehre(-25, -13)}
          {aehre(25, 13)}
          {aehre(0, 0)}
        </>
      );
    case 'gebirge':
      return (
        <>
          <path d="M-54,-14-20,-70 3,-36 19,-55 52,-14Z" fill="#646a80" />
          <path d="M-54,-14-20,-70-9,-14ZM3,-36 19,-55 15,-14H-2Z" fill="#7d849b" />
          <path d="M-20,-70l10,14.5-8,5-6-7-7,6ZM19,-55l9,11-6,3-5-4.5-5,3.5Z" fill="#f8fafd" />
          <path d="M-54,-14-20,-70 3,-36 19,-55 52,-14Z" fill="none" stroke="#3b4050" stroke-width="2.6" stroke-linejoin="round" />
        </>
      );
    case 'wueste':
      return (
        <>
          <g fill="#86b44f" stroke="#4f7a2a" stroke-width="2.2" stroke-linejoin="round">
            <path d="M-5,-18v-34a5,5 0 0 1 10,0v34Z" />
            <path d="M5,-34h8v-8a4,4 0 0 1 8,0v11a5,5 0 0 1-5,5h-11Z" />
            <path d="M-5,-28h-7v-7a4,4 0 0 0-8,0v10a5,5 0 0 0 5,5h10Z" />
          </g>
          <path d="M-50,10q25,-26 50,0t50,0M-36,40q18,-19 36,0t36,0" fill="none" stroke="#c2a565" stroke-width="6" stroke-linecap="round" />
        </>
      );
  }
}

/** Verläufe und Geländebilder für die <defs> der Grundebene. */
export function GelaendeDefs(): JSX.Element {
  return (
    <>
      {GELAENDE_ARTEN.map((g) => (
        <linearGradient id={`v-${g}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={`stop-color:var(--g-${g}-1)`} />
          <stop offset="1" style={`stop-color:var(--g-${g}-2)`} />
        </linearGradient>
      ))}
      {GELAENDE_ARTEN.map((g) => (
        <g id={`a-${g}`}>{bild(g)}</g>
      ))}
    </>
  );
}
