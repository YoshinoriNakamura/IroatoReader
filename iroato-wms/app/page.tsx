'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, logout, Session } from '@/lib/auth';

interface TodayStats {
  received: number; located: number; picked: number; shipped: number;
  totalStock: number;
}

const MENU = [
  { href: '/nyuko',    icon: '📥', title: '入庫',         desc: '商品の受け取り・登録',     color: '#1a56db', bg: '#eff6ff' },
  { href: '/location', icon: '📍', title: 'ロケーション', desc: '棚・保管場所の管理',       color: '#6d28d9', bg: '#f5f3ff' },
  { href: '/picking',  icon: '🛒', title: 'ピッキング',   desc: '出荷指示・商品の取り出し', color: '#0891b2', bg: '#f0f9ff' },
  { href: '/shipping', icon: '🚚', title: '出庫',         desc: '出庫処理・出庫確定',       color: '#b45309', bg: '#fffbeb' },
];

export default function HomePage() {
  const router = useRouter();
  const [session, setSession]       = useState<Session | null>(null);
  const [now, setNow]               = useState('');
  const [stats, setStats]           = useState<TodayStats>({ received: 0, located: 0, picked: 0, shipped: 0, totalStock: 0 });
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pwOpen, setPwOpen]         = useState(false);
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [newPw2, setNewPw2]         = useState('');
  const [pwMsg, setPwMsg]           = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwSaving, setPwSaving]     = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.push('/auth'); return; }
    setSession(s);
    fetchStats();

    const tick = () => {
      const d = new Date();
      const days = ['日','月','火','水','木','金','土'];
      setNow(`${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${days[d.getDay()]}）${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [router]);

  // メニュー外タップで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchStats = async () => {
    try {
      const res  = await fetch('/api/items');
      const data = await res.json();
      if (!data.success) return;
      const items = data.items;
      const today = new Date().toISOString().slice(0, 10);
      setStats({
        received:   items.filter((i: any) => (i.received_at || i.created_at)?.slice(0, 10) === today).length,
        located:    items.filter((i: any) => i.status === 'located').length,
        picked:     items.filter((i: any) => i.picked_at?.slice(0, 10) === today).length,
        shipped:    items.filter((i: any) => i.status === 'shipped' && i.updated_at?.slice(0, 10) === today).length,
        totalStock: items.filter((i: any) => ['received','located','picked'].includes(i.status)).length,
      });
    } catch { /* ignore */ }
  };

  const handleLogout = () => { logout(); router.push('/auth'); };

  const handleChangePw = async () => {
    if (!currentPw || !newPw) { setPwMsg({ type: 'error', text: '全項目を入力してください' }); return; }
    if (newPw !== newPw2)     { setPwMsg({ type: 'error', text: '新しいパスワードが一致しません' }); return; }
    if (!session)             return;
    setPwSaving(true);
    try {
      // 現在のパスワードを確認
      const checkRes  = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: session.userId, password: currentPw }) });
      const checkData = await checkRes.json();
      if (!checkData.success) { setPwMsg({ type: 'error', text: '現在のパスワードが違います' }); setPwSaving(false); return; }
      // パスワード更新
      const res  = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: session.userId, password: newPw }) });
      const data = await res.json();
      if (data.success) {
        setPwMsg({ type: 'success', text: '✅ パスワードを変更しました' });
        setCurrentPw(''); setNewPw(''); setNewPw2('');
        setTimeout(() => { setPwOpen(false); setPwMsg(null); setUserMenuOpen(false); }, 1500);
      } else {
        setPwMsg({ type: 'error', text: data.error || '変更に失敗しました' });
      }
    } catch { setPwMsg({ type: 'error', text: '通信エラーが発生しました' }); }
    setPwSaving(false);
  };

  if (!session) return null;

  const STAT_CARDS = [
    { label: '本日入庫',     value: stats.received,   color: '#1a56db', bg: '#eff6ff', icon: '📥' },
    { label: 'ロケ登録済',   value: stats.located,    color: '#6d28d9', bg: '#f5f3ff', icon: '📍' },
    { label: '本日ピック',   value: stats.picked,     color: '#0891b2', bg: '#f0f9ff', icon: '🛒' },
    { label: '本日出庫',     value: stats.shipped,    color: '#b45309', bg: '#fffbeb', icon: '🚚' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "-apple-system, 'Hiragino Kaku Gothic ProN', sans-serif", fontSize: '16px', color: '#0f172a' }}>

      {/* パスワード変更モーダル */}
      {pwOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) { setPwOpen(false); setPwMsg(null); setCurrentPw(''); setNewPw(''); setNewPw2(''); } }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 40px', width: '100%', maxWidth: '480px', boxShadow: '0 -4px 24px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontWeight: 800, fontSize: '17px', color: '#0f172a' }}>🔑 パスワード変更</div>
              <button onClick={() => { setPwOpen(false); setPwMsg(null); setCurrentPw(''); setNewPw(''); setNewPw2(''); }}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', fontSize: '16px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            {pwMsg && (
              <div style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '14px', background: pwMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: pwMsg.type === 'success' ? '#166534' : '#dc2626', fontSize: '13px', fontWeight: 700, border: `1px solid ${pwMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
                {pwMsg.text}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>現在のパスワード</label>
                <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)}
                  placeholder="現在のパスワードを入力"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '15px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>新しいパスワード</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                  placeholder="新しいパスワードを入力"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '15px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>新しいパスワード（確認）</label>
                <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)}
                  placeholder="もう一度入力"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '15px', boxSizing: 'border-box' }} />
              </div>
              <button onClick={handleChangePw} disabled={pwSaving}
                style={{ padding: '14px', background: pwSaving ? '#d1d5db' : '#1a56db', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 700, cursor: pwSaving ? 'not-allowed' : 'pointer', marginTop: '4px' }}>
                {pwSaving ? '変更中...' : '変更する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ヘッダー */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #1a56db 100%)', color: '#fff', padding: '20px 20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          {/* 左：タイトル */}
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px' }}>📦 いろあとWMS</div>
            <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '3px', paddingLeft: '30px', letterSpacing: '0.05em' }}>倉庫管理システム</div>
          </div>

          {/* 右：ユーザー名（タップでメニュー）+ 日時 */}
          <div ref={menuRef} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            {/* ユーザー名バッジ */}
            <button
              onClick={() => { setUserMenuOpen(v => !v); setPwMsg(null); }}
              style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '12px', color: '#fff', fontSize: '13px', padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
              👤 {session.userName} <span style={{ fontSize: '10px', opacity: 0.8 }}>▼</span>
            </button>
            {/* 日時 */}
            <div style={{ fontSize: '12px', opacity: 0.8 }}>{now}</div>

            {/* ドロップダウンメニュー */}
            {userMenuOpen && (
              <div style={{ position: 'absolute', top: '40px', right: 0, background: '#fff', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', zIndex: 200, minWidth: '180px' }}>
                {/* パスワード変更 */}
                <button onClick={() => { setPwOpen(true); setUserMenuOpen(false); setPwMsg(null); }}
                  style={{ width: '100%', padding: '13px 16px', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #f1f5f9', fontSize: '14px', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '12px 12px 0 0' }}>
                  🔑 パスワード変更
                </button>
                {/* ログアウト */}
                <button onClick={handleLogout}
                  style={{ width: '100%', padding: '13px 16px', textAlign: 'left', background: 'none', border: 'none', fontSize: '14px', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '0 0 12px 12px' }}>
                  🚪 ログアウト
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ padding: '16px' }}>
        {/* 本日の処理数量 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: '10px' }}>📊 本日の処理数量</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '6px' }}>
            {STAT_CARDS.map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: '10px', padding: '10px 6px', border: `1px solid ${s.color}22`, textAlign: 'center' }}>
                <div style={{ fontSize: '16px', marginBottom: '3px' }}>{s.icon}</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'right', marginTop: '6px', fontSize: '11px', color: '#94a3b8' }}>
            在庫中合計: <strong style={{ color: '#374151' }}>{stats.totalStock}件</strong>
            <button onClick={fetchStats} style={{ marginLeft: '10px', background: 'none', border: 'none', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>🔄 更新</button>
          </div>
        </div>

        {/* 業務メニュー */}
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', marginBottom: '10px' }}>業務メニュー</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {MENU.map(m => (
            <a key={m.href} href={m.href} style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: '14px', padding: '16px', textDecoration: 'none', color: 'inherit', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '13px', background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginRight: '14px', flexShrink: 0 }}>{m.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '16px', color: m.color }}>{m.title}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{m.desc}</div>
              </div>
              <div style={{ fontSize: '22px', color: '#cbd5e1' }}>›</div>
            </a>
          ))}
        </div>

        {/* 管理者メニュー */}
        {session.role === 'admin' && (
          <>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', margin: '18px 0 10px' }}>管理者メニュー</div>
            <a href="/pc" style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: '14px', padding: '16px', textDecoration: 'none', color: 'inherit', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '13px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginRight: '14px', flexShrink: 0 }}>🖥️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#374151' }}>PC管理画面</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>ダッシュボード・マスタ管理</div>
              </div>
              <div style={{ fontSize: '22px', color: '#cbd5e1' }}>›</div>
            </a>
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: '11px' }}>
        いろあとWMS v1.0 — InfoFarm Co., Ltd.
      </div>
    </div>
  );
}
