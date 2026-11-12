import { render, type JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Client } from '../netz/client';
import { Host, pruefeHostDaten, type HostDaten } from '../netz/host';
import { LokalSitzung } from '../netz/lokal';
import { FARBEN, STANDARD_EINSTELLUNGEN, type Sitzung } from '../netz/sitzung';
import { DEV, lese, loesche, meinToken, schreibe, type GemerkteSitzung, type Profil } from '../netz/speicher';
import { KanalClientTransport, KanalHostTransport, PeerClientTransport, PeerHostTransport, TransportFehler } from '../netz/transport';
import { BeamerAnsicht } from './Beamer';
import { Lobby } from './Lobby';
import { SpielAnsicht } from './Spiel';
import { Start } from './Start';
import { useSitzung, useToasts } from './hooks';
import './tokens.css';
import './stil.css';
import './brett.css';

const hostTransport = (): KanalHostTransport | PeerHostTransport => (DEV ? new KanalHostTransport() : new PeerHostTransport());
const clientTransport = (): KanalClientTransport | PeerClientTransport => (DEV ? new KanalClientTransport() : new PeerClientTransport());

function fehlerText(e: unknown): string {
  if (e instanceof TransportFehler) return e.message;
  return 'Das hat nicht geklappt. Bitte noch einmal versuchen.';
}

function Toasts(): JSX.Element {
  const liste = useToasts();
  return (
    <div class="toasts" aria-live="assertive">
      {liste.map((t) => (
        <div class={`toast ${t.art}`} key={t.id}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function SitzungsAnsicht({ sitzung, onVerlassen }: { sitzung: Sitzung; onVerlassen: () => void }): JSX.Element {
  const z = useSitzung(sitzung);
  if (z.status === 'beendet')
    return (
      <div class="start">
        <div class="start-karte schmal">
          <h2>Verbindung beendet</h2>
          <p>{z.meldung}</p>
          <button class="knopf" onClick={() => location.reload()}>
            Hier weiterspielen (neu laden)
          </button>{' '}
          <button class="knopf" onClick={onVerlassen}>
            Zur Startseite
          </button>
        </div>
      </div>
    );
  if (z.status === 'verbinde')
    return (
      <div class="start">
        <div class="start-karte schmal">
          <h2>Verbinde mit Raum {z.raumCode} …</h2>
          <div class="lade" />
          {z.meldung && (
            <div class="banner warn">
              {z.meldung}
              <br />
              <small>Wenn es nicht klappt: alle in einen Handy-Hotspot.</small>
            </div>
          )}
          <button class="knopf" onClick={onVerlassen}>
            Abbrechen
          </button>
        </div>
      </div>
    );
  if (z.status === 'lobby' || !z.sicht) return <Lobby sitzung={sitzung} onVerlassen={onVerlassen} />;
  if (z.rolle === 'beamer' || z.sicht.ich === null) return <BeamerAnsicht sitzung={sitzung} onVerlassen={onVerlassen} />;
  return <SpielAnsicht sitzung={sitzung} onVerlassen={onVerlassen} />;
}

function App(): JSX.Element {
  const [sitzung, setSitzung] = useState<Sitzung | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState<string | null>(null);

  const merke = (g: GemerkteSitzung): void => schreibe('sitzung', g);

  const hostStart = (versprechen: Promise<Host>, text: string): void => {
    setFehler(null);
    setLaedt(text);
    versprechen
      .then((h) => {
        merke({ art: 'host', raumCode: h.zustand.raumCode, rolle: 'spieler' });
        setSitzung(h);
      })
      .catch((e) => setFehler(fehlerText(e)))
      .finally(() => setLaedt(null));
  };

  const beitreten = (code: string, rolle: 'spieler' | 'beamer', profil: Profil): void => {
    setFehler(null);
    merke({ art: 'client', raumCode: code, rolle });
    setSitzung(new Client(clientTransport(), code, rolle, profil, meinToken()));
  };

  const hostFortsetzen = (daten: HostDaten): void => hostStart(Host.fortsetzen(hostTransport, daten), `Öffne Raum ${daten.raumCode} wieder …`);

  // Nach einem Reload automatisch in den alten Raum zurück.
  useEffect(() => {
    const g = lese<GemerkteSitzung>('sitzung');
    if (!g) return;
    if (g.art === 'host') {
      const daten = pruefeHostDaten(lese<unknown>('host'));
      if (daten) hostFortsetzen(daten);
      else loesche('sitzung');
    } else beitreten(g.raumCode, g.rolle, lese<Profil>('profil') ?? { name: 'Spieler', farbe: 'rot' });
  }, []);

  const verlassen = (): void => {
    sitzung?.verlassen();
    loesche('sitzung');
    setSitzung(null);
    history.replaceState(null, '', location.pathname + (DEV ? '?dev=1' : ''));
  };

  return (
    <>
      {sitzung ? (
        <SitzungsAnsicht sitzung={sitzung} onVerlassen={verlassen} />
      ) : (
        <Start
          fehler={fehler}
          laedt={laedt}
          aktionen={{
            erstellen: (profil) => hostStart(Host.erstellen(hostTransport, profil, meinToken()), 'Erstelle Raum …'),
            beitreten,
            importieren: (json) => {
              let daten: HostDaten | null = null;
              try {
                daten = pruefeHostDaten(JSON.parse(json));
              } catch {
                /* unten behandelt */
              }
              if (!daten) return setFehler('Die Datei ist kein gültiger Inselreich-Spielstand.');
              // Dieser Browser wird Host; sitzt sein Token nicht am Tisch, schaut er nur zu.
              hostFortsetzen({ ...daten, hostToken: meinToken() });
            },
            lokal: (n, karte) =>
              setSitzung(
                new LokalSitzung(
                  FARBEN.slice(0, n).map((f) => ({ name: f.name, farbe: f.id })),
                  STANDARD_EINSTELLUNGEN,
                  karte,
                ),
              ),
          }}
        />
      )}
      <Toasts />
    </>
  );
}

render(<App />, document.getElementById('app')!);
