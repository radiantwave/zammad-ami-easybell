import { tmpdir } from 'node:os';
import { join } from 'node:path';

function required(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Umgebungsvariable ${name} fehlt`);
	return value;
}

function optional(name: string, fallback: string): string {
	return process.env[name] ?? fallback;
}

function boolean(name: string, fallback: boolean): boolean {
	const value = process.env[name];
	if (value === undefined) return fallback;
	return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export type Mode = 'discover' | 'bridge';

export const config = {
	mode: optional('MODE', 'discover') as Mode,

	ami: {
		host: required('AMI_HOST'),
		port: Number(optional('AMI_PORT', '5039')),
		// Die easybell-Anlage spricht auf 5039 unverschlüsselt, obwohl das bei
		// Asterisk der TLS-Port ist.
		tls: boolean('AMI_TLS', false),
		username: required('AMI_USERNAME'),
		secret: required('AMI_SECRET'),
		keepaliveSeconds: Number(optional('AMI_KEEPALIVE_SECONDS', '30'))
	},

	zammad: {
		ctiUrl: process.env.ZAMMAD_CTI_URL ?? '',
		timeoutSeconds: Number(optional('ZAMMAD_TIMEOUT_SECONDS', '10'))
	},

	health: {
		file: optional('HEALTH_FILE', join(tmpdir(), 'zammad-ami-easybell.health')),
		// Muss deutlich über dem Ping-Abstand liegen, sonst schlägt der Wachhund
		// im Leerlauf zu.
		maxSilenceSeconds: Number(optional('HEALTH_MAX_SILENCE_SECONDS', '120'))
	},

	countryCode: optional('COUNTRY_CODE', '49'),
	devicePattern: new RegExp(optional('DEVICE_CHANNEL_PATTERN', '^PJSIP/CPBX-'))
};

if (config.mode === 'bridge' && !config.zammad.ctiUrl) {
	throw new Error('MODE=bridge verlangt ZAMMAD_CTI_URL');
}
