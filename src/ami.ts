import { connect as connectTcp, type Socket } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { EventEmitter } from 'node:events';

export type AmiMessage = Record<string, string>;

export type AmiOptions = {
	host: string;
	port: number;
	tls: boolean;
	username: string;
	secret: string;
	keepaliveSeconds: number;
};

const SEPARATOR = '\r\n';
const END_OF_MESSAGE = SEPARATOR + SEPARATOR;

/**
 * Client für das Asterisk Manager Interface: Nachrichten bestehen aus Zeilen der
 * Form "Schlüssel: Wert" und enden mit einer Leerzeile.
 */
export class AmiClient extends EventEmitter {
	#options: AmiOptions;
	#socket: Socket | null = null;
	#buffer = '';
	#keepalive: NodeJS.Timeout | null = null;
	#reconnectDelay = 1000;
	#stopped = false;
	#lastMessageAt = Date.now();

	constructor(options: AmiOptions) {
		super();
		this.#options = options;
	}

	get silenceSeconds(): number {
		return (Date.now() - this.#lastMessageAt) / 1000;
	}

	connect(): void {
		this.#stopped = false;
		const { host, port, tls } = this.#options;

		const socket = tls
			? connectTls({ host, port }, () => this.#onConnect())
			: connectTcp({ host, port }, () => this.#onConnect());

		socket.setEncoding('utf8');
		socket.on('data', (chunk: string) => this.#onData(chunk));
		socket.on('error', (error) => this.emit('warn', `Verbindungsfehler: ${error.message}`));
		socket.on('close', () => this.#onClose());

		this.#socket = socket;
	}

	stop(): void {
		this.#stopped = true;
		if (this.#keepalive) clearInterval(this.#keepalive);
		this.#socket?.end();
	}

	send(action: AmiMessage): void {
		const block = Object.entries(action)
			.map(([key, value]) => `${key}: ${value}`)
			.join(SEPARATOR);
		this.#socket?.write(block + END_OF_MESSAGE);
	}

	#onConnect(): void {
		this.#reconnectDelay = 1000;
		this.#lastMessageAt = Date.now();
		this.emit('info', `verbunden mit ${this.#options.host}:${this.#options.port}`);

		// Die Anlage antwortet erst nach einem vollständigen Login. Weder Begrüßung
		// noch Challenge-Antwort kommen vorher, auf sie zu warten führt in eine
		// Sackgasse. Deshalb folgt der Login unmittelbar auf die Anfrage.
		this.send({ Action: 'Challenge', AuthType: 'MD5' });
		this.send({
			Action: 'Login',
			ActionID: 'login',
			UserName: this.#options.username,
			Secret: this.#options.secret
		});

		this.#keepalive = setInterval(
			() => this.send({ Action: 'Ping' }),
			this.#options.keepaliveSeconds * 1000
		);
	}

	#onData(chunk: string): void {
		this.#buffer += chunk;

		let end: number;
		while ((end = this.#buffer.indexOf(END_OF_MESSAGE)) !== -1) {
			const block = this.#buffer.slice(0, end);
			this.#buffer = this.#buffer.slice(end + END_OF_MESSAGE.length);
			this.#handleBlock(block);
		}
	}

	#handleBlock(block: string): void {
		this.#lastMessageAt = Date.now();

		const message: AmiMessage = {};
		for (const line of block.split(SEPARATOR)) {
			const index = line.indexOf(':');
			if (index === -1) continue;
			message[line.slice(0, index).trim()] = line.slice(index + 1).trim();
		}
		if (Object.keys(message).length === 0) return;

		if (message['ActionID'] === 'login') {
			if (message['Response'] === 'Success') this.emit('info', 'angemeldet');
			else this.emit('warn', `Anmeldung abgelehnt: ${message['Message'] ?? 'ohne Begründung'}`);
			return;
		}

		if (message['Response'] === 'Error') this.emit('warn', message['Message'] ?? 'AMI-Fehler');
		if (message['Event']) this.emit('event', message);
	}

	#onClose(): void {
		if (this.#keepalive) clearInterval(this.#keepalive);
		if (this.#stopped) return;

		this.emit('warn', `Verbindung getrennt, neuer Versuch in ${this.#reconnectDelay / 1000} s`);
		setTimeout(() => this.connect(), this.#reconnectDelay);
		this.#reconnectDelay = Math.min(this.#reconnectDelay * 2, 30_000);
	}
}
