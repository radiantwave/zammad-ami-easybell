/** Spielt eine Aufzeichnung durch die Übersetzung und zeigt die entstehenden
 *  CTI-Aufrufe: node --experimental-strip-types tools/replay.ts discover.log */

import { readFileSync } from 'node:fs';
import { Bridge } from '../src/bridge.ts';
import type { AmiMessage } from '../src/ami.ts';

const file = process.argv[2] ?? 'discover.log';

const bridge = new Bridge(
	{ send: async () => {} },
	{
		countryCode: process.env.COUNTRY_CODE ?? '49',
		devicePattern: new RegExp(process.env.DEVICE_CHANNEL_PATTERN ?? '^PJSIP/CPBX-')
	}
);

let events = 0;
let translated = 0;

for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
	if (!line.trim()) continue;
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(line);
	} catch {
		continue; // Zeilen, die kein JSON sind (etwa Konsolenrauschen)
	}
	if (parsed['level'] !== 'event') continue;

	events++;
	const cti = bridge.translate(parsed as AmiMessage);
	if (cti) {
		translated++;
		console.log(JSON.stringify(cti));
	}
}

console.log(`\n${events} AMI-Ereignisse gelesen, ${translated} CTI-Aufrufe erzeugt`);
