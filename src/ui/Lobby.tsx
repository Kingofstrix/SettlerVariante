// Lobby: Raumcode, Spielerliste mit Verbindungstest, Einstellungen des Hosts.
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { FARBEN, farbHex, type Einstellungen, type Sitzung } from '../netz/sitzung';
import { ChatBox } from './Chat';
import { HilfeDialog } from './Dialoge';
import { useSitzung } from './hooks';

function Auswahl<T extends string | number | boolean>({
  wert,
  optionen,
  onChange,
  aus,
}: {
  wert: T;
  optionen: [T, string][];
  onChange: (w: T) => void;
  aus: boolean;
}): JSX.Element {
  return (
    <span class="segment">
      {optionen.map(([w, text]) => (
        <button class={`chip ${w === wert ? 'an' : ''}`} disabled={aus} onClick={() => onChange(w)}>
          {text}
        </button>
      ))}
    </span>
  );
}

export function Lobby({ sitzung, onVerlassen }: { sitzung: Sitzung; onVerlassen: () => void }): JSX.Element {
  const z = useSitzung(sitzung);
  const h = sitzung.host;
  const e = z.einstellungen;
  const ich = z.meinSitz !== null ? z.sitze[z.meinSitz] : null;
  const [name, setName] = useState(ich?.name ?? '');
  const [hilfe, setHilfe] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const setze = (teil: Partial<Einstellungen>): void => h?.einstellungen(teil);
  const link = `${location.origin}${location.pathname}?raum=${z.raumCode}`;
  const belegt = new Set(z.sitze.filter((_, i) => i !== z.meinSitz).map((s) => s.farbe));
  const gross = z.sitze.length >= 5;

  return (
    <div class="lobby">
      <header class="lobby-kopf">
        <div>
          <small>Raumcode</small>
          <div class="raumcode">{z.raumCode}</div>
        </div>
        <div class="lobby-link">
          <p>
            Mitspieler öffnen diese Seite, wählen „Raum beitreten“ und geben den Code ein – oder nutzen den Link. Der Beamer-Laptop wählt
            „Als Beamer verbinden“.
          </p>
          <button
            class="knopf"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setKopiert(true));
            }}
          >
            {kopiert ? '✓ Link kopiert' : '🔗 Einladungslink kopieren'}
          </button>
          <button class="knopf" onClick={() => setHilfe(true)}>
            ? Regeln
          </button>
          <button class="knopf" onClick={onVerlassen}>
            🚪 {h ? 'Raum schließen' : 'Verlassen'}
          </button>
        </div>
      </header>

      {!z.online && <div class="banner warn">{z.meldung ?? 'Keine Verbindung …'} Wenn es nicht klappt: alle in einen Handy-Hotspot.</div>}

      <div class="lobby-spalten">
        <section class="tafel">
          <h2>
            Spieler ({z.sitze.length}/{e.maxSpieler}) <small>Verbindungstest</small>
          </h2>
          <table class="sitze">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Latenz</th>
                <th>Weg</th>
                {h && <th />}
              </tr>
            </thead>
            <tbody>
              {z.sitze.map((s, i) => (
                <tr class={i === z.meinSitz ? 'ich' : ''}>
                  <td>
                    <i class="punkt gross" style={{ background: farbHex(s.farbe) }} /> {s.name}
                    {s.istHost && <span class="marke">Host</span>}
                    {i === z.meinSitz && <em> (du)</em>}
                  </td>
                  <td>{s.verbunden ? <span class="ok">● verbunden</span> : <span class="fehler">● getrennt</span>}</td>
                  <td>{s.istHost ? '–' : s.latenz === null ? '…' : `${s.latenz} ms`}</td>
                  <td>
                    {s.weg === 'direkt' && <span class="ok">direkt</span>}
                    {s.weg === 'relay' && <span class="warnung" data-tip="Läuft über einen TURN-Server. Funktioniert, ist aber etwas träger.">Relay</span>}
                    {s.weg === 'lokal' && '–'}
                    {s.weg === null && '…'}
                  </td>
                  {h && (
                    <td>
                      {!s.istHost && (
                        <button class="knopf klein leise" data-tip="Aus dem Raum entfernen" onClick={() => h.entfernen(i)}>
                          ✕
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <p class="hinweis">
            Beamer verbunden: {z.beamer}. {gross ? 'Ab 5 Spielern: großes Brett mit Sonderbauphase.' : '3–4 Spieler: normales Brett.'}
          </p>

          {ich && (
            <div class="profil">
              <h3>Dein Profil</h3>
              <input
                value={name}
                maxLength={16}
                placeholder="Name"
                onInput={(ev) => setName((ev.target as HTMLInputElement).value)}
                onBlur={() => name.trim() && sitzung.profil(name, ich.farbe)}
                onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
              />
              <span class="farbwahl">
                {FARBEN.map((f) => (
                  <button
                    class={`farbe ${ich.farbe === f.id ? 'an' : ''}`}
                    style={{ background: f.hex }}
                    disabled={belegt.has(f.id)}
                    data-tip={belegt.has(f.id) ? `${f.name} ist vergeben` : f.name}
                    aria-label={f.name}
                    onClick={() => sitzung.profil(name || ich.name, f.id)}
                  />
                ))}
              </span>
            </div>
          )}
        </section>

        <section class="tafel">
          <h2>Einstellungen {!h && <small>(legt der Host fest)</small>}</h2>
          <div class="einst">
            <label>Maximale Spielerzahl</label>
            <Auswahl wert={e.maxSpieler} aus={!h} onChange={(w) => setze({ maxSpieler: w })} optionen={[[3, '3'], [4, '4'], [5, '5'], [6, '6']]} />
            <label>Brett</label>
            <Auswahl wert={e.layout} aus={!h} onChange={(w) => setze({ layout: w })} optionen={[['anfaenger', 'Anfänger (fest)'], ['zufall', 'Zufall']]} />
            <label>Siegpunkte</label>
            <Auswahl wert={e.siegpunkte} aus={!h} onChange={(w) => setze({ siegpunkte: w })} optionen={[[8, '8 (kurz)'], [10, '10'], [12, '12']]} />
            <label data-tip="Spieler mit höchstens 2 Siegpunkten werden vom Räuber verschont.">Freundlicher Räuber</label>
            <Auswahl wert={e.freundlicherRaeuber} aus={!h} onChange={(w) => setze({ freundlicherRaeuber: w })} optionen={[[false, 'Aus'], [true, 'An']]} />
            <label data-tip="Bei einer 7 darf man statt abzuwerfen am Glücksrad drehen: 30 % kein Abwurf, 70 % doppelt so viele Karten.">🎰 Las Vegas (Glücksrad)</label>
            <Auswahl wert={e.gluecksrad} aus={!h} onChange={(w) => setze({ gluecksrad: w })} optionen={[[false, 'Aus'], [true, 'An']]} />
            <label>Zeit pro Zug</label>
            <Auswahl
              wert={e.zugZeit}
              aus={!h}
              onChange={(w) => setze({ zugZeit: w })}
              optionen={[[0, 'Aus'], [60, '60 s'], [90, '90 s'], [120, '120 s'], [180, '180 s']]}
            />
            <label>Sonderbauphase</label>
            <Auswahl wert={e.sonderbauZeit} aus={!h || e.zugZeit === 0} onChange={(w) => setze({ sonderbauZeit: w })} optionen={[[10, '10 s'], [20, '20 s'], [30, '30 s'], [45, '45 s']]} />
            <label>Abwerfen bei 7</label>
            <Auswahl wert={e.abwerfZeit} aus={!h || e.zugZeit === 0} onChange={(w) => setze({ abwerfZeit: w })} optionen={[[20, '20 s'], [30, '30 s'], [45, '45 s'], [60, '60 s']]} />
          </div>
          {h ? (
            <span class="tip-halter block" data-tip={z.sitze.length < 3 ? 'Es braucht mindestens 3 Spieler.' : undefined}>
              <button class="knopf haupt riesig" disabled={z.sitze.length < 3} onClick={() => h.starten()}>
                Spiel starten
              </button>
            </span>
          ) : (
            <p class="warte">Warte auf den Host …</p>
          )}
        </section>

        <section class="tafel lobby-chat">
          <h2>Chat</h2>
          <ChatBox eintraege={z.chat} meinName={ich?.name ?? null} onSenden={ich ? (text) => sitzung.chat(text) : null} />
        </section>
      </div>
      {hilfe && <HilfeDialog onZu={() => setHilfe(false)} />}
    </div>
  );
}
