// Per-tab UI conveniences (e.g. History filters). Kept out of the URL because search terms can
// be health information, and wiped whenever the signed-in user changes.
const PREFIX = 'ht.';

export function readSessionState(key, fallback) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function writeSessionState(key, value) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota): the UI simply won't remember this.
  }
}

export function clearSessionState() {
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // ignore
  }
}
