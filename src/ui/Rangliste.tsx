// Rangliste der Feigen Sippe (Startseite und Lobby).
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { TITEL } from '../engine';
import { GRUPPE, abonniereRangliste, partien, tabelle } from '../netz/rangliste';

export function Rangliste(): JSX.Element {
  const [liste, setListe] = useState(partien());
  useEffect(() => abonniereRangliste(() => setListe(partien())), []);
  const zeilen = tabelle(liste);
  return (
    <section class="tafel rangliste">
      <h2>
        🏆 Rangliste · {GRUPPE} <small>{liste.length} Partie{liste.length === 1 ? '' : 'n'}</small>
      </h2>
      {zeilen.length === 0 ? (
        <p class="hinweis">Noch keine beendeten Partien. Jede Online-Partie, die bis zum Sieg gespielt wird, landet hier – auf allen Geräten der Runde.</p>
      ) : (
        <table class="rang-tabelle">
          <thead>
            <tr>
              <th />
              <th>Spieler</th>
              <th>Siege</th>
              <th>Spiele</th>
              <th>Quote</th>
              <th>Ø Punkte</th>
              <th>Titel</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z, i) => (
              <tr>
                <td>{i + 1}.</td>
                <td>{z.name}</td>
                <td>
                  <b>{z.siege}</b>
                </td>
                <td>{z.spiele}</td>
                <td>{Math.round((z.siege / z.spiele) * 100)} %</td>
                <td>{z.schnitt.toFixed(1)}</td>
                <td>
                  {TITEL.filter((t) => z.titel[t.name]).map((t) => (
                    <span class="marke" data-tip={`${t.name}: ${t.text}`}>
                      {t.name} ×{z.titel[t.name]}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
