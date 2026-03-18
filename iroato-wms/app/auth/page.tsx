'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginAsync } from '@/lib/auth';

export default function AuthPage() {
  const router = useRouter();
  const [userId, setUserId]     = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await loginAsync(userId, password);
    if (result.success) {
      router.push('/');
    } else {
      setError(result.message || 'ログインに失敗しました');
    }
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1.5px solid #d1d5db',
    fontSize: '16px',
    outline: 'none',
    boxSizing: 'border-box',
    background: '#ffffff',
    color: '#111827',
    WebkitTextFillColor: '#111827',
    colorScheme: 'light',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "-apple-system, 'Hiragino Kaku Gothic ProN', sans-serif", colorScheme: 'light' }}>
      <div style={{ background: '#ffffff', borderRadius: '16px', padding: '40px 32px', width: '100%', maxWidth: '380px', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', color: '#111827' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>📦</div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#1e3a8a', margin: 0 }}>IroatoWMS</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px' }}>倉庫管理システム</p>
        </div>

        <form onSubmit={handleLogin} autoComplete="on">
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>ユーザーID</label>
            <input
              type="text"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="ユーザーIDを入力"
              autoComplete="username"
              required
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>パスワード</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="パスワードを入力"
              autoComplete="current-password"
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #1e3a8a, #1a56db)', color: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '11px', marginTop: '24px' }}>
          IroatoWMS v1.0 — InfoFarm Co., Ltd.
        </p>
      </div>
    </div>
  );
}
