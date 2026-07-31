import { writeFileSync } from 'node:fs';

import { config } from './config.ts';
import { AmiClient, type AmiMessage } from './ami.ts';
import { CtiClient } from './cti.ts';
import { Bridge } from './bridge.ts';

function log(level: string, message: string, extra?: unknown): void {
	const line = { time: new Date().toISOString(), level, message, ...(extra ?? {}) };
	console.log(JSON.stringify(line));
}

const ami = new AmiClient(config.ami);
ami.on('info', (message: string) => log('info', message));
ami.on('warn', (message: string) => log('warn', message));

if (config.mode === 'discover') {
	log('info', 'Modus: discover, es wird nur mitgeschrieben');
	ami.on('event', (message: AmiMessage) => log('event', message['Event'] ?? 'unbekannt', message));
} else {
	const bridge = new Bridge(new CtiClient(config.zammad.ctiUrl, config.zammad.timeoutSeconds), {
		countryCode: config.countryCode,
		devicePattern: config.devicePattern
	});
	log('info', `Modus: bridge, Ziel ${new URL(config.zammad.ctiUrl).origin}`);

	ami.on('event', (message: AmiMessage) => {
		bridge
			.handle(message)
			.then((event) => {
				if (event) log('cti', event.event, event);
			})
			.catch((error: Error) => log('error', `CTI-Aufruf fehlgeschlagen: ${error.message}`));
	});
}

ami.connect();

/**
 * Wachhund und Healthcheck stützen sich auf dieselbe Grundlage: Solange die
 * Anlage Lebenszeichen sendet, also Ereignisse oder die Antwort auf unseren
 * Ping, wird die Health-Datei aufgefrischt. Bleibt sie zu lange stumm, beendet
 * sich der Dienst und Docker startet ihn neu. Ein Container, der lediglich als
 * ungesund gilt, liefe unangetastet weiter.
 */
setInterval(() => {
	const silence = ami.silenceSeconds;

	if (silence > config.health.maxSilenceSeconds) {
		log('error', `seit ${Math.round(silence)} s keine Nachricht der Anlage, beende`);
		ami.stop();
		process.exit(1);
	}

	try {
		writeFileSync(config.health.file, String(Date.now()));
	} catch (error) {
		log('warn', `Health-Datei nicht schreibbar: ${(error as Error).message}`);
	}
}, 10_000).unref();

// Ein Neustart ist berechenbarer als ein halb toter Prozess.
process.on('unhandledRejection', (reason) => {
	log(
		'error',
		`unbehandelter Fehler: ${reason instanceof Error ? reason.message : String(reason)}`
	);
	process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		log('info', `${signal} empfangen, beende`);
		ami.stop();
		process.exit(0);
	});
}
