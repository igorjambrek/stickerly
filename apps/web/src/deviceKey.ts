/**
 * The passport key, on this device.
 *
 * Its own module because both the API client and the identity store need it,
 * and going through either one to reach the other would make a cycle out of
 * three lines of localStorage.
 *
 * Both directions swallow failures. A private window with storage switched off
 * gets no passport, and the app then behaves exactly as it did before passports
 * existed — which is the point of building this as a layer rather than a gate.
 */

const KEY = 'nalepko.device';

export function readDeviceKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function writeDeviceKey(key: string): void {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    // The passport will not survive a reload. Better than refusing to work.
  }
}
