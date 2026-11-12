// Eigene SVG-Symbole (24×24). Rohstoffe sind zusätzlich zur Farbe an der Form erkennbar.
import type { JSX } from 'preact';
import type { EntwTyp, Rohstoff } from '../engine';

/** Kartenfarbe je Rohstoff; die Werte stehen in tokens.css. */
export const ROHSTOFF_FARBE: Record<Rohstoff, string> = {
  holz: 'var(--r-holz)',
  lehm: 'var(--r-lehm)',
  wolle: 'var(--r-wolle)',
  getreide: 'var(--r-getreide)',
  erz: 'var(--r-erz)',
};

export function rohstoffForm(typ: Rohstoff): JSX.Element {
  switch (typ) {
    case 'holz':
      return (
        <g>
          <rect x="10.4" y="17" width="3.2" height="6" rx="0.8" fill="#7a4a21" />
          <path d="M12 1.5 18 10h-3l4.5 8h-15L9 10H6z" fill="#1f6b3c" stroke="#0f3d22" stroke-width="1" stroke-linejoin="round" />
        </g>
      );
    case 'lehm':
      return (
        <g fill="#b5482a" stroke="#6e2513" stroke-width="1">
          <rect x="2" y="4.5" width="9.5" height="6.5" rx="1" />
          <rect x="12.5" y="4.5" width="9.5" height="6.5" rx="1" />
          <rect x="7.2" y="13" width="9.6" height="6.5" rx="1" />
        </g>
      );
    case 'wolle':
      return (
        <g>
          <rect x="7" y="16" width="2" height="5" fill="#333" />
          <rect x="13" y="16" width="2" height="5" fill="#333" />
          <g fill="#fff" stroke="#55606b" stroke-width="1">
            <circle cx="8" cy="12" r="4.6" />
            <circle cx="13.5" cy="10.5" r="4.8" />
            <circle cx="12" cy="14.5" r="4.4" />
          </g>
          <ellipse cx="19" cy="11.5" rx="2.8" ry="3.4" fill="#2d2d2d" />
        </g>
      );
    case 'getreide':
      return (
        <g>
          <path d="M12 23V8" stroke="#9a6b00" stroke-width="1.6" stroke-linecap="round" />
          <g fill="#f0b90b" stroke="#9a6b00" stroke-width="0.8">
            <ellipse cx="12" cy="4.5" rx="2.2" ry="3.6" />
            <ellipse cx="8" cy="9" rx="2" ry="3.4" transform="rotate(-28 8 9)" />
            <ellipse cx="16" cy="9" rx="2" ry="3.4" transform="rotate(28 16 9)" />
            <ellipse cx="8" cy="15" rx="2" ry="3.4" transform="rotate(-28 8 15)" />
            <ellipse cx="16" cy="15" rx="2" ry="3.4" transform="rotate(28 16 15)" />
          </g>
        </g>
      );
    case 'erz':
      return (
        <g stroke="#3d4252" stroke-width="1" stroke-linejoin="round">
          <path d="M1.5 20.5 9 5l4 7 3-4 6.5 12.5z" fill="#6f768c" />
          <path d="M9 5l2.2 3.8-2 1.6-2.2-1.2z" fill="#f4f6fa" />
        </g>
      );
  }
}

export function RohstoffIcon({ typ, groesse = 22 }: { typ: Rohstoff; groesse?: number }): JSX.Element {
  return (
    <svg class="icon" viewBox="0 0 24 24" width={groesse} height={groesse} aria-hidden="true">
      {rohstoffForm(typ)}
    </svg>
  );
}

export function EntwIcon({ typ, groesse = 22 }: { typ: EntwTyp; groesse?: number }): JSX.Element {
  let form: JSX.Element;
  switch (typ) {
    case 'ritter':
      form = (
        <g stroke="#2b2f3a" stroke-width="1.2" stroke-linejoin="round">
          <path d="M12 2 20 5v6c0 5.5-3.5 9-8 11-4.5-2-8-5.5-8-11V5z" fill="#9aa3b5" />
          <path d="M12 6v12M7.5 10.5h9" stroke="#fff" stroke-width="2" />
        </g>
      );
      break;
    case 'siegpunkt':
      form = <path d="m12 2 3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z" fill="#f0b90b" stroke="#8a6500" stroke-width="1.2" stroke-linejoin="round" />;
      break;
    case 'strassenbau':
      form = (
        <g stroke-linecap="round">
          <path d="M4 20 10 4M20 20 14 4" stroke="#5b4a3a" stroke-width="2.4" />
          <path d="M12 5v3M12 11v3M12 17v3" stroke="#c9a35a" stroke-width="2" />
        </g>
      );
      break;
    case 'erfindung':
      form = (
        <g stroke="#6b5200" stroke-width="1.2">
          <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" fill="#ffd95a" />
          <path d="M9 19.5h6M10 22h4" stroke-linecap="round" stroke-width="1.6" />
        </g>
      );
      break;
    default:
      form = (
        <g fill="#f0b90b" stroke="#8a6500" stroke-width="1.1">
          <ellipse cx="12" cy="17" rx="8" ry="3.5" />
          <ellipse cx="12" cy="12.5" rx="8" ry="3.5" />
          <ellipse cx="12" cy="8" rx="8" ry="3.5" />
        </g>
      );
  }
  return (
    <svg class="icon" viewBox="0 0 24 24" width={groesse} height={groesse} aria-hidden="true">
      {form}
    </svg>
  );
}

const AUGEN: Record<number, [number, number][]> = {
  1: [[12, 12]],
  2: [[7, 7], [17, 17]],
  3: [[7, 7], [12, 12], [17, 17]],
  4: [[7, 7], [17, 7], [7, 17], [17, 17]],
  5: [[7, 7], [17, 7], [12, 12], [7, 17], [17, 17]],
  6: [[7, 6.5], [17, 6.5], [7, 12], [17, 12], [7, 17.5], [17, 17.5]],
};

export function Wuerfel({ wert, groesse = 44, rot = false }: { wert: number; groesse?: number; rot?: boolean }): JSX.Element {
  return (
    <svg class="wuerfel" viewBox="0 0 24 24" width={groesse} height={groesse} role="img" aria-label={`Würfel ${wert}`}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill={rot ? '#c8372d' : '#fffaf0'} stroke="#3a2c1c" stroke-width="1.2" />
      {(AUGEN[wert] ?? []).map(([x, y]) => (
        <circle cx={x} cy={y} r="2.1" fill={rot ? '#fff' : '#3a2c1c'} />
      ))}
    </svg>
  );
}

/** Kleine Symbole für die Spielerzeile (statt Emojis, die je nach System anders aussehen). */
export function KartenIcon({ entw = false, groesse = 14 }: { entw?: boolean; groesse?: number }): JSX.Element {
  return (
    <svg class="icon" viewBox="0 0 24 24" width={groesse} height={groesse} aria-hidden="true">
      <rect x="5" y="2" width="14" height="20" rx="2.5" fill={entw ? '#d9c8f5' : '#fff'} stroke="#5a4630" stroke-width="2" />
      {entw ? <path d="m12 7 1.6 3.3 3.6.4-2.7 2.5.8 3.6L12 15l-3.3 1.8.8-3.6-2.7-2.5 3.6-.4z" fill="#6b4fb3" /> : <path d="M8.5 8h7M8.5 12h7M8.5 16h4" stroke="#b9a98f" stroke-width="1.6" stroke-linecap="round" />}
    </svg>
  );
}
