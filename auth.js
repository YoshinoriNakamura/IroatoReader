/**
 * IroatoWMS 認証モジュール v1.0
 * LocalStorageベースのシンプル認証システム
 * IroatoReader.userInfo[0] をユーザーIDとして優先利用
 */

const WMSAuth = (() => {
  const SESSION_KEY = 'wms_session';
  const USERS_KEY = 'wms_users';
  const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8時間

  // デフォルト管理者ユーザー（初回のみ）
  const DEFAULT_ADMIN = {
    id: 'admin',
    name: '管理者',
    password: 'admin1234',
    role: 'admin', // admin / user
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'system',
    updatedBy: 'system'
  };

  // ユーザー一覧取得
  function getUsers() {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      // 初回: デフォルト管理者を登録
      const users = [DEFAULT_ADMIN];
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      return users;
    }
    return JSON.parse(raw);
  }

  // ユーザー保存
  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  // セッション取得
  function getSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    // タイムアウトチェック
    if (Date.now() - session.loginAt > SESSION_TIMEOUT) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  }

  // セッション保存
  function saveSession(user) {
    const session = {
      userId: user.id,
      userName: user.name,
      role: user.role,
      loginAt: Date.now()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  // ログイン（手動入力）
  // ※ userInfo[0]による自動IDの上書きは行わない。自動ログインはtryAutoLogin()を使う。
  function login(userId, password) {
    const users = getUsers();
    const user = users.find(u => u.id === userId && u.active);
    if (!user) return { success: false, message: 'ユーザーが見つかりません' };
    if (user.password !== password) return { success: false, message: 'パスワードが違います' };

    const session = saveSession(user);
    return { success: true, session };
  }

  // IroatoReader.userInfo[0] による自動ログイン試行
  function tryAutoLogin() {
    try {
      if (typeof IroatoReader !== 'undefined' && IroatoReader.userInfo && IroatoReader.userInfo[0]) {
        const iroatoUserId = IroatoReader.userInfo[0].trim();
        if (iroatoUserId !== '') {
          const users = getUsers();
          const user = users.find(u => u.id === iroatoUserId && u.active);
          if (user) {
            const session = saveSession(user);
            return { success: true, session, auto: true };
          }
        }
      }
    } catch (e) { /* 無視 */ }
    return { success: false };
  }

  // ログアウト
  function logout() {
    localStorage.removeItem(SESSION_KEY);
  }

  // 認証チェック（未ログインならauth.htmlへリダイレクト）
  function requireAuth(redirectTo) {
    // まず自動ログイン試行
    const autoResult = tryAutoLogin();
    if (autoResult.success) return autoResult.session;

    const session = getSession();
    if (!session) {
      const current = encodeURIComponent(window.location.href);
      const target = redirectTo || 'auth.html';
      window.location.href = `${target}?redirect=${current}`;
      return null;
    }
    return session;
  }

  // 管理者権限チェック
  function requireAdmin() {
    const session = getSession();
    if (!session || session.role !== 'admin') {
      alert('この操作には管理者権限が必要です。');
      return null;
    }
    return session;
  }

  // 現在のユーザー名取得（監査フィールド用）
  function getCurrentUserName() {
    const session = getSession();
    if (session) return session.userName;
    // IroatoReader環境
    try {
      if (typeof IroatoReader !== 'undefined' && IroatoReader.userInfo && IroatoReader.userInfo[0]) {
        return IroatoReader.userInfo[0];
      }
    } catch (e) {}
    return 'unknown';
  }

  // 現在のユーザーID取得
  function getCurrentUserId() {
    const session = getSession();
    if (session) return session.userId;
    try {
      if (typeof IroatoReader !== 'undefined' && IroatoReader.userInfo && IroatoReader.userInfo[0]) {
        return IroatoReader.userInfo[0];
      }
    } catch (e) {}
    return 'unknown';
  }

  // 監査フィールド生成（新規登録用）
  function newAuditFields() {
    const now = new Date().toISOString();
    const user = getCurrentUserName();
    return {
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: user,
      updatedBy: user,
      deletedBy: null
    };
  }

  // 監査フィールド更新（更新用）
  function updateAuditFields(record) {
    const now = new Date().toISOString();
    const user = getCurrentUserName();
    return {
      ...record,
      updatedAt: now,
      updatedBy: user
    };
  }

  // 監査フィールド削除マーク（論理削除用）
  function deleteAuditFields(record) {
    const now = new Date().toISOString();
    const user = getCurrentUserName();
    return {
      ...record,
      deletedAt: now,
      deletedBy: user,
      updatedAt: now,
      updatedBy: user
    };
  }

  // ユーザー追加（管理者用）
  function addUser(newUser) {
    const session = requireAdmin();
    if (!session) return { success: false, message: '権限がありません' };

    const users = getUsers();
    if (users.find(u => u.id === newUser.id)) {
      return { success: false, message: 'ユーザーIDが既に存在します' };
    }
    const now = new Date().toISOString();
    const user = {
      ...newUser,
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: session.userName,
      updatedBy: session.userName
    };
    users.push(user);
    saveUsers(users);
    return { success: true, user };
  }

  // ユーザー更新（管理者用）
  function updateUser(userId, updates) {
    const session = requireAdmin();
    if (!session) return { success: false, message: '権限がありません' };

    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return { success: false, message: 'ユーザーが見つかりません' };

    users[idx] = {
      ...users[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: session.userName
    };
    saveUsers(users);
    return { success: true, user: users[idx] };
  }

  // パスワード変更
  function changePassword(userId, oldPass, newPass) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) return { success: false, message: 'ユーザーが見つかりません' };
    if (users[idx].password !== oldPass) return { success: false, message: '現在のパスワードが違います' };

    users[idx].password = newPass;
    users[idx].updatedAt = new Date().toISOString();
    users[idx].updatedBy = userId;
    saveUsers(users);
    return { success: true };
  }

  // ログインユーザー情報をUIに表示
  function renderUserBadge(containerId) {
    const session = getSession();
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!session) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#555;">
        <span style="background:#e8f4e8;border-radius:12px;padding:3px 10px;font-weight:600;color:#2d7a2d;">
          👤 ${session.userName}
        </span>
        <button onclick="WMSAuth.logout();window.location.href='auth.html';"
          style="background:#fee;border:1px solid #fcc;border-radius:8px;padding:3px 8px;font-size:11px;color:#c44;cursor:pointer;">
          ログアウト
        </button>
      </div>
    `;
  }

  // 公開API
  return {
    login,
    logout,
    getSession,
    requireAuth,
    requireAdmin,
    getCurrentUserName,
    getCurrentUserId,
    newAuditFields,
    updateAuditFields,
    deleteAuditFields,
    getUsers,
    addUser,
    updateUser,
    changePassword,
    renderUserBadge,
    tryAutoLogin
  };
})();
