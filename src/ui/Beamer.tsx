// Beameransicht: großes Brett, Würfel, Punktestand, Log, Timer. Zeigt nie Handkarten.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Sitzung } from '../netz/sitzung';
import { Brett } from './Brett';
import { HilfeDialog } from './Dialoge';
import { EndeDialog, Menue } from './Spiel';
import { LogListe, SpielerTafel, TimerBalken, WurfAnzeige, statusText } from './Teile';
import { useSitzung } from './hooks';

export function BeamerAnsicht({ sitzung, onVerlassen }: { sitzung: Sitzung; onVerlassen: () => void }): JSX.Element {
  const z = useSitzung(sitzung);
  const sicht = z.sicht!;
  const [dialog, setDialog] = useState<null | 'hilfe' | 'menue'>(null);
  const status = statusText(sicht);
  const sonderbau = sicht.phase === 'sonderbau';
  return (
    <div class="beamer">
      <main class="brettbereich">
        <Brett sicht={sicht} />
      </main>
      <aside class="seite">
        <div class="kopf">
          <b class="logo">Inselreich</b>
          {z.raumCode && <span class="raum">Raum {z.raumCode}</span>}
          <span class="kopf-knoepfe">
            <button class="knopf leise" data-tip="Vollbild" onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
              ⛶
            </button>
            <button class="knopf leise" data-tip="Regeln" onClick={() => setDialog('hilfe')}>
              ?
            </button>
            <button class="knopf leise" data-tip="Menü" onClick={() => setDialog('menue')}>
              ☰
            </button>
          </span>
        </div>
        {!z.online && <div class="banner warn">{z.meldung ?? 'Keine Verbindung …'}</div>}
        <div class={`beamer-status ${sonderbau ? 'sonderbau' : ''}`}>{status.text}</div>
        <div class="beamer-wurf">
          <WurfAnzeige sicht={sicht} groesse={96} />
        </div>
        <TimerBalken timer={z.timer} pausiert={z.pausiert} />
        <SpielerTafel sicht={sicht} verbunden={z.verbunden} />
        <LogListe sicht={sicht} max={12} />
      </aside>
      {dialog === 'hilfe' && <HilfeDialog onZu={() => setDialog(null)} />}
      {dialog === 'menue' && <Menue sitzung={sitzung} z={z} onZu={() => setDialog(null)} onVerlassen={onVerlassen} />}
      {sicht.phase === 'ende' && <EndeDialog sitzung={sitzung} sicht={sicht} onVerlassen={onVerlassen} />}
    </div>
  );
}
