// The signed-in user's API session, shared with services/api.js so every
// request can carry it. App.jsx sets it on login/restore and clears it on logout.
let session = null;

export const UNAUTHORIZED_EVENT = 'troid:unauthorized';

export function setSession(user) {
  session = user?.id && user?.session_token ? { id: user.id, token: user.session_token } : null;
}

export function hasSession() {
  return session !== null;
}

export function getAuthHeaders() {
  return session ? { Authorization: `Session ${session.id}:${session.token}` } : {};
}
