export type CtiDirection = 'in' | 'out';

/**
 * Die Richtung gehört an jedes Ereignis: Zammad prüft sie, bevor es die
 * Ereignisart auswertet, und weist alles ohne sie mit "Invalid 'direction'!" ab.
 */
export type CtiEvent =
	| {
			event: 'newCall';
			direction: CtiDirection;
			callId: string;
			from: string;
			to: string;
			user?: string;
	  }
	| { event: 'answer'; direction: CtiDirection; callId: string; user?: string }
	| { event: 'hangup'; direction: CtiDirection; callId: string; cause?: string };

/** Was die Übersetzung vom Empfänger braucht. */
export type CtiSender = { send(event: CtiEvent): Promise<void> };

export class CtiClient implements CtiSender {
	#url: string;
	#timeoutMs: number;

	constructor(url: string, timeoutSeconds: number) {
		this.#url = url;
		this.#timeoutMs = timeoutSeconds * 1000;
	}

	async send(event: CtiEvent): Promise<void> {
		const body = new URLSearchParams(
			Object.entries(event).filter(([, value]) => value !== undefined) as [string, string][]
		);

		const response = await fetch(this.#url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body,
			signal: AbortSignal.timeout(this.#timeoutMs)
		});

		if (!response.ok) {
			throw new Error(`Zammad antwortet mit ${response.status}: ${await response.text()}`);
		}
	}
}
