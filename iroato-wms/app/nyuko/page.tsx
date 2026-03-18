'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, Session } from '@/lib/auth';
import { SystemSettings, DEFAULT_SETTINGS, fetchSystemSettings, isItemCC } from '@/lib/systemSettings';

declare global { interface Window { IroatoReader: any; } }

type Step = 1 | 2 | 3;
interface ItemRecord { id: number; barcode: string; cc_code: string; name: string; quantity: number; status: string; received_at: string; }
interface ProductMaster { id: number; barcode: string; cc_code: string | null; name: string; unit: string; }

export default function NyukoPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [sysSettings, setSysSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [step, setStep] = useState<Step>(1);
  const [barcode, setBarcode] = useState('');
  const [ccCode, setCcCode] = useState('');
  const [productName, setProductName] = useState('');
  const [productMaster, setProductMaster] = useState<ProductMaster | null>(null);
  const [qty, setQty] = useState(1);
  const [lot, setLot] = useState('');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<ItemRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [manualBarcodeVisible, setManualBarcodeVisible] = useState(false);
  const [manualCCVisible, setManualCCVisible] = useState(false);
  const [manualBarcodeVal, setManualBarcodeVal] = useState('');
  const [manualCCVal, setManualCCVal] = useState('');
  const [allProducts, setAllProducts] = useState<ProductMaster[]>([]);
  const [barcodeSuggestions, setBarcodeSuggestions] = useState<ProductMaster[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.push('/auth'); return; }
    setSession(s);
    fetchTodayData();
    fetchSystemSettings().then(setSysSettings);
    fetchAllProducts();
  }, [router]);

  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const fetchTodayData = async () => {
    const res = await fetch('/api/items');
    const data = await res.json();
    if (data.success) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayItems = (data.items as ItemRecord[]).filter(i =>
        (i.received_at || '').slice(0, 10) === todayStr
      );
      setHistory(todayItems.slice().reverse().slice(0, 50));
    }
  };

  const fetchAllProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) setAllProducts(data.products || []);
    } catch { /* ignore */ }
  };

  const handleManualBarcodeChange = (val: string) => {
    setManualBarcodeVal(val);
    if (!val.trim()) { setBarcodeSuggestions([]); return; }
    const q = val.toLowerCase();
    const filtered = allProducts.filter(p =>
      p.barcode.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    ).slice(0, 8);
    setBarcodeSuggestions(filtered);
  };

  const selectSuggestion = (p: ProductMaster) => {
    setBarcodeSuggestions([]);
    setManualBarcodeVisible(false);
    setManualBarcodeVal('');
    handleBarcodeResult(p.barcode);
  };

  const isIroatoAvailable = () => { try { return typeof window.IroatoReader !== 'undefined'; } catch { return false; } };

  const scanBarcode = () => {
    if (!isIroatoAvailable()) { setManualBarcodeVisible(true); return; }
    try {
      const reader = new window.IroatoReader('barcode', { mode: window.IroatoReader.single, resolution: window.IroatoReader.r1280x720, lineColor: window.IroatoReader.green, lineWidth: 10, labelText: '現品票のバーコードをスキャンしてください' });
      reader.read((res: any) => {
        const code = res?.data?.codes?.[0]?.code;
        if (code) handleBarcodeResult(code);
        else showToast('バーコードを読み取れませんでした', 'error');
      });
    } catch { setManualBarcodeVisible(true); }
  };

  const handleBarcodeResult = async (code: string) => {
    const trimmed = code.trim();
    setBarcode(trimmed);
    // 製品マスタを検索して品名・CCコードを自動入力
    try {
      const res = await fetch(`/api/products?barcode=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.success && data.product) {
        setProductMaster(data.product);
        setProductName(data.product.name);
      } else {
        setProductMaster(null);
        setProductName('');
      }
    } catch {
      setProductMaster(null);
      setProductName('');
    }
    setStep(2);
    setTimeout(() => scanCC(), 350);
  };

  const confirmManualBarcode = () => {
    if (!manualBarcodeVal.trim()) { showToast('バーコード値を入力してください', 'error'); return; }
    setManualBarcodeVisible(false);
    handleBarcodeResult(manualBarcodeVal.trim());
    setManualBarcodeVal('');
  };

  const scanCC = () => {
    if (!isIroatoAvailable()) { setManualCCVisible(true); return; }
    try {
      const reader = new window.IroatoReader('cc', { mode: window.IroatoReader.single, resolution: window.IroatoReader.r1280x720, lineColor: window.IroatoReader.green, lineWidth: 10, errLineColor: window.IroatoReader.red, labelText: '製品に貼られたカメレオンコードをスキャン' });
      reader.read((res: any) => {
        const code = res?.data?.codes?.[0]?.code;
        if (code) handleCCResult(code);
        else showToast('カメレオンコードを読み取れませんでした', 'error');
      });
    } catch { setManualCCVisible(true); }
  };

  const handleCCResult = (code: string) => {
    const trimmed = code.trim();
    if (!isItemCC(trimmed, sysSettings)) {
      showToast(`❌ CCコード「${trimmed}」は品目用の範囲外です（${sysSettings.item_cc_min}〜${sysSettings.item_cc_max}）`, 'error');
      return;
    }
    setCcCode(trimmed); setStep(3); setQty(1); setLot(''); setNote('');
  };
  const confirmManualCC = () => {
    if (!manualCCVal.trim()) { showToast('CCコード値を入力してください', 'error'); return; }
    setManualCCVisible(false); handleCCResult(manualCCVal.trim()); setManualCCVal('');
  };

  const registerItem = async () => {
    if (!barcode || !ccCode) return;
    try {
      const res = await fetch('/api/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode, cc_code: ccCode, name: productName.trim() || barcode, quantity: qty, notes: note ? (lot ? `ロット:${lot} ${note}` : note) : (lot ? `ロット:${lot}` : ''), status: 'received', created_by: session?.userId || 'system' }) });
      const data = await res.json();
      if (data.success) { showToast('✓ 入庫登録完了！', 'success'); fetchTodayData(); resetAll(); }
      else showToast(data.error || '登録に失敗しました', 'error');
    } catch { showToast('通信エラーが発生しました', 'error'); }
  };

  const resetAll = () => {
    setStep(1); setBarcode(''); setCcCode(''); setProductName(''); setProductMaster(null); setQty(1); setLot(''); setNote('');
    setManualBarcodeVisible(false); setManualCCVisible(false); setManualBarcodeVal(''); setManualCCVal('');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const P = '#1a56db', S = '#057a55', M = '#6b7280', B = '#e5e7eb';
  const statusLabel = (s: string) => ({ received: '入庫済', located: 'ロケ済', picked: 'ピック済', shipped: '出荷済' }[s] || s);

  if (!session) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: "-apple-system,'Hiragino Kaku Gothic ProN',sans-serif", color: '#111827', paddingBottom: 40 }}>
      {/* HEADER */}
      <div style={{ background: P, color: '#fff', padding: '12px 16px 10px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ background: 'rgba(255,255,255,.2)', borderRadius: 8, color: '#fff', padding: '7px 12px', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>← 戻る</a>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>📦 入庫処理</h1>
          <div style={{ width: 60 }} />
        </div>
      </div>

      {/* STEP BAR */}
      <div style={{ display: 'flex', padding: '12px 16px 8px', background: '#fff', borderBottom: `1px solid ${B}` }}>
        {[{ n: 1, label: 'バーコード' }, { n: 2, label: 'CCコード' }, { n: 3, label: '確認・登録' }].map(({ n, label }, i) => {
          const isDone = n < step; const isActive = n === step;
          return (
            <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
              {i < 2 && <div style={{ position: 'absolute', top: 11, left: '50%', width: '100%', height: 2, background: isDone ? P : '#ddd' }} />}
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: isActive ? P : isDone ? '#3b82f6' : '#e0e0e0', color: isActive || isDone ? '#fff' : '#aaa', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                {isDone ? '✓' : n}
              </div>
              <div style={{ fontSize: 10, color: isActive ? P : isDone ? '#3b82f6' : '#aaa', marginTop: 3, textAlign: 'center', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>{label}</div>
            </div>
          );
        })}
      </div>

      {/* CONTENT */}
      <div style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        {/* STEP 1 */}
        {step === 1 && (
          <div>
            <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: M, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>STEP 1 — 現品票バーコード読み取り</div>
              <div style={{ background: '#f3f4f6', border: `2px solid ${B}`, borderRadius: 10, padding: '14px 16px', minHeight: 54, display: 'flex', alignItems: 'center', fontSize: 14, color: M }}>バーコード未スキャン</div>
              <button onClick={scanBarcode} style={{ width: '100%', padding: 18, border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: 'pointer', background: P, color: '#fff', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>〓</span> バーコードをスキャン
              </button>
              <button onClick={() => setManualBarcodeVisible(v => !v)} style={{ width: '100%', padding: 13, border: `2px solid ${B}`, borderRadius: 10, background: 'transparent', fontSize: 15, fontWeight: 600, color: M, cursor: 'pointer', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>✏️ 手動入力</button>
              {manualBarcodeVisible && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 13, color: M, marginBottom: 4, display: 'block' }}>バーコード（品目番号）または品目名称で検索</label>
                  <div style={{ position: 'relative' }}>
                    <input autoFocus type="text" value={manualBarcodeVal} onChange={e => handleManualBarcodeChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmManualBarcode()} placeholder="品目番号または品目名称" inputMode="text" style={{ width: '100%', padding: '12px 14px', border: `1px solid ${B}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} />
                    {barcodeSuggestions.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${B}`, borderRadius: 8, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,.15)', maxHeight: 260, overflowY: 'auto' }}>
                        {barcodeSuggestions.map(p => (
                          <div key={p.id} onMouseDown={() => selectSuggestion(p)} style={{ padding: '11px 14px', borderBottom: `1px solid ${B}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: P }}>{p.barcode}</span>
                            <span style={{ fontSize: 13, color: M }}>{p.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={confirmManualBarcode} style={{ width: '100%', padding: 14, border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, background: S, color: '#fff', cursor: 'pointer', marginTop: 8 }}>✓ 確定</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div>
            <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: M, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>STEP 1 完了 — 読み取りバーコード</div>
              <div style={{ background: '#f0fdf4', border: `2px solid ${S}`, borderRadius: 10, padding: '14px 16px', fontSize: 22, fontWeight: 700, color: S, wordBreak: 'break-all' }}>{barcode}</div>
            </div>
            <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: M, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>STEP 2 — カメレオンコード読み取り</div>
              <div style={{ background: '#f3f4f6', border: `2px solid ${B}`, borderRadius: 10, padding: '14px 16px', minHeight: 54, display: 'flex', alignItems: 'center', fontSize: 14, color: M }}>カメレオンコード未スキャン</div>
              <button onClick={scanCC} style={{ width: '100%', padding: 18, border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: 'pointer', background: P, color: '#fff', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>🔵</span> カメレオンコードをスキャン
              </button>
              <button onClick={() => setManualCCVisible(v => !v)} style={{ width: '100%', padding: 13, border: `2px solid ${B}`, borderRadius: 10, background: 'transparent', fontSize: 15, fontWeight: 600, color: M, cursor: 'pointer', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>✏️ 手動入力</button>
              {manualCCVisible && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 13, color: M, marginBottom: 4, display: 'block' }}>カメレオンコード値</label>
                  <input autoFocus type="text" value={manualCCVal} onChange={e => setManualCCVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && confirmManualCC()} placeholder="CCコードを入力" inputMode="text" style={{ width: '100%', padding: '12px 14px', border: `1px solid ${B}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} />
                  <button onClick={confirmManualCC} style={{ width: '100%', padding: 14, border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, background: S, color: '#fff', cursor: 'pointer', marginTop: 8 }}>✓ 確定</button>
                </div>
              )}
            </div>
            <button onClick={resetAll} style={{ width: '100%', padding: 13, border: `2px solid ${B}`, borderRadius: 10, background: 'transparent', fontSize: 15, fontWeight: 600, color: M, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>← バーコードからやり直す</button>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div>
            {productMaster && (
              <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#065f46', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <span><strong>製品マスタから自動入力</strong>: {productMaster.name}（単位: {productMaster.unit}）</span>
              </div>
            )}
            <div style={{ background: '#fff', border: `1px solid ${B}`, borderRadius: 12, padding: 20, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: M, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>登録内容の確認</div>
              {[{ label: 'バーコード\n(品目番号)', value: barcode, big: true }, { label: 'CCコード', value: ccCode, big: false }].map(row => (
                <div key={row.label} style={{ display: 'flex', borderBottom: `1px solid ${B}`, padding: '10px 0' }}>
                  <div style={{ width: 110, fontSize: 13, color: M, flexShrink: 0, whiteSpace: 'pre-line' }}>{row.label}</div>
                  <div style={{ fontSize: row.big ? 18 : 14, fontWeight: 600, color: row.big ? P : '#111827', wordBreak: 'break-all' }}>{row.value}</div>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${B}`, padding: '10px 0', gap: 8 }}>
                <div style={{ width: 110, fontSize: 13, color: M, flexShrink: 0 }}>品名</div>
                <input type="text" value={productName} onChange={e => setProductName(e.target.value)}
                  placeholder={`品名（未入力時は品目番号を使用）`}
                  style={{ flex: 1, padding: '6px 10px', border: `1px solid ${B}`, borderRadius: 6, fontSize: 14, fontWeight: 600, minWidth: 0 }} />
              </div>
              <div style={{ height: 12 }} />
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: M, marginBottom: 4, display: 'block' }}>数量（個数）</label>
                <input type="number" value={qty} onChange={e => setQty(Number(e.target.value))} min={1} inputMode="numeric" style={{ width: '100%', padding: '12px 14px', border: `1px solid ${B}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, color: M, marginBottom: 4, display: 'block' }}>ロット番号（任意）</label>
                <input type="text" value={lot} onChange={e => setLot(e.target.value)} placeholder="例: LOT-240101" style={{ width: '100%', padding: '12px 14px', border: `1px solid ${B}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: M, marginBottom: 4, display: 'block' }}>備考（任意）</label>
                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="メモ" style={{ width: '100%', padding: '12px 14px', border: `1px solid ${B}`, borderRadius: 8, fontSize: 16, boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 12, padding: 20 }}>
              <button onClick={registerItem} style={{ width: '100%', padding: 18, border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: 'pointer', background: S, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>✓ 入庫登録する</button>
              <button onClick={resetAll} style={{ width: '100%', padding: 13, border: `2px solid ${B}`, borderRadius: 10, background: 'transparent', fontSize: 15, fontWeight: 600, color: M, cursor: 'pointer', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>↩ 最初からやり直す</button>
            </div>
          </div>
        )}
      </div>

      {/* HISTORY */}
      <div style={{ marginTop: 8 }}>
        <div onClick={() => setHistoryOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', borderTop: `1px solid ${B}`, cursor: 'pointer' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>📋 本日の入庫一覧</h3>
          <span style={{ fontSize: 12, color: P }}>{historyOpen ? '非表示 ▲' : '表示する ▼'}</span>
        </div>
        {historyOpen && (
          <div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: M }}><div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>本日の入庫はありません</div>
            ) : history.map(item => (
              <div key={item.id} style={{ padding: '12px 16px', borderBottom: `1px solid ${B}`, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>{item.barcode}</span>
                  <span style={{ color: M, fontSize: 16 }}>→</span>
                  <span style={{ fontSize: 13, color: P, fontWeight: 600 }}>CC: {item.cc_code}</span>
                  {item.quantity > 1 && <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 20, fontSize: 12, fontWeight: 600, padding: '2px 8px' }}>×{item.quantity}</span>}
                  <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 20, fontSize: 12, fontWeight: 600, padding: '2px 8px' }}>{statusLabel(item.status)}</span>
                </div>
                {item.name && item.name !== item.barcode && <div style={{ fontSize: 11, color: M, marginTop: 4 }}>📋 {item.name}</div>}
                <div style={{ fontSize: 11, color: M, marginTop: 2 }}>{new Date(item.received_at).toLocaleString('ja-JP')}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 200, width: 'calc(100% - 32px)', maxWidth: 440, pointerEvents: 'none' }}>
          <div style={{ background: '#111827', color: '#fff', padding: '13px 18px', borderRadius: 10, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 20px rgba(0,0,0,.3)', borderLeft: `4px solid ${toast.type === 'success' ? '#34d399' : toast.type === 'error' ? '#f87171' : '#fbbf24'}` }}>
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : '⚠'} {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
