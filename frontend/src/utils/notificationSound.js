// The chime played when a notification arrives. It's made in the browser (Web Audio), so there
// is no sound file to load. Browsers only allow sound after the user has clicked or typed on
// the page, so the audio is switched on at the first click or key press.

const MUTED_KEY = 'troid:notification-sound';
const LAST_CHIMED_KEY = 'troid:last-chimed-notification';
const MUTED_EVENT = 'troid:notification-sound-changed';

let context = null;

function audio() {
  if (context) return context;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  context = new AudioContext();
  return context;
}

function unlock() {
  const ctx = audio();
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
}

if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown', 'touchstart'].forEach((event) => window.addEventListener(event, unlock, { passive: true }));
}

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the setting lasts until the page is reloaded.
  }
}

let mutedHere = read(MUTED_KEY) === 'off';

export function isSoundMuted() {
  return mutedHere;
}

export function setSoundMuted(muted) {
  mutedHere = muted;
  write(MUTED_KEY, muted ? 'off' : 'on');
  window.dispatchEvent(new Event(MUTED_EVENT));
  if (!muted) playChime();
}

export function subscribeSoundMuted(listener) {
  const onStorage = (e) => {
    if (e.key === MUTED_KEY) {
      mutedHere = e.newValue === 'off';
      listener();
    }
  };
  window.addEventListener(MUTED_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(MUTED_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** A short two-note chime. */
export function playChime() {
  const ctx = audio();
  if (!ctx || ctx.state !== 'running') return;
  const start = ctx.currentTime + 0.01;
  [[880, 0], [1318.5, 0.12]].forEach(([frequency, offset]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const at = start + offset;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.5);
  });
}

/**
 * Chimes for a notification newer than any chimed before, unless muted. The newest chimed id is
 * shared between tabs, so a user with several tabs open hears it once.
 */
export function chimeFor(notificationId) {
  const last = Number(read(LAST_CHIMED_KEY)) || 0;
  if (!notificationId || notificationId <= last) return;
  write(LAST_CHIMED_KEY, String(notificationId));
  if (!mutedHere) playChime();
}

/** Marks notifications up to this id as already heard, e.g. those waiting when the user signs in. */
export function markHeard(notificationId) {
  const last = Number(read(LAST_CHIMED_KEY)) || 0;
  if (notificationId > last) write(LAST_CHIMED_KEY, String(notificationId));
}
