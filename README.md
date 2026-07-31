# zammad-ami-easybell

Liefert Anrufereignisse der easybell Cloud-Telefonanlage an Zammads CTI-Integration.
Zammad führt daraus eine Anrufliste, erkennt Anrufer anhand ihrer Rufnummer und
öffnet auf Wunsch beim Klingeln den Ticket-Dialog oder das Kundenprofil.
Zammads CTI-Integration bietet keine Wählfunktion.

Fertige Anbindungen bringt Zammad nur für sipgate.io und Placetel mit. easybell
bietet stattdessen das Asterisk Manager Interface an, gedacht für TAPI-Clients
wie PhoneSuite.

## Voraussetzungen

- AMI-Zugangsdaten aus dem easybell-Kundenbereich, dazu die feste IP des Servers
  in der dortigen Freigabeliste eingetragen.
- In Zammad _Verwaltung → Integrationen → CTI (generisch)_ einschalten und die
  angezeigte URL übernehmen.
- Docker, oder Node 22 und neuer.

## Betrieb

```sh
cp .env.example .env
docker compose up -d
```

Der Dienst öffnet keinen Port. Er sendet alle `AMI_KEEPALIVE_SECONDS` ein Ping an
die Anlage; bleibt deren Antwort länger als `HEALTH_MAX_SILENCE_SECONDS` aus,
beendet er sich und wird neu gestartet.

## Einstellungen

| Variable                     | Bedeutung                                              | Vorgabe                   |
| ---------------------------- | ------------------------------------------------------ | ------------------------- |
| `MODE`                       | `bridge` sendet an Zammad, `discover` schreibt nur mit | `discover`                |
| `AMI_HOST`                   | Hostname der Anlage                                    | erforderlich              |
| `AMI_PORT`                   | Port des Manager Interface                             | `5039`                    |
| `AMI_TLS`                    | TLS verwenden, easybell bietet keins an                | `false`                   |
| `AMI_USERNAME`, `AMI_SECRET` | Zugangsdaten der Anlage                                | erforderlich              |
| `AMI_KEEPALIVE_SECONDS`      | Abstand der Ping-Aktionen                              | `30`                      |
| `ZAMMAD_CTI_URL`             | Endpunkt inklusive Token                               | für `bridge` erforderlich |
| `ZAMMAD_TIMEOUT_SECONDS`     | Zeitgrenze je CTI-Aufruf                               | `10`                      |
| `COUNTRY_CODE`               | ersetzt die führende Null                              | `49`                      |
| `DEVICE_CHANNEL_PATTERN`     | Kanäle eigener Geräte, erkennt ausgehende Anrufe       | `^PJSIP/CPBX-`            |
| `HEALTH_FILE`                | Datei für das Lebenszeichen                            | `/tmp/health`             |
| `HEALTH_MAX_SILENCE_SECONDS` | Frist ohne Antwort der Anlage                          | `120`                     |

## Was übersetzt wird

`Newchannel` wird zu `newCall`, `DialEnd` mit `ANSWER` zu `answer`, `Hangup` zu
`hangup`, jeweils vom Ursprungskanal eines Gesprächs. Rufnummern erhalten die
internationale Form, aus `015122334455` wird `+4915122334455`. Auflegegründe
werden zu Zammads Kategorien: ein angenommenes Gespräch endet als
`normalClearing` ohne Vermerk, ein abgebrochenes als `cancel` und damit sichtbar
als „nicht erreicht“.

## Andere Anlagen

`MODE=discover` schreibt jedes AMI-Ereignis mit, `tools/replay.ts` zeigt, welche
CTI-Aufrufe daraus entstünden. Anzupassen ist dann allein `src/bridge.ts`.

```sh
node --env-file=.env dist/index.js > anruf.log
node --experimental-strip-types tools/replay.ts anruf.log
```

`tools/mitm-proxy.ts` protokolliert den Verkehr eines funktionierenden Clients
zur Anlage, was den Anmeldeablauf offenlegt: easybell etwa antwortet erst, wenn
ein vollständiger Login eingegangen ist. `tools/fake-ami.ts` und
`tools/fake-zammad.ts` prüfen die Kette ohne Telefonanlage.

## Sicherheit

easybell bietet auf Port 5039 offenbar kein TLS an. Zugangsdaten und Verbindungsdaten
gehen so im Klartext über das Netz. Schutz bietet allein die IP-Freigabeliste.
Die TLS-Funktionen im Code wurden nicht weiter getestet.
