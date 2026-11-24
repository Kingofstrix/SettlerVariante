// Kartenwahl in der Lobby: Reiter für die Variante (Grundspiel / Seefahrer), darunter jede Karte der
// Variante mit Vorschau und den Stimmen der Spieler.
import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import {
  KARTEN_NAME,
  KARTEN_TEXT,
  VARIANTEN,
  VARIANTE_NAME,
  feldKoordinaten,
  istSeeKarte,
  kartenFuer,
  seeFelder,
  standardKarte,
  zaehleStimmen,
  type KartenId,
  type Variante,
} from '../engine';
import { farbHex, type SitzInfo } from '../netz/sitzung';

const W3 = Math.sqrt(3);

/** Alle Felder als ein Pfad: Sechsecke (Spitze oben) mit Radius r, um dy nach unten versetzt. */
function sechsecke(mitten: [number, number][], r: number, dy = 0): string {
  return mitten
    .map(
      ([x, y]) =>
        'M' +
        Array.from({ length: 6 }, (_, i) => {
          const w = (Math.PI / 180) * (60 * i - 30);
          return `${(x + Math.cos(w) * r).toFixed(2)},${(y + dy + Math.sin(w) * r).toFixed(2)}`;
        }).join('L') +
        'Z',
    )
    .join('');
}

const mitteVon = ([q, r]: [number, number]): [number, number] => [W3 * (q + r / 2), 1.5 * r];

/** Umriss einer Karte im Stil des Bretts. Zeigt nur die Form: Gelände und Zahlen werden bei jedem Spiel neu verteilt.
 *  Seefahrer-Karten zeigen zusätzlich die Inseln abseits (heller) und die Goldfelder. */
export function KartenBild({ karte, gross }: { karte: KartenId; gross: boolean }): JSX.Element {
  const { box, insel, kante, felder, abseits, gold } = useMemo(() => {
    const mitten = feldKoordinaten(karte, gross).map(mitteVon);
    const see = istSeeKarte(karte) ? seeFelder(karte, gross) : [];
    const art = (a: string): [number, number][] => see.filter((f) => f.art === a).map((f) => mitteVon([f.q, f.r]));
    const xs = mitten.map((m) => m[0]);
    const ys = mitten.map((m) => m[1]);
    const rand = 1.6;
    const x0 = Math.min(...xs) - rand;
    const y0 = Math.min(...ys) - rand;
    return {
      box: `${x0} ${y0} ${Math.max(...xs) + rand - x0} ${Math.max(...ys) + rand - y0}`,
      insel: sechsecke(mitten, 1),
      kante: sechsecke(mitten, 0.9, 0.09),
      felder: sechsecke(mitten, 0.9),
      abseits: sechsecke(art('insel'), 0.9),
      gold: sechsecke(art('gold'), 0.9),
    };
  }, [karte, gross]);
  return (
    <svg class="kartenbild" viewBox={box} aria-hidden="true">
      <path d={insel} class="kb-saum" />
      <path d={insel} class="kb-sockel" transform="translate(0 0.14)" />
      <path d={insel} class="kb-strand" />
      <path d={kante} class="kb-kante" />
      <path d={felder} class="kb-feld" />
      {abseits && <path d={abseits} class="kb-abseits" />}
      {gold && <path d={gold} class="kb-gold" />}
    </svg>
  );
}

function aufzaehlung(namen: string[]): string {
  return namen.length <= 1 ? (namen[0] ?? '') : `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`;
}

/** Reiter „Grundspiel / Seefahrer“. Ohne onWahl (Mitspieler, Beamer) nur Anzeige. */
export function VariantenReiter({ variante, onWahl }: { variante: Variante; onWahl?: (v: Variante) => void }): JSX.Element {
  return (
    <div class={`reiter varianten-reiter ${variante === 'seefahrer' ? 'see' : ''}`} role="tablist" aria-label="Spielvariante">
      {VARIANTEN.map((v) => (
        <button
          role="tab"
          aria-selected={variante === v}
          class={`reiter-knopf ${variante === v ? 'an' : ''}`}
          disabled={!onWahl && variante !== v}
          data-tip={!onWahl && variante !== v ? 'Die Variante wählt der Host.' : undefined}
          onClick={() => onWahl?.(v)}
        >
          {v === 'seefahrer' ? '⛵ ' : '🏝️ '}
          {VARIANTE_NAME[v]}
        </button>
      ))}
    </div>
  );
}

export function Kartenwahl({
  sitze,
  meinSitz,
  onStimme,
  variante,
  onVariante,
}: {
  sitze: SitzInfo[];
  meinSitz: number | null;
  /** Fehlt für Zuschauer (Beamer): Die Karten sind dann nicht anklickbar. */
  onStimme?: (karte: KartenId | null) => void;
  variante: Variante;
  /** Nur beim Host: Variante umschalten. */
  onVariante?: (v: Variante) => void;
}): JSX.Element {
  const gross = sitze.length >= 5;
  const karten = kartenFuer(variante);
  const zaehlung = zaehleStimmen(sitze.map((s) => s.stimme), variante);
  const meine = meinSitz !== null ? (sitze[meinSitz]?.stimme ?? null) : null;
  const gleichstand = zaehlung.abgegeben > 0 && zaehlung.vorn.length > 1;
  const stand =
    zaehlung.abgegeben === 0
      ? `Noch keine Stimmen. Ohne Stimmen wird ${KARTEN_NAME[standardKarte(variante)]} gespielt.`
      : gleichstand
        ? `Gleichstand zwischen ${aufzaehlung(zaehlung.vorn.map((k) => KARTEN_NAME[k]))}. Beim Start entscheidet das Los.`
        : `${KARTEN_NAME[zaehlung.vorn[0]]} liegt vorn.`;
  return (
    <section class={`tafel kartenwahl ${variante === 'seefahrer' ? 'see' : ''}`}>
      <VariantenReiter variante={variante} onWahl={onVariante} />
      <h2>
        Karte <small>{onStimme ? 'Klick auf eine Karte gibt ihr deine Stimme. Die meisten Stimmen gewinnen.' : 'Die Spieler stimmen ab.'}</small>
      </h2>
      {variante === 'seefahrer' && (
        <p class="hinweis see-hinweis">
          ⛵ <b>Seefahrer:</b> Schiffe (Holz + Wolle) fahren übers Meer, die erste Siedlung auf jeder neuen Insel bringt +2 Siegpunkte,
          Goldfelder liefern Rohstoffe nach Wahl, und der Pirat lauert auf dem Wasser. Empfohlen: 12 oder 14 Siegpunkte.
        </p>
      )}
      <div class="karten-reihe">
        {karten.map((k) => {
          const waehler = sitze.filter((s) => s.stimme === k);
          const vorn = zaehlung.abgegeben > 0 && zaehlung.vorn.includes(k);
          const inhalt = (
            <>
              <span class="karten-vorschau">
                <KartenBild karte={k} gross={gross} />
                {vorn && <span class="karten-marke">{gleichstand ? 'Gleichauf' : 'Vorn'}</span>}
              </span>
              <b class="karten-name">{KARTEN_NAME[k]}</b>
              <span class="karten-text">{KARTEN_TEXT[k]}</span>
              <span class="karten-stimmen">
                {waehler.map((s) => (
                  <i class="punkt gross" style={{ background: farbHex(s.farbe) }} data-tip={s.name} />
                ))}
                <span class="karten-zahl">
                  {waehler.length === 0 ? 'Keine Stimme' : waehler.length === 1 ? '1 Stimme' : `${waehler.length} Stimmen`}
                  {meine === k && ' · deine'}
                </span>
              </span>
            </>
          );
          const klasse = `kartenkarte ${meine === k ? 'gewaehlt' : ''} ${vorn ? 'vorn' : ''}`;
          return onStimme ? (
            <button class={klasse} aria-pressed={meine === k} onClick={() => onStimme(meine === k ? null : k)}>
              {inhalt}
            </button>
          ) : (
            <div class={klasse}>{inhalt}</div>
          );
        })}
      </div>
      <p class="hinweis karten-stand" aria-live="polite">
        {stand} {gross ? 'Gezeigt ist die große Fassung für 5–6 Spieler.' : 'Gezeigt ist die Fassung für 3–4 Spieler.'}
      </p>
    </section>
  );
}
