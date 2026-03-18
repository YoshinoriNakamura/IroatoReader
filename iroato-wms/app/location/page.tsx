'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, Session } from '@/lib/auth';
import { SystemSettings, DEFAULT_SETTINGS, fetchSystemSettings, isItemCC, isLocCC } from '@/lib/systemSettings';

declare global { interface Window { IroatoReader: any; } }

type Step = 1 | 2 | 3 | 'complete';
interface Item { id: number; barcode: string; cc_code: string; name: string; status: string; location_code: string | null; location_name: string | null; location_cc_code: string | null; }
interface Location { code: string; name: string; cc_code: string | null; }
interface ScannedProduct { ccCode: string; barcode: string; name: string; itemId: number | null; isNew: boolean; prevLocName: string | null; }
interface RecentLoc { code: string; name: string; ccCode: string; }

export default function LocationPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [sysSettings, setSysSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [step, setStep] = useState<Step>(1);
  const [currentLocCC, setCurrentLocCC] = useState('');
  const [currentLocCode, setCurrentLocCode] = useState('');
  const [currentLocName, setCurrentLocName] = useState('');
  const [scannedProducts, setScannedProducts] = useState<ScannedProduct[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [locationMaster, setLocationMaster] = useState<Location[]>([]);
  const [recentLocs, setRecentLocs] = useState<RecentLoc[]>([]);
  const [locManualVisible, setLocManualVisible] = useState(false);
  const [productManualVisible, setProductManualVisible] = useState(false);
  const [locInput, setLocInput] = useState('');
  const [productInput, setProductInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [completeMsg, setCompleteMsg] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.push('/auth'); return; }
    setSession(s);
    fetchData();
    fetchSystemSettings().then(setSysSettings);
    const raw = typeof window !== 'undefined' ? localStorage.getItem('wms_recent_locations') : null;
    if (raw) setRecentLocs(JSON.parse(raw));
  }, [router]);

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const fetchData = async () => {
    const [itemsRes, locsRes] = await Promise.all([fetch('/api/items'), fetch('/api/locations')]);
    const itemsData = await itemsRes.json();
    const locsData = await locsRes.json();
    if (itemsData.success) setAllItems(itemsData.items);
    if (locsData.success) setLocationMaster(locsData.locations);
  };

  const isIroatoAvailable = () => { try { return typeof window.IroatoReader !== 'undefined'; } catch { return false; } };

  const saveRecentLoc = (loc: RecentLoc) => {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem('wms_recent_locations');
    let recent: RecentLoc[] = raw ? JSON.parse(raw) : [];
    recent = recent.filter(r => r.code !== loc.code);
    recent.unshift(loc);
    recent = recent.slice(0, 6);
    localStorage.setItem('wms_recent_locations', JSON.stringify(recent));
    setRecentLocs(recent);
  };

  // STEP 1: ロケーションスキャン
  const scanLocation = () => {
    if (!isIroatoAvailable()) { setLocManualVisible(true); return; }
    const searchCodes = locationMaster.map(l => l.cc_code).filter(Boolean) as string[];
    const displayData: Record<string, string> = {};
    locationMaster.forEach(l => { if (l.cc_code) displayData[l.cc_code] = l.name || l.code; });
    try {
      const opts: any = { mode: window.IroatoReader.single, analyzeLevel: 5, lineColor: window.IroatoReader.green, lineWidth: 10, errLineColor: window.IroatoReader.red, buttonText: 'ロケーションCCスキャン完了' };
      if (searchCodes.length > 0) { opts.searchCodes = searchCodes; opts.displayData = displayData; }
      const reader = new window.IroatoReader('cc', opts);
      reader.read((res: any) => {
        if (res?.data?.codes?.[0]?.code) onLocationScanned(res.data.codes[0].code);
        else showToast('⚠️ スキャンがキャンセルされました');
      });
    } catch { setLocManualVisible(true); }
  };

  const onLocationScanned = (scannedCode: string) => {
    if (!isLocCC(scannedCode, sysSettings)) {
      showToast(`❌ 「${scannedCode}」はロケーション用CCの範囲外です（${sysSettings.loc_cc_min}〜${sysSettings.loc_cc_max}）`);
      return;
    }
    let loc = locationMaster.find(l => l.cc_code === scannedCode) || locationMaster.find(l => l.code === scannedCode.toUpperCase());
    let locCC = scannedCode, locCode = scannedCode, locName = scannedCode;
    if (loc) { locCC = loc.cc_code || scannedCode; locCode = loc.code; locName = loc.name; }
    else showToast('⚠️ マスタ未登録のロケーションです。コードで登録します。');
    setCurrentLocCC(locCC); setCurrentLocCode(locCode); setCurrentLocName(locName);
    saveRecentLoc({ code: locCode, name: locName, ccCode: locCC });
    goToStep2(locCC, locCode, locName);
  };

  const confirmManualLoc = () => {
    const val = locInput.trim();
    if (!val) { showToast('⚠️ コードを入力してください'); return; }
    setLocInput(''); setLocManualVisible(false);
    onLocationScanned(val);
  };

  const goToStep2 = (locCC?: string, locCode?: string, locName?: string) => {
    if (locCC !== undefined) { setCurrentLocCC(locCC); setCurrentLocCode(locCode!); setCurrentLocName(locName!); }
    setScannedProducts([]);
    setStep(2);
    if (!isIroatoAvailable()) setProductManualVisible(true);
  };

  const selectRecentLoc = (loc: RecentLoc) => {
    setCurrentLocCC(loc.ccCode); setCurrentLocCode(loc.code); setCurrentLocName(loc.name);
    saveRecentLoc(loc);
    goToStep2(loc.ccCode, loc.code, loc.name);
  };

  const backToStep1 = () => {
    setStep(1); setCurrentLocCC(''); setCurrentLocCode(''); setCurrentLocName('');
    setScannedProducts([]); setLocManualVisible(false); setProductManualVisible(false);
  };

  // STEP 2: 品目CCスキャン（複数）
  const scanProducts = () => {
    if (!isIroatoAvailable()) { setProductManualVisible(true); return; }
    const productDisplayData: Record<string, string> = {};
    allItems.forEach(i => { if (i.cc_code) productDisplayData[i.cc_code] = i.name || i.barcode || i.cc_code; });
    try {
      const opts: any = { mode: window.IroatoReader.multi, analyzeLevel: 5, lineColor: window.IroatoReader.green, lineWidth: 10, errLineColor: window.IroatoReader.red, buttonText: '品目スキャン完了' };
      if (Object.keys(productDisplayData).length > 0) opts.displayData = productDisplayData;
      const reader = new window.IroatoReader('cc', opts);
      reader.read((res: any) => {
        if (!res?.data?.codes?.length) { showToast('⚠️ スキャンがキャンセルされました'); return; }
        const codes = res.data.codes.map((c: any) => c.code).filter(Boolean);
        let addedCount = 0;
        const newProducts = [...scannedProducts];
        codes.forEach((code: string) => {
          if (addProductToList(code, newProducts)) addedCount++;
        });
        if (addedCount > 0) { setScannedProducts(newProducts); showToast(`✅ ${addedCount}件追加しました（合計: ${newProducts.length}件）`); }
      });
    } catch { setProductManualVisible(true); }
  };

  const addProductToList = (ccCode: string, list: ScannedProduct[]): boolean => {
    if (!ccCode) return false;
    if (!isItemCC(ccCode, sysSettings)) {
      showToast(`❌ 「${ccCode}」は品目用CCの範囲外です（${sysSettings.item_cc_min}〜${sysSettings.item_cc_max}）`);
      return false;
    }
    if (list.find(p => p.ccCode === ccCode)) { showToast(`⚠️ 既に追加済み: ${ccCode.substring(0, 20)}`); return false; }
    const item = allItems.find(i => i.cc_code === ccCode);
    const name = item ? (item.name || item.barcode || item.cc_code) : '（在庫マスタ未登録）';
    const barcode = item ? (item.barcode || '') : '';
    let prevLocName: string | null = null;
    if (item && item.location_code && item.location_code !== currentLocCode) {
      prevLocName = item.location_name || item.location_code;
    }
    list.push({ ccCode, barcode, name, itemId: item ? item.id : null, isNew: !item, prevLocName });
    return true;
  };

  const confirmManualProduct = () => {
    const codes = productInput.split(',').map(c => c.trim()).filter(Boolean);
    let addedCount = 0;
    const newProducts = [...scannedProducts];
    codes.forEach(c => { if (addProductToList(c, newProducts)) addedCount++; });
    setProductInput('');
    if (addedCount > 0) { setScannedProducts(newProducts); showToast(`✅ ${addedCount}件追加しました`); }
  };

  const removeProduct = (idx: number) => {
    setScannedProducts(prev => prev.filter((_, i) => i !== idx));
  };

  const goToStep3 = () => {
    if (scannedProducts.length === 0) { showToast('⚠️ 品目をスキャンしてください'); return; }
    setStep(3);
  };

  // STEP 3: 登録実行
  const saveRegistrations = async () => {
    setSaving(true);
    try {
      await Promise.all(scannedProducts.map(async p => {
        if (p.isNew) {
          await fetch('/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: '', cc_code: p.ccCode, name: p.name, quantity: 1, notes: 'ロケーション登録から仮追加', status: 'located', location_code: currentLocCode, location_cc_code: currentLocCC, location_name: currentLocName, created_by: session?.userName }),
          });
        } else {
          await fetch('/api/items', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: p.itemId, status: 'located', location_code: currentLocCode, location_cc_code: currentLocCC, location_name: currentLocName, updated_by: session?.userName }),
          });
        }
      }));
      const count = scannedProducts.length;
      setCompleteMsg(`${currentLocName} に ${count}件の品目を登録しました`);
      showToast(`✅ ${count}件を ${currentLocName} に登録しました`);
      setStep('complete');
      fetchData();
    } catch { showToast('❌ 登録に失敗しました'); }
    setSaving(false);
  };

  const continueCurrentLoc = () => {
    setScannedProducts([]);
    setStep(2);
    if (!isIroatoAvailable()) setProductManualVisible(true);
  };

  const G = '#2d7a4f';

  if (!session) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f0', fontFamily: "-apple-system,'Hiragino Kaku Gothic ProN',sans-serif", color: '#222', paddingBottom: 80 }}>
      {/* HEADER */}
      <div style={{ background: G, color: '#fff', padding: '12px 16px 10px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/" style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, color: '#fff', padding: '7px 12px', fontSize: 14, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>← 戻る</a>
          <h1 style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 700, margin: 0 }}>📍 ロケーション登録</h1>
          <span style={{ background: 'rgba(255,255,255,.2)', borderRadius: 10, padding: '3px 8px', fontSize: 11 }}>👤 {session.userName}</span>
        </div>
      </div>

      {/* ロケーションバナー */}
      {(step === 2 || step === 3) && (
        <div style={{ background: '#fff', borderBottom: `3px solid ${G}`, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#888', flexShrink: 0 }}>登録先:</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a3a2a' }}>{currentLocName}</div>
            <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{currentLocCode}</div>
          </div>
          <button onClick={backToStep1} style={{ background: '#e8f4e8', border: '1px solid #b2dfcd', color: G, padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>変更</button>
        </div>
      )}

      {/* ステップインジケーター */}
      {step !== 'complete' && (
        <div style={{ display: 'flex', padding: '12px 16px 8px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          {[{n:1,label:'ロケーションCC'},{n:2,label:'品目スキャン'},{n:3,label:'確認・登録'}].map(({n, label}, i) => {
            const s = typeof step === 'number' ? step : 4;
            const isDone = n < s; const isActive = n === s;
            return (
              <div key={n} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i < 2 && <div style={{ position: 'absolute', top: 11, left: '50%', width: '100%', height: 2, background: isDone ? G : '#ddd' }} />}
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: isActive ? G : isDone ? '#4a9d72' : '#e0e0e0', color: isActive || isDone ? '#fff' : '#aaa', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                  {isDone ? '✓' : n}
                </div>
                <div style={{ fontSize: 10, color: isActive ? G : '#aaa', marginTop: 3, textAlign: 'center', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>{label}</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ padding: '12px 16px' }}>

        {/* STEP 1 */}
        {step === 1 && (
          <>
            <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a2a', marginBottom: 14 }}>🏷️ STEP 1 - ロケーションCCをスキャン</div>
              <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>登録先のロケーションに貼付されたCCコードをスキャンしてください。</p>
              {!isIroatoAvailable() && <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#e65100', marginBottom: 10 }}>⚠️ PC環境：手動入力モードで動作しています</div>}
              <button onClick={scanLocation}
                style={{ width: '100%', padding: 18, background: `linear-gradient(135deg, ${G}, #4a9d72)`, color: '#fff', border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 16px rgba(45,122,79,0.35)' }}>
                📷 ロケーションCCをスキャン
              </button>
              {(!isIroatoAvailable() || locManualVisible) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input type="text" value={locInput} onChange={e => setLocInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmManualLoc()}
                    placeholder="CCコードまたはロケーションコード"
                    style={{ flex: 1, padding: '10px 12px', border: '2px solid #e0e0e0', borderRadius: 10, fontSize: 14, background: '#fafafa', outline: 'none' }} />
                  <button onClick={confirmManualLoc} style={{ padding: '10px 16px', background: '#e8f4e8', border: '1px solid #b2dfcd', borderRadius: 10, fontSize: 14, fontWeight: 600, color: G, cursor: 'pointer' }}>決定</button>
                </div>
              )}
            </div>
            {recentLocs.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a2a', marginBottom: 14 }}>🕐 最近使用したロケーション</div>
                {recentLocs.map(loc => (
                  <div key={loc.code} onClick={() => selectRecentLoc(loc)}
                    style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0', cursor: 'pointer' }}>
                    <span style={{ fontSize: 16, marginRight: 8 }}>📍</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a3a2a' }}>{loc.name}</div>
                      <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>{loc.code}</div>
                    </div>
                    <span style={{ fontSize: 12, color: G, fontWeight: 600 }}>選択 →</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a2a', marginBottom: 12 }}>📦 STEP 2 - 品目CCをスキャン（複数可）</div>
            <p style={{ fontSize: 14, color: '#666', marginBottom: 12 }}>品目のCCコードを読み取ってください。<br/><strong>複数スキャン対応</strong>：同時に複数の品目をまとめてスキャンできます。</p>
            {!isIroatoAvailable() && <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#e65100', marginBottom: 10 }}>⚠️ PC環境：手動入力モードで動作しています</div>}
            
            {scannedProducts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {scannedProducts.map((p, i) => (
                  <div key={p.ccCode} style={{ background: '#f5faf5', border: '1px solid #c8e6c9', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeIn 0.3s ease' }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: G, color: '#fff', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a3a2a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: '#888', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.barcode || p.ccCode}</div>
                      {p.prevLocName && <div style={{ fontSize: 11, color: '#e65100' }}>⚠️ 現在: {p.prevLocName}</div>}
                    </div>
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: p.isNew ? '#e8f4ff' : p.prevLocName ? '#fff3e0' : '#e8f4e8', color: p.isNew ? '#1565c0' : p.prevLocName ? '#e65100' : G, flexShrink: 0 }}>
                      {p.isNew ? '未登録' : p.prevLocName ? '移動' : '在庫'}
                    </span>
                    <span onClick={() => removeProduct(i)} style={{ color: '#ccc', fontSize: 18, cursor: 'pointer', padding: 4, flexShrink: 0 }}>✕</span>
                  </div>
                ))}
              </div>
            )}
            {scannedProducts.length === 0 && <div style={{ textAlign: 'center', color: '#bbb', padding: '16px 0', fontSize: 14 }}>品目CCをスキャンしてください</div>}

            <button onClick={scanProducts}
              style={{ width: '100%', padding: 18, background: `linear-gradient(135deg, ${G}, #4a9d72)`, color: '#fff', border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 16px rgba(45,122,79,0.35)', marginTop: 14 }}>
              📷 品目CCをスキャン（複数可）
            </button>
            {(!isIroatoAvailable() || productManualVisible) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input type="text" value={productInput} onChange={e => setProductInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmManualProduct()}
                  placeholder="CCコード（カンマ区切りで複数可）"
                  style={{ flex: 1, padding: '10px 12px', border: '2px solid #e0e0e0', borderRadius: 10, fontSize: 14, background: '#fafafa', outline: 'none' }} />
                <button onClick={confirmManualProduct} style={{ padding: '10px 16px', background: '#e8f4e8', border: '1px solid #b2dfcd', borderRadius: 10, fontSize: 14, fontWeight: 600, color: G, cursor: 'pointer' }}>追加</button>
              </div>
            )}
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1a3a2a', marginBottom: 14 }}>✅ STEP 3 - 確認・登録</div>
            <div style={{ background: '#e8f4e8', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>登録先ロケーション</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#1a3a2a' }}>{currentLocName}</div>
              <div style={{ fontSize: 12, color: '#888', fontFamily: 'monospace' }}>{currentLocCode}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8 }}>登録する品目：</div>
            {scannedProducts.map((p, i) => (
              <div key={p.ccCode} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ background: G, color: '#fff', width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i+1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>{p.barcode || p.ccCode}</div>
                </div>
                <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, fontWeight: 600, background: p.prevLocName ? '#fff3e0' : '#e8f4e8', color: p.prevLocName ? '#e65100' : G }}>
                  {p.prevLocName ? '移動' : p.isNew ? '新規' : '更新'}
                </span>
              </div>
            ))}
            {scannedProducts.filter(p => p.prevLocName).length > 0 && (
              <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#e65100', marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                ⚠️ {scannedProducts.filter(p => p.prevLocName).length}件が別ロケーション登録済みです。登録するとロケーションが上書きされます。
              </div>
            )}
          </div>
        )}

        {/* 完了画面 */}
        {step === 'complete' && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '30px 20px', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <div style={{ fontSize: 60, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a3a2a', marginBottom: 8 }}>登録完了！</div>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>{completeMsg}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={continueCurrentLoc} style={{ padding: 16, background: `linear-gradient(135deg, ${G}, #4a9d72)`, color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(45,122,79,0.3)' }}>
                📦 同じロケーションに続けて登録
              </button>
              <button onClick={backToStep1} style={{ padding: 16, background: '#f0f0f0', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', color: '#555' }}>
                🔄 別のロケーションを登録
              </button>
              <a href="/" style={{ display: 'block', padding: 16, background: '#f0f0f0', borderRadius: 12, fontSize: 16, fontWeight: 700, textDecoration: 'none', color: '#555' }}>
                🏠 メニューへ戻る
              </a>
            </div>
          </div>
        )}
      </div>

      {/* アクションバー（STEP 2/3） */}
      {(step === 2 || step === 3) && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #eee', padding: '14px 16px 28px', display: 'flex', gap: 10, zIndex: 60 }}>
          <button onClick={() => step === 2 ? backToStep1() : setStep(2)}
            style={{ flex: 1, padding: 14, background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 12, fontSize: 15, fontWeight: 600, color: '#666', cursor: 'pointer' }}>
            ← 戻る
          </button>
          <button onClick={() => step === 2 ? goToStep3() : saveRegistrations()}
            disabled={step === 2 ? scannedProducts.length === 0 : saving}
            style={{ flex: 2, padding: 14, background: scannedProducts.length === 0 && step === 2 ? '#d1d5db' : `linear-gradient(135deg, ${G}, #4a9d72)`, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, color: '#fff', cursor: scannedProducts.length === 0 && step === 2 ? 'not-allowed' : 'pointer', boxShadow: scannedProducts.length === 0 && step === 2 ? 'none' : '0 4px 14px rgba(45,122,79,0.3)' }}>
            {step === 2 ? '確認へ →' : saving ? '登録中...' : '✅ 登録実行'}
          </button>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#1a3a2a', color: '#fff', padding: '10px 22px', borderRadius: 24, fontSize: 14, fontWeight: 600, zIndex: 9999, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
