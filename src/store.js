/* What the app keeps: the links, in the phone's keychain (Android Keystore, iOS Keychain), like a passkey. The page Fenrir
   serves needs none of this: its address is its key. */
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

export const store = {
  async load() {
    try {
      const v = await SecureStorage.get('links');
      if (Array.isArray(v)) return v;
      if (typeof v === 'string' && v) return JSON.parse(v);
    } catch (_) { /* nothing kept yet, or the keychain is locked */ }
    return [];
  },
  async save(list) {
    try { await SecureStorage.set('links', list); return true; } catch (e) { return e && e.message ? e.message : 'the keychain refused it'; }
  },
  async prefix(p) {
    try { await SecureStorage.setKeyPrefix(p); } catch (_) { /* the default prefix works too */ }
  },
};
