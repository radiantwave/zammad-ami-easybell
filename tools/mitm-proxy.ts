/**
 * Lauscht lokal und reicht alles an die echte Telefonanlage weiter, wobei jedes
 * Byte beider Richtungen protokolliert wird. So lässt sich vergleichen, was ein
 * funktionierender Client wie PhoneSuite anders macht als die eigene Brücke.
 *
 *   node --experimental-strip-types tools/mitm-proxy.ts
 *
 * Danach in PhoneSuite als Server 127.0.0.1 eintragen. Geht das nicht, hilft ein
 * Eintrag in C:\Windows\System32\drivers\etc\hosts:
 *   127.0.0.1  jarvis.easybell.de
 *
 * Bei diesem Weg muss der Weiterleitung die IP mitgegeben werden, sonst zeigt der
 * Name auch für sie auf die eigene Maschine und der Verkehr läuft im Kreis:
 *   UPSTREAM_HOST=62.27.117.111 node --experimental-strip-types tools/mitm-proxy.ts
 *
 * Das Passwort wird in der Ausgabe unkenntlich gemacht.
 */

import { createServer, connect } from 'node:net';

const LISTEN_PORT = Number(process.env.LISTEN_PORT ?? 5039);
const UPSTREAM_HOST = process.env.UPSTREAM_HOST ?? 'jarvis.easybell.de';
const UPSTREAM_PORT = Number(process.env.UPSTREAM_PORT ?? 5039);

function show(direction: string, data: string | Buffer): void {
	const raw = typeof data === 'string' ? data : data.toString('utf8');
	const text = raw.replace(/^(Secret:\s*).*$/gim, '$1<maskiert>').replace(/\r\n/g, '\\r\\n\n');
	console.log(`\n──── ${direction} (${Buffer.byteLength(raw)} B) ────\n${text}`);
}

createServer((client) => {
	console.log(`\n=== Client verbunden von ${client.remoteAddress} ===`);
	const upstream = connect({ host: UPSTREAM_HOST, port: UPSTREAM_PORT }, () =>
		console.log(`=== mit ${UPSTREAM_HOST}:${UPSTREAM_PORT} verbunden ===`)
	);

	client.on('data', (data) => {
		show('Client → Anlage', data);
		upstream.write(data);
	});
	upstream.on('data', (data) => {
		show('Anlage → Client', data);
		client.write(data);
	});

	client.on('close', () => {
		console.log('=== Client hat getrennt ===');
		upstream.end();
	});
	upstream.on('close', () => {
		console.log('=== Anlage hat getrennt ===');
		client.end();
	});
	client.on('error', (e) => console.log(`Client-Fehler: ${e.message}`));
	upstream.on('error', (e) => console.log(`Upstream-Fehler: ${e.message}`));
}).listen(LISTEN_PORT, () =>
	console.log(
		`Mitschnitt lauscht auf Port ${LISTEN_PORT}, leitet an ${UPSTREAM_HOST}:${UPSTREAM_PORT}`
	)
);
