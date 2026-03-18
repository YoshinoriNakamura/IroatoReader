/**
 * IroatoWMS 認証モジュール (Next.js版)
 */

export interface User {
  id: string;
  name: string;
  password: string;
  role: 'admin' | 'user';
  active: boolean;
}

export interface Session {
  userId: string;
  userName: string;
  role: 'admin' | 'user';
  loginAt: number;
}

const SESSION_KEY = 'wms_session';
const USERS_KEY   = 'wms_users';
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8時間

const DEFAULT_ADMIN: User = {
  id: 'admin',
  name: '管理者',
  password: 'admin1234',
  role: 'admin',
  active: true,
};

export function getUsers(): User[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) {
    const users = [DEFAULT_ADMIN];
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return users;
  }
  return JSON.parse(raw);
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  const session: Session = JSON.parse(raw);
  if (Date.now() - session.loginAt > SESSION_TIMEOUT) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  return session;
}

/** DBベースのログイン（非同期） */
export async function loginAsync(userId: string, password: string): Promise<{ success: boolean; session?: Session; message?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password }),
    });
    const data = await res.json();
    if (data.success && data.session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(data.session));
      return { success: true, session: data.session };
    }
    // DBエラー時はlocalStorageフォールバック
    if (data.dbError) return loginLocal(userId, password);
    return { success: false, message: data.message || 'ログインに失敗しました' };
  } catch {
    return loginLocal(userId, password);
  }
}

/** localStorageフォールバックログイン（オフライン・DB未到達時） */
function loginLocal(userId: string, password: string): { success: boolean; session?: Session; message?: string } {
  const users = getUsers();
  const user = users.find(u => u.id === userId && u.active);
  if (!user) return { success: false, message: 'ユーザーが見つかりません' };
  if (user.password !== password) return { success: false, message: 'パスワードが違います' };
  const session: Session = { userId: user.id, userName: user.name, role: user.role, loginAt: Date.now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { success: true, session };
}

/** 後方互換用（同期版、localStorageのみ） */
export function login(userId: string, password: string): { success: boolean; session?: Session; message?: string } {
  return loginLocal(userId, password);
}

export function logout() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
}
