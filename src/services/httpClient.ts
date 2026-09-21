import * as https from 'https';
import * as http from 'http';

function requestOptions(url: string, data: string, headers: Record<string, string>, timeoutMs: number) {
	const parsed = new URL(url);
	return {
		hostname: parsed.hostname,
		port: parsed.port,
		path: parsed.pathname + parsed.search,
		method: 'POST',
		headers: { ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
		timeout: timeoutMs,
	};
}

export function requestJson(
	url: string,
	body: unknown,
	headers: Record<string, string>,
	timeoutMs = 60000,
	signal?: AbortSignal,
): Promise<any> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {reject(new Error('Canceled')); return;}
		const data = JSON.stringify(body);
		const mod = url.startsWith('https') ? https : http;
		let canceled = false;
		const req = mod.request(requestOptions(url, data, headers, timeoutMs), res => {
			const chunks: Buffer[] = [];
			res.on('data', (chunk: Buffer) => chunks.push(chunk));
			res.on('end', () => {
				signal?.removeEventListener('abort', cancel);
				const responseText = Buffer.concat(chunks).toString();
				if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
					reject(new Error(`HTTP ${res.statusCode}: ${responseText.slice(0, 200)}`));
					return;
				}
				try {resolve(JSON.parse(responseText));}
				catch {reject(new Error(`Invalid JSON: ${responseText.slice(0, 200)}`));}
			});
		});
		const cancel = () => {
			canceled = true;
			req.destroy(new Error('Canceled'));
		};
		req.on('error', error => {
			signal?.removeEventListener('abort', cancel);
			reject(canceled ? new Error('Canceled') : error);
		});
		req.on('timeout', () => req.destroy(new Error('Request timed out')));
		signal?.addEventListener('abort', cancel, { once: true });
		req.write(data);
		req.end();
	});
}

export function openJsonStream(
	url: string,
	body: unknown,
	headers: Record<string, string>,
	timeoutMs = 120000,
	signal?: AbortSignal,
): Promise<http.IncomingMessage> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {reject(new Error('Canceled')); return;}
		const data = JSON.stringify(body);
		const mod = url.startsWith('https') ? https : http;
		let canceled = false;
		const req = mod.request(requestOptions(url, data, headers, timeoutMs), resolve);
		const cancel = () => {
			canceled = true;
			req.destroy(new Error('Canceled'));
		};
		req.on('error', error => reject(canceled ? new Error('Canceled') : error));
		req.on('timeout', () => req.destroy(new Error('Request timed out')));
		signal?.addEventListener('abort', cancel, { once: true });
		req.write(data);
		req.end();
	});
}
