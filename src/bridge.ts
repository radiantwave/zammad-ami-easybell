import type { AmiMessage } from './ami.ts';
import type { CtiEvent, CtiSender } from './cti.ts';

/**
 * Asterisk zählt Auflegegründe nach Q.850, Zammads Anrufliste kennt vier
 * Kategorien: normalClearing zeigt nichts an, busy „besetzt“, notFound
 * „existiert nicht“, und cancel, noAnswer sowie congestion „nicht erreicht“.
 * Alles andere gibt Zammad unübersetzt aus.
 */
const HANGUP_CAUSES: Record<string, string> = {
	'1': 'notFound',
	'3': 'congestion',
	'16': 'normalClearing',
	'17': 'busy',
	'18': 'noAnswer',
	'19': 'noAnswer',
	'20': 'noAnswer',
	'21': 'cancel',
	'26': 'cancel',
	'27': 'congestion',
	'28': 'notFound',
	'34': 'congestion',
	'38': 'congestion',
	'41': 'congestion',
	'42': 'congestion'
};

export type BridgeOptions = {
	countryCode: string;
	/** Kanäle eigener Endgeräte. Beginnt ein Gespräch dort, geht es hinaus. */
	devicePattern: RegExp;
};

type Call = { direction: 'in' | 'out'; device: string | undefined; answered?: boolean };

/**
 * Übersetzt AMI-Ereignisse in Zammads CTI-Aufrufe.
 *
 * Ein Gespräch besteht aus mehreren Kanälen: dem Amtskanal und je einem pro
 * klingelndem Gerät. Zusammengehalten werden sie durch die Linkedid. Brauchbare
 * Rufnummern trägt nur der Ursprungskanal, dessen Uniqueid ihr entspricht.
 */
export class Bridge {
	#cti: CtiSender;
	#options: BridgeOptions;
	#calls = new Map<string, Call>();

	constructor(cti: CtiSender, options: BridgeOptions) {
		this.#cti = cti;
		this.#options = options;
	}

	/** Aus 0151… wird +49151…, damit Zammad seine Kunden zuordnen kann. */
	#normalize(raw: string | undefined): string {
		const number = (raw ?? '').replace(/[^\d+]/g, '');
		// Bei unterdrückter Rufnummer meldet die Anlage Text wie "anonymous". Der
		// bleibt stehen, sonst stünde in Zammad eine leere Zeile.
		if (!number) return (raw ?? '').trim();
		if (number.startsWith('+')) return number;
		if (number.startsWith('00')) return `+${number.slice(2)}`;
		if (number.startsWith('0')) return `+${this.#options.countryCode}${number.slice(1)}`;
		if (number.startsWith(this.#options.countryCode) && number.length > 8) return `+${number}`;
		return number;
	}

	#isOriginatingChannel(message: AmiMessage): boolean {
		const id = message['Linkedid'];
		return Boolean(id) && message['Uniqueid'] === id;
	}

	translate(message: AmiMessage): CtiEvent | null {
		const id = message['Linkedid'];
		if (!id) return null;

		switch (message['Event']) {
			case 'Newchannel': {
				if (!this.#isOriginatingChannel(message) || this.#calls.has(id)) return null;

				const from = this.#normalize(message['CallerIDNum']);
				const to = this.#normalize(message['Exten']);
				const direction = this.#options.devicePattern.test(message['Channel'] ?? '') ? 'out' : 'in';

				const name = message['CallerIDName'];
				const device = name && name !== '<unknown>' ? name : undefined;
				this.#calls.set(id, { direction, device });

				return {
					event: 'newCall',
					direction,
					callId: id,
					from,
					to,
					...(direction === 'out' && device ? { user: device } : {})
				};
			}

			case 'DialEnd': {
				const call = this.#calls.get(id);
				if (message['DialStatus'] !== 'ANSWER' || !call) return null;
				call.answered = true;

				// Bei eingehenden Gesprächen steht das abnehmende Gerät am Zielkanal,
				// bei ausgehenden am Ursprungskanal. Dort wurde es beim newCall bereits
				// vermerkt.
				const dest = message['DestCallerIDName'];
				const user = dest && dest !== '<unknown>' ? dest : call.device;
				return {
					event: 'answer',
					direction: call.direction,
					callId: id,
					...(user ? { user } : {})
				};
			}

			case 'Hangup': {
				const call = this.#calls.get(id);
				if (!this.#isOriginatingChannel(message) || !call) return null;
				this.#calls.delete(id);

				// Ob abgenommen wurde, wiegt schwerer als der Auflegegrund. Nach einem
				// geführten Gespräch meldet die Anlage je nach Gegenstelle 16, 26 oder
				// 127, was in Zammad als „nicht erreicht“ erschiene. Umgekehrt gilt ein
				// abgebrochener Anruf formal als „Normal Clearing“, weil der Anrufer ja
				// regulär aufgelegt hat, und stünde dort kommentarlos da.
				const mapped = HANGUP_CAUSES[message['Cause'] ?? ''];
				const cause = call.answered
					? 'normalClearing'
					: !mapped || mapped === 'normalClearing'
						? 'cancel'
						: mapped;

				return { event: 'hangup', direction: call.direction, callId: id, cause };
			}

			default:
				return null;
		}
	}

	async handle(message: AmiMessage): Promise<CtiEvent | null> {
		const event = this.translate(message);
		if (event) await this.#cti.send(event);
		return event;
	}
}
