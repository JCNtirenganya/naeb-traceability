import { CFG } from "../config.js";

const listeners = [];
let tokenVal = null, expires = 0, userInfo = null, appRole = "viewer";

const TOK_KEY = "naeb_tok", EXP_KEY = "naeb_exp", USER_KEY = "naeb_user";

export function onAuthChange(fn) { listeners.push(fn); }
function emit() { listeners.forEach(fn => fn({ token: tokenVal, user: userInfo, role: appRole })); }

export const token = () => (tokenVal && Date.now() < expires ? tokenVal : null);
export const user = () => userInfo;
export const role = () => appRole;
export const can = (what) => {
  if (what === "admin") return appRole === "admin";
  if (what === "edit") return appRole === "admin" || appRole === "editor";
  return true;
};

function restore() {
  tokenVal = sessionStorage.getItem(TOK_KEY);
  expires = +sessionStorage.getItem(EXP_KEY) || 0;
  try { userInfo = JSON.parse(sessionStorage.getItem(USER_KEY) || "null"); } catch { userInfo = null; }
  if (!token()) { tokenVal = null; userInfo = null; }
  appRole = mapRole(userInfo);
}

function mapRole(u) {
  if (!u) return "viewer";
  const groups = (u.groups || []).map(g => String(g.id));
  const g = CFG.ROLE_GROUPS;
  if ((g.admin || []).some(id => groups.includes(id))) return "admin";
  if ((g.editor || []).some(id => groups.includes(id))) return "editor";
  if ((g.viewer || []).some(id => groups.includes(id))) return "viewer";
  if (u.role === "orgAdmin") return "admin";
  if (u.role === "publisher" || u.role === "orgPublisher") return "editor";
  return "viewer";
}

export async function login(username, password) {
  const body = new URLSearchParams({
    username, password, client: "referer", referer: location.origin,
    expiration: "120", f: "json"
  });
  let r;
  try {
    r = await fetch(`${CFG.PORTAL}/sharing/rest/generateToken`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body
    });
  } catch {
    throw new Error("Cannot reach the portal (network or CORS). Ask the GIS admin to allow this site's origin.");
  }
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "Sign-in failed");
  tokenVal = d.token;
  expires = +d.expires || Date.now() + 72e5;
  sessionStorage.setItem(TOK_KEY, tokenVal);
  sessionStorage.setItem(EXP_KEY, String(expires));
  await loadUser();
  emit();
  return userInfo;
}

async function loadUser() {
  try {
    const r = await fetch(`${CFG.PORTAL}/sharing/rest/community/self?f=json&token=${encodeURIComponent(tokenVal)}`);
    const u = await r.json();
    if (u.error) throw new Error(u.error.message);
    userInfo = {
      username: u.username, fullName: u.fullName || u.username, role: u.role,
      email: u.email || "", groups: u.groups || []
    };
  } catch {
    userInfo = { username: "user", fullName: "Signed-in user", role: "user", groups: [] };
  }
  sessionStorage.setItem(USER_KEY, JSON.stringify(userInfo));
  appRole = mapRole(userInfo);
}

export function logout() {
  tokenVal = null; expires = 0; userInfo = null; appRole = "viewer";
  sessionStorage.removeItem(TOK_KEY); sessionStorage.removeItem(EXP_KEY); sessionStorage.removeItem(USER_KEY);
  emit();
}

export async function ensureRestored() {
  restore();
  if (token() && userInfo) { await loadUser(); emit(); return true; }
  if (token() && !userInfo) { await loadUser(); emit(); return true; }
  emit();
  return false;
}

export async function reauthIfExpired() {
  if (token()) return true;
  return false;
}

export function urlToken(u) {
  const tk = token();
  if (!tk) return u;
  return u + (u.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(tk);
}
