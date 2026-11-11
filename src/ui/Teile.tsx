// Bausteine, die Spieler- und Beameransicht gemeinsam nutzen.
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { Sicht } from '../engine';
import { farbHex, type TimerAnzeige } from '../netz/sitzung';
import { useRestzeit } from './hooks';
import { EntwIcon, KartenIcon, Wuerfel } from './Icons';

/** Kurzer Text, was gerade passiert. */
export function statusText(sicht: Sicht): { text: string; ich: boolean } {
  const name = (i: number): string => sicht.spieler[i].name;
  const ich = sicht.ich !== null && sicht.amZug.includes(sicht.ich);
  const wer = (i: number, verb: string, verbDu: string): string => (i === sicht.ich ? `Du bist dran: ${verbDu}` : `${name(i)} ${verb}`);
  switch (sicht.phase) {
    case 'ende':
      return { text: `${name(sicht.gewinner!)} hat gewonnen!`, ich: false };
    case 'setup': {
      const sp = sicht.amZug[0];
      const was = sicht.setup.erwartet === 'siedlung' ? 'Siedlung' : 'Straße';
      return { text: `Gründung – ${wer(sp, `setzt eine ${was}`, `${was} setzen`)}`, ich };
    }
    case 'wuerfeln':
      return { text: wer(sicht.aktiv, 'würfelt', 'würfeln'), ich };
    case 'abwerfen':
      return {
        text: ich ? 'Eine 7: Du musst Karten abwerfen' : `Eine 7 – es werfen ab: ${sicht.amZug.map(name).join(', ')}`,
        ich,
      };
    case 'raeuber':
      return { text: wer(sicht.aktiv, 'versetzt den Räuber', 'Räuber versetzen'), ich };
    case 'stehlen':
      return { text: wer(sicht.aktiv, 'wählt, wen er bestiehlt', 'jemanden bestehlen'), ich };
    case 'aktion':
      return sicht.freieStrassen > 0
        ? { text: wer(sicht.aktiv, 'baut kostenlose Straßen', `${sicht.freieStrassen} kostenlose Straße(n) bauen`), ich }
        : { text: wer(sicht.aktiv, 'handelt und baut', 'handeln und bauen'), ich };
    case 'sonderbau': {
      const sp = sicht.amZug[0];
      return { text: `Sonderbauphase – ${sp === sicht.ich ? 'du darfst bauen' : name(sp)}`, ich };
    }
  }
}

export function TimerBalken({ timer, pausiert }: { timer: TimerAnzeige | null; pausiert: boolean }): JSX.Element | null {
  const rest = useRestzeit(timer);
  if (pausiert) return <div class="timer pause">⏸ Pause</div>;
  if (!timer || rest === null) return null;
  const anteil = Math.max(0, Math.min(1, (rest * 1000) / timer.gesamtMs));
  const titel = timer.art === 'zug' ? 'Zugzeit' : timer.art === 'sonderbau' ? 'Sonderbau' : 'Abwerfen';
  return (
    <div class={`timer ${rest <= 10 ? 'knapp' : ''}`} role="timer" aria-label={`${titel}: ${rest} Sekunden`}>
      <div class="timer-fuellung" style={{ width: `${anteil * 100}%` }} />
      <span>
        {titel} · {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

export function SpielerTafel({ sicht, verbunden }: { sicht: Sicht; verbunden: boolean[] }): JSX.Element {
  return (
    <div class="spielerliste">
      {sicht.spieler.map((p) => {
        const dran = sicht.amZug.includes(p.id);
        const punkte = sicht.endstand ? sicht.endstand[p.id] : p.id === sicht.ich ? sicht.eigenePunkte! : p.punkte;
        return (
          <div class={`spielerzeile ${dran ? 'dran' : ''} ${p.id === sicht.ich ? 'ich' : ''}`}>
            <i class="punkt gross" style={{ background: farbHex(p.farbe) }} />
            <div class="sname">
              <b>{p.name}</b>
              {p.id === sicht.ich && <em> (du)</em>}
              {!verbunden[p.id] && <span class="marke warn">getrennt</span>}
              {sicht.laengsteStrasse === p.id && (
                <span class="marke" data-tip="Längste Handelsstraße (+2)">
                  <EntwIcon typ="strassenbau" groesse={13} /> +2
                </span>
              )}
              {sicht.groessteMacht === p.id && (
                <span class="marke" data-tip="Größte Rittermacht (+2)">
                  <EntwIcon typ="ritter" groesse={13} /> +2
                </span>
              )}
            </div>
            <div class="swerte">
              <span data-tip="Rohstoffkarten">
                <KartenIcon /> {p.handAnzahl}
              </span>
              <span data-tip="Entwicklungskarten">
                <KartenIcon entw /> {p.entwAnzahl}
              </span>
              <span data-tip="Gespielte Ritter">
                <EntwIcon typ="ritter" groesse={14} /> {p.gespielteRitter}
              </span>
              <span data-tip="Längste eigene Straße">
                <EntwIcon typ="strassenbau" groesse={14} /> {p.strassenLaenge}
              </span>
            </div>
            <div class="spunkte" data-tip={p.id === sicht.ich ? 'Deine Siegpunkte (inkl. verdeckter Karten)' : 'Sichtbare Siegpunkte'}>
              {punkte}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LogListe({ sicht, max }: { sicht: Sicht; max?: number }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const letzte = sicht.log.at(-1)?.nr;
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [letzte]);
  const zeilen = max ? sicht.log.slice(-max) : sicht.log;
  return (
    <div class="log" ref={ref} aria-live="polite">
      {zeilen.map((l) => (
        <p key={l.nr}>{l.text}</p>
      ))}
    </div>
  );
}

export function WurfAnzeige({ sicht, groesse = 44 }: { sicht: Sicht; groesse?: number }): JSX.Element | null {
  if (!sicht.wurf) return null;
  const summe = sicht.wurf[0] + sicht.wurf[1];
  // key: neue Animation bei jedem Wurf
  return (
    <div class="wurf" key={`${sicht.zugNr}`}>
      <Wuerfel wert={sicht.wurf[0]} groesse={groesse} />
      <Wuerfel wert={sicht.wurf[1]} groesse={groesse} rot />
      <span class={`wurfsumme ${summe === 7 ? 'sieben' : ''}`}>= {summe}</span>
    </div>
  );
}
