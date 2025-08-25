// src/lib/auth.ts
import { writable, get } from 'svelte/store';

const KEY = 'sweep.auth.v1';

type AuthState = {
	token: string | null;
	expiry: number; // epoch ms
	email?: string | null;
};

const initial: AuthState = (() => {
	try {
		const raw = sessionStorage.getItem(KEY);
		if (raw) return JSON.parse(raw) as AuthState;
	} catch {}
	return { token: null, expiry: 0, email: null };
})();

export const accessToken = writable<string | null>(initial.token);
let expiry = initial.expiry;
export const userEmail = writable<string | null>(initial.email ?? null);

function persist() {
	try {
		sessionStorage.setItem(
			KEY,
			JSON.stringify({
				token: get(accessToken),
				expiry,
				email: get(userEmail)
			})
		);
	} catch {}
}

function setToken(token: string, expires_in?: number) {
	accessToken.set(token);
	if (expires_in) expiry = Date.now() + (expires_in - 60) * 1000; // refresh 1m early
	persist();
}

export function isTokenValid() {
	return !!get(accessToken) && Date.now() < expiry;
}

/** One-shot: identity + gmail.metadata in a single popup (call from a click) */
export function signInWithGmailMetadata(): Promise<{ token: string }> {
	return new Promise((resolve, reject) => {
		// @ts-ignore
		const tc = google.accounts.oauth2.initTokenClient({
			client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
			scope: 'openid email https://www.googleapis.com/auth/gmail.metadata',
			callback: (r: any) => {
				setToken(r.access_token, r.expires_in);
				resolve({ token: r.access_token });
			},
			error_callback: reject
		});
		tc.requestAccessToken({ prompt: 'consent' });
	});
}

/** Fetch and cache the user's email (optional, nice for header) */
export async function fetchAndCacheEmail() {
	const t = get(accessToken);
	if (!t) return null;
	const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
		headers: { Authorization: `Bearer ${t}` }
	});
	if (!r.ok) return null;
	const data = await r.json();
	const email = (data.email || '').toLowerCase();
	userEmail.set(email);
	persist();
	return email;
}

/** Try to get a new token WITHOUT a popup (works if Google session + prior consent) */
export function ensureTokenSilent(
	scope = 'openid email https://www.googleapis.com/auth/gmail.metadata'
): Promise<boolean> {
	if (isTokenValid()) return Promise.resolve(true);
	return new Promise((resolve) => {
		// @ts-ignore
		const tc = google.accounts.oauth2.initTokenClient({
			client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
			scope,
			callback: (r: any) => {
				setToken(r.access_token, r.expires_in);
				resolve(true);
			},
			error_callback: () => resolve(false) // silent fails → no popup, just return false
		});
		// empty prompt ⇒ silent attempt (no UI). If it can’t, error_callback fires.
		tc.requestAccessToken({ prompt: '' });
	});
}

/** Sign out: revoke token and clear storage */
export function signOut() {
	const t = get(accessToken);
	// @ts-ignore
	if (t) google.accounts.oauth2.revoke(t, () => {});
	accessToken.set(null);
	expiry = 0;
	userEmail.set(null);
	try {
		sessionStorage.removeItem(KEY);
	} catch {}
}
