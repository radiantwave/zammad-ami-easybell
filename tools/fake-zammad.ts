/** Nimmt CTI-Aufrufe entgegen und schreibt sie auf die Konsole, als Ersatz für
 *  Zammad: node --experimental-strip-types tools/fake-zammad.ts */

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8099);

createServer(async (request, response) => {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	const body = Buffer.concat(chunks).toString();

	console.log(`${request.method} ${request.url}`, Object.fromEntries(new URLSearchParams(body)));

	response.writeHead(200, { 'Content-Type': 'application/json' });
	response.end('{}');
}).listen(PORT, () =>
	console.log(`Falsches Zammad lauscht auf http://localhost:${PORT}/api/v1/cti/test`)
);
