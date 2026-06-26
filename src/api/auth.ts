import { api } from './client';
import type { AdventureKey } from '../config';

export interface Guardian {
  credential_id: number;
  guardian_id: string;
  display_name: string | null;
  adventure_key: AdventureKey | string;
  participant_type: string;
}

/** Validate Guardian credentials; on success the proxy sets the session cookie. */
export function guardianLogin(guardianId: string, guardianSecret: string) {
  return api.post<{ success: boolean; guardian: Guardian; is_first_login: boolean }>(
    '/auth/guardian-login',
    {
      guardian_id: guardianId,
      guardian_secret: guardianSecret,
    }
  );
}

export type TokenLoginResponse =
  | { success: true; guardian: Guardian; is_first_login: boolean }
  | { success: false; redirect_to_gate: true; guardian_id: string };

/**
 * Redeem a QR login token. Two outcomes:
 *  - success: proxy sets the session cookie and returns the guardian identity.
 *  - redirect_to_gate: the permanent QR was already used; caller should send
 *    the player to /<guardian_id> to enter their secret instead.
 */
export function guardianTokenLogin(token: string) {
  return api.post<TokenLoginResponse>('/auth/guardian-qr-login', { token });
}

/** Returns the current Guardian if the session cookie is valid, else throws 401. */
export function fetchMe() {
  return api.get<{ success: boolean; guardian: Guardian }>('/auth/me');
}

/** Clears the session cookie. */
export function guardianLogout() {
  return api.post<{ success: boolean }>('/auth/logout');
}
