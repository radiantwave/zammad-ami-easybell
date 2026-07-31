/** Spielt eine Asterisk-Anlage nach und gibt nach dem Login eine aufgezeichnete
 *  Ereignisfolge aus: node --experimental-strip-types tools/fake-ami.ts [datei] */

import { createServer } from 'node:net';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 5038);
const AUFZEICHNUNG = process.argv[2] ?? 'fixtures/ausgehend.log';

const ereignisse = readFileSync(AUFZEICHNUNG, 'utf8')
	.split(/\r?\n/)
	.filter(Boolean)
	.map((zeile) => JSON.parse(zeile) as Record<string, string>)
	.filter((zeile) => zeile['level'] === 'event')
	.map(({ time, level, message, ...ami }) => ami);

function block(nachricht: Record<string, string>): string {
	return (
		Object.entries(nachricht)
			.map(([key, value]) => `${key}: ${value}`)
			.join('\r\n') + '\r\n\r\n'
	);
}

createServer((socket) => {
	console.log(`Client verbunden, ${ereignisse.length} Ereignisse aus ${AUFZEICHNUNG}`);

	socket.on('data', (chunk) => {
		if (!chunk.toString().includes('Action: Login')) return;

		socket.write('Asterisk Call Manager/7.0.3\r\n');
		socket.write(
			block({ Response: 'Success', ActionID: 'login', Message: 'Authentication accepted' })
		);

		ereignisse.forEach((ereignis, index) => {
			setTimeout(() => socket.write(block(ereignis)), 200 * (index + 1));
		});
	});
}).listen(PORT, () => console.log(`Falsches AMI lauscht auf Port ${PORT}`));
