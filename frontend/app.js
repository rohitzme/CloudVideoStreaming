const SESSION_KEYS = ['cves_token', 'cves_user'];

function getToken() {
  return sessionStorage.getItem('cves_token') || localStorage.getItem('cves_token');
}

function getStoredUser() {
  try {
    return JSON.parse(sessionStorage.getItem('cves_user') || localStorage.getItem('cves_user') || 'null');
  } catch { return null; }
}

function saveSession(data, remember) {
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem('cves_token', data.token);
  storage.setItem('cves_user', JSON.stringify(data.user));
  if (!remember) {
    localStorage.removeItem('cves_token');
    localStorage.removeItem('cves_user');
  }
}

function clearSession() {
  SESSION_KEYS.forEach(key => { sessionStorage.removeItem(key); localStorage.removeItem(key); });
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    clearSession();
    if (!location.pathname.endsWith('login.html')) location.href = 'login.html';
  }
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body.error || body || `Request failed (${response.status})`);
  return body;
}

async function requireAuth(role = null) {
  if (!getToken()) { location.href = 'login.html'; return null; }
  try {
    const data = await apiFetch('/api/me');
    if (role && data.user.role !== role) {
      location.href = 'stream.html';
      return null;
    }
    return data.user;
  } catch { return null; }
}

function logout() {
  clearSession();
  location.href = 'login.html';
}

function formatBytes(bytes) {
  if (!Number(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}
