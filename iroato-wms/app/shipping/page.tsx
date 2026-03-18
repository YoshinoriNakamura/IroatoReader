'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, Session } from '@/lib/auth';

// ───── 型定義 ─────────────────────────────────────────
type Step = 'wo_select' | 'list' | 'done';

interface WorkOrder {
  id: number; order_no: string; order_name: string;
  planned_date: string | null; status: string;
  detail_count: number; total_required: number; total_picked: number; total_shipped: number;
}
interface WorkOrderDetail {
  id: number; work_order_id: number; line_no: number;
  barcode: string; product_name: string; spec: string;
  required_qty: number; picked_qty: number; shipped_qty: number;
  picked_item_count: number;
  picked_items: { id: number; cc_code: string | null }[];
}
interface ShipLine {
  detail:       WorkOrderDetail;
  shipQty:      number;
  effectiveQty: number;
  pickedItems:  { id: number; cc_code: string | null }[];
  scannedIds:   number[];  // CCスキャンで確認済みアイテムID
}

declare const window: Window & {
  IroatoReader: any;
};

// ───── コンポーネント ──────────────────────────────────
export default function ShippingPage() {
  const router = useRouter();
  const [session,        setSession]        = useState<Session | null>(null);
  const [step,           setStep]           = useState<Step>('wo_select');
  const [workOrders,     setWorkOrders]     = useState<WorkOrder[]>([]);
  const [activeWo,       setActiveWo]       = useState<WorkOrder | null>(null);
  const [woSearch,       setWoSearch]       = useState('');
  const [woLoading,      setWoLoading]      = useState(false);
  const [shipLines,      setShipLines]      = useState<ShipLine[]>([]);
  const [remaining,      setRemaining]      = useState<Record<string, number>>({});
  const [confirmedLines, setConfirmedLines] = useState<ShipLine[]>([]);
  const [confirming,     setConfirming]     = useState(false);

  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const toastId = useRef(0);
  const addToast = useCallback((msg: string, type = 'success') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.push('/auth'); return; }
    setSession(s);
    fetchWorkOrders();
  }, [router]);

  const fetchWorkOrders = async () => {
    const res  = await fetch('/api/work-orders');
    const data = await res.json();
    if (data.success) {
      setWorkOrders(data.orders.filter((wo: WorkOrder) =>
        Number(wo.total_picked) > Number(wo.total_shipped)
      ));
    }
  };

  // ───── WO選択 ──────────────────────────────────────
  const selectWorkOrder = async (wo: WorkOrder) => {
    setWoLoading(true);
    setWoSearch('');
    try {
      const res  = await fetch(`/api/work-orders/${wo.id}`);
      const data = await res.json();
      if (!data.success) { addToast('明細の取得に失敗しました', 'error'); return; }

      const details: WorkOrderDetail[] = data.details;
      const shippable = details
        .map(d => {
          const pickedItems: { id: number; cc_code: string | null }[] =
            Array.isArray(d.picked_items) ? d.picked_items : [];
          const effectiveQty = Math.max(
            pickedItems.length,
            Number(d.picked_item_count),
            Math.max(0, Number(d.picked_qty) - Number(d.shipped_qty))
          );
          return { detail: d, pickedItems, effectiveQty };
        })
        .filter(x => x.effectiveQty > 0);

      if (!shippable.length) {
        addToast('出庫対象のピッキング済みアイテムがありません', 'warning'); return;
      }

      setShipLines(shippable.map(x => ({
        detail:       x.detail,
        shipQty:      x.effectiveQty,
        effectiveQty: x.effectiveQty,
        pickedItems:  x.pickedItems,
        scannedIds:   [],
      })));
      setActiveWo(wo);
      setStep('list');
      addToast(`📋 ${wo.order_no}：${shippable.length}件の明細を読み込みました`, 'success');
    } finally {
      setWoLoading(false);
    }
  };

  // ───── CCスキャン消し込み ──────────────────────────
  const handleShipCCScan = useCallback(async (codes: string[]) => {
    // 現在のshipLinesを直接使用して新しい状態を構築
    const newLines = shipLines.map(l => ({ ...l, scannedIds: [...l.scannedIds] }));
    let matched = 0;
    const serverLookup: string[] = []; // pickedItemsで見つからなかったCC

    for (const cc of codes) {
      // まずフロントのpickedItemsから探す
      let found = false;
      for (const line of newLines) {
        const item = line.pickedItems.find(
          i => i.cc_code === cc && !line.scannedIds.includes(i.id)
        );
        if (item) {
          line.scannedIds.push(item.id);
          line.shipQty = Math.max(line.shipQty, line.scannedIds.length);
          matched++;
          found = true;
          break;
        }
      }
      if (!found) serverLookup.push(cc);
    }

    // pickedItemsで見つからなかったCCはサーバー照合
    for (const cc of serverLookup) {
      try {
        const res = await fetch(`/api/items?cc_code=${encodeURIComponent(cc)}&status=picked`);
        const data = await res.json();
        if (!data.success || !data.items?.length) { continue; }
        const serverItem = data.items[0];
        // このアイテムのバーコードに対応するShipLineを探す
        const line = newLines.find(l => l.detail.barcode === serverItem.barcode);
        if (line && !line.scannedIds.includes(serverItem.id)) {
          // pickedItemsにも追加してから登録
          if (!line.pickedItems.find(i => i.id === serverItem.id)) {
            line.pickedItems = [...line.pickedItems, { id: serverItem.id, cc_code: cc }];
          }
          line.scannedIds.push(serverItem.id);
          line.shipQty = Math.max(line.shipQty, line.scannedIds.length);
          matched++;
        }
      } catch { /* skip */ }
    }

    setShipLines(newLines);
    if (matched > 0) addToast(`✓ ${matched}件スキャン確認`, 'success');
    const notFound = serverLookup.filter(cc =>
      !newLines.some(l => l.pickedItems.some(i => i.cc_code === cc))
    );
    if (notFound.length > 0) addToast(`対象外: ${notFound.join(', ')}`, 'warning');
  }, [shipLines, addToast]);

  const executeShipCCScan = useCallback(() => {
    // searchCodesなし（制限なし）でIroatoReaderを起動
    try {
      const reader = new window.IroatoReader('cc', {
        mode: window.IroatoReader.multi,
        resolution: window.IroatoReader.r1280x720,
        labelText: '出庫確認スキャン（CCコードを読み取り）',
        lineColor: window.IroatoReader.green,
        lineWidth: 10,
      });
      reader.read((res: any) => {
        if (!res?.data?.codes?.length) { addToast('キャンセルされました', 'warning'); return; }
        handleShipCCScan(res.data.codes.map((c: any) => c.code).filter(Boolean));
      });
    } catch {
      const manual = prompt('CCコードをカンマ区切りで入力');
      if (manual?.trim()) handleShipCCScan(manual.split(',').map(s => s.trim()).filter(Boolean));
    }
  }, [handleShipCCScan, addToast]);

  // ───── 数量変更（手動） ────────────────────────────
  const changeShipQty = (detailId: number, delta: number) => {
    setShipLines(prev => prev.map(l => {
      if (l.detail.id !== detailId) return l;
      const minQty = l.scannedIds.length; // スキャン済みは下限
      const newQty = Math.min(Math.max(minQty, l.shipQty + delta), l.effectiveQty);
      return { ...l, shipQty: newQty };
    }));
  };

  // ───── 出庫確定 ────────────────────────────────────
  const confirmShipment = async () => {
    const targets = shipLines.filter(l => l.shipQty > 0);
    if (!targets.length || !activeWo) { addToast('出庫数量が0です', 'warning'); return; }

    setConfirming(true);
    try {
      const res = await fetch(`/api/work-orders/${activeWo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action:     'ship_confirm_all',
          ship_lines: targets.map(l => ({
            detail_id:   l.detail.id,
            barcode:     l.detail.barcode,
            qty:         l.shipQty,
            ...(l.scannedIds.length > 0 ? { scanned_ids: l.scannedIds } : {}),
          })),
          updated_by: session?.userName || 'system',
        }),
      });
      const data = await res.json();
      if (!data.success) { addToast('出庫確定に失敗しました: ' + data.error, 'error'); return; }

      setRemaining(data.remaining ?? {});
      setConfirmedLines(targets);
      setStep('done');
      fetchWorkOrders();
    } catch {
      addToast('通信エラーが発生しました', 'error');
    } finally {
      setConfirming(false);
    }
  };

  // ───── ナビゲーション ──────────────────────────────
  const startOver = () => {
    setStep('wo_select'); setActiveWo(null);
    setShipLines([]); setRemaining({}); setConfirmedLines([]);
    fetchWorkOrders();
  };
  const goBack = () => {
    if (step === 'list') { setStep('wo_select'); setActiveWo(null); setShipLines([]); }
    else router.push('/');
  };

  const totalShipQty    = shipLines.reduce((s, l) => s + l.shipQty, 0);
  const totalScanned    = shipLines.reduce((s, l) => s + l.scannedIds.length, 0);
  const totalEffective  = shipLines.reduce((s, l) => s + l.effectiveQty, 0);
  const allScanned      = totalEffective > 0 && totalScanned >= totalEffective;
  const hasCcItems      = shipLines.some(l => l.pickedItems.some(i => i.cc_code));

  const filteredWOs = workOrders.filter(wo =>
    !woSearch ||
    wo.order_no.toLowerCase().includes(woSearch.toLowerCase()) ||
    wo.order_name.toLowerCase().includes(woSearch.toLowerCase())
  );

  const P = '#b45309', G = '#057a55';
  if (!session) return null;

  // ─── 数量セレクタ ─────────────────────────────────
  const QtySelector = ({ value, onMinus, onPlus, min, max }: {
    value: number; onMinus: () => void; onPlus: () => void; min: number; max: number;
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button onClick={onMinus} disabled={value <= min}
          style={{ width: 30, height: 30, border: '1.5px solid #e5e7eb', borderRadius: 6, background: value <= min ? '#f9fafb' : '#fff', color: value <= min ? '#d1d5db' : '#374151', fontSize: 16, cursor: value <= min ? 'default' : 'pointer', fontWeight: 700 }}>−</button>
        <span style={{ width: 32, textAlign: 'center', fontWeight: 800, fontSize: 17, color: value > 0 ? P : '#9ca3af' }}>{value}</span>
        <button onClick={onPlus} disabled={value >= max}
          style={{ width: 30, height: 30, border: '1.5px solid #e5e7eb', borderRadius: 6, background: value >= max ? '#f9fafb' : '#fff', color: value >= max ? '#d1d5db' : '#374151', fontSize: 16, cursor: value >= max ? 'default' : 'pointer', fontWeight: 700 }}>＋</button>
      </div>
      <div style={{ fontSize: 9, color: '#9ca3af' }}>/ {max}</div>
    </div>
  );

  // ─── 明細カード ────────────────────────────────────
  const ShipCard = ({ line }: { line: ShipLine }) => {
    const d = line.detail;
    const remainingAfter = d.required_qty - d.shipped_qty - line.shipQty;
    const scannedCount   = line.scannedIds.length;
    const ccItems        = line.pickedItems.filter(i => i.cc_code);
    const noCcItems      = line.pickedItems.filter(i => !i.cc_code);
    const allLineScanned = ccItems.length > 0 && scannedCount >= ccItems.length;
    const borderColor    = allLineScanned ? '#86efac' : line.shipQty > 0 ? '#fbbf24' : '#e5e7eb';
    const bgColor        = allLineScanned ? '#f0fdf4' : line.shipQty > 0 ? '#fffbeb' : '#f9fafb';

    return (
      <div style={{ background: bgColor, border: `1.5px solid ${borderColor}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
        {/* 完全スキャン済みバッジ */}
        {allLineScanned && (
          <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, display: 'inline-block', marginBottom: 6 }}>
            ✅ スキャン確認済
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{d.product_name || d.barcode}</div>
            <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace', marginTop: 1 }}>{d.barcode}</div>
            {d.spec && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>規格: {d.spec}</div>}

            {/* 数量サマリー */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#6b7280' }}>出庫予定: <strong style={{ color: '#0f172a' }}>{d.required_qty}</strong></span>
              <span style={{ color: '#6b7280' }}>ピック済: <strong style={{ color: '#0891b2' }}>{d.picked_qty}</strong></span>
              <span style={{ color: '#6b7280' }}>出庫済: <strong style={{ color: '#16a34a' }}>{d.shipped_qty}</strong></span>
            </div>

            {/* スキャン進捗 */}
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {ccItems.length > 0 && (
                <span style={{
                  background: scannedCount >= ccItems.length ? '#dcfce7' : '#fef3c7',
                  color: scannedCount >= ccItems.length ? '#166534' : '#92400e',
                  borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700
                }}>
                  🔍 スキャン: {scannedCount} / {ccItems.length}件
                </span>
              )}
              {noCcItems.length > 0 && (
                <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                  CC未設定: {noCcItems.length}件
                </span>
              )}
              {ccItems.length === 0 && (
                <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                  📦 出庫可能: {line.effectiveQty}件
                </span>
              )}
            </div>

            {/* 今回出庫後のプレビュー */}
            {line.shipQty > 0 && (
              <div style={{ marginTop: 5, fontSize: 11 }}>
                <span style={{ color: P, fontWeight: 700 }}>今回出庫: {line.shipQty}件</span>
                {remainingAfter > 0
                  ? <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 700 }}>
                      → 残: {remainingAfter}件（一部出庫）
                    </span>
                  : <span style={{ marginLeft: 8, color: G, fontWeight: 700 }}>✓ 完全出庫</span>
                }
              </div>
            )}
          </div>

          <QtySelector
            value={line.shipQty}
            onMinus={() => changeShipQty(d.id, -1)}
            onPlus={() => changeShipQty(d.id, +1)}
            min={line.scannedIds.length}
            max={line.effectiveQty}
          />
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#fffbeb', fontFamily: "-apple-system,'Hiragino Kaku Gothic ProN',sans-serif", color: '#111827', paddingBottom: 160 }}>

      {/* ヘッダー */}
      <div style={{ background: P, color: '#fff', padding: '12px 16px 10px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={goBack}
            style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, color: '#fff', padding: '7px 12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {step === 'wo_select' ? '← 戻る' : '← WO選択'}
          </button>
          <h1 style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 700, margin: 0 }}>🚚 出庫処理</h1>
          <span style={{ background: 'rgba(255,255,255,.25)', borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '3px 10px', whiteSpace: 'nowrap' }}>
            {step === 'wo_select' ? 'WO選択' : step === 'list' ? '出庫確認' : '完了'}
          </span>
        </div>
        {activeWo && step === 'list' && (
          <div style={{ marginTop: 6, background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📋</span>
            <span style={{ fontWeight: 700 }}>{activeWo.order_no}</span>
            {activeWo.order_name && <span style={{ opacity: 0.8 }}>{activeWo.order_name}</span>}
          </div>
        )}
      </div>

      <div style={{ padding: 14, maxWidth: 480, margin: '0 auto' }}>

        {/* ===== WO選択 ===== */}
        {step === 'wo_select' && (
          <>
            {woLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>読み込み中...</div>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <input
                    type="text" value={woSearch} onChange={e => setWoSearch(e.target.value)}
                    placeholder="指図書番号・名称で検索..."
                    style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 15, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
                  />
                </div>
                {filteredWOs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280', fontSize: 14 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                    <div>出庫対象の作業指図書がありません</div>
                    <div style={{ marginTop: 8, fontSize: 12 }}>ピッキング済みアイテムがある作業指図書が表示されます</div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 8 }}>
                      出庫可能な作業指図書: {filteredWOs.length}件
                    </div>
                    {filteredWOs.map(wo => {
                      const readyQty = Number(wo.total_picked) - Number(wo.total_shipped);
                      return (
                        <div key={wo.id} onClick={() => selectWorkOrder(wo)}
                          style={{ background: '#fff', border: '1.5px solid #fbbf24', borderRadius: 12, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontWeight: 800, fontSize: 15, color: '#1e40af' }}>{wo.order_no}</span>
                            {wo.order_name && <span style={{ fontSize: 13, color: '#374151' }}>{wo.order_name}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#6b7280', marginBottom: 8, flexWrap: 'wrap' }}>
                            {wo.planned_date && <span>📅 {wo.planned_date}</span>}
                            <span>明細: {wo.detail_count}件</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                              📦 出庫待ち: {readyQty}件
                            </span>
                            <span style={{ background: '#f0fdf4', color: '#166534', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                              ✓ 出庫済: {wo.total_shipped}件
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ===== 出庫確認リスト ===== */}
        {step === 'list' && (
          <>
            {/* CCスキャンパネル */}
            <div style={{ background: allScanned ? '#f0fdf4' : '#fff7ed', border: `2px solid ${allScanned ? '#86efac' : '#fb923c'}`, borderRadius: 12, padding: '14px 16px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: allScanned ? G : '#c2410c' }}>
                    {allScanned ? '✅ 全件スキャン確認済' : '📷 CCコードをスキャン'}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {allScanned
                      ? 'すべてのアイテムを確認しました'
                      : totalScanned > 0
                        ? `確認済: ${totalScanned} / ${totalEffective}件`
                        : 'カメレオンコードを読み取って出庫を確認してください'}
                  </div>
                </div>
                {!allScanned && (
                  <button
                    onClick={executeShipCCScan}
                    style={{ padding: '14px 22px', background: '#c2410c', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(194,65,12,.35)' }}>
                    📷 スキャン
                  </button>
                )}
              </div>

              {/* スキャン進捗バー */}
              {totalEffective > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ background: '#e5e7eb', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                    <div style={{
                      background: allScanned ? G : '#f97316',
                      width: `${Math.min(100, totalEffective > 0 ? (totalScanned / totalEffective) * 100 : 0)}%`,
                      height: '100%',
                      borderRadius: 4,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                    <span>スキャン済: <strong style={{ color: allScanned ? G : '#c2410c' }}>{totalScanned}</strong></span>
                    <span>合計: <strong>{totalEffective}</strong>件</span>
                  </div>
                </div>
              )}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', padding: '0 2px 8px' }}>
              出庫対象: {shipLines.length}明細 / 合計 {totalShipQty}件
            </div>

            {shipLines.map(line => (
              <ShipCard key={line.detail.id} line={line} />
            ))}
          </>
        )}

        {/* ===== 完了 ===== */}
        {step === 'done' && (
          <>
            <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 16, padding: '24px 20px', textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 52, marginBottom: 10 }}>🎉</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: G, marginBottom: 4 }}>出庫確定完了！</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {confirmedLines.reduce((s, l) => s + l.shipQty, 0)}件を出庫しました
              </div>
              {activeWo && (
                <div style={{ marginTop: 10, fontSize: 12, color: '#1e40af', background: '#eff6ff', borderRadius: 8, padding: '8px 12px', display: 'inline-block' }}>
                  📋 {activeWo.order_no}
                </div>
              )}
            </div>

            {/* CC クリア報告 */}
            <div style={{ background: '#fff', border: '1px solid #a3e635', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: '#365314', marginBottom: 6 }}>🔄 CCコード再利用可能化</div>
              <div style={{ fontSize: 12, color: '#4d7c0f' }}>
                {confirmedLines.reduce((s, l) => s + l.shipQty, 0)}件のアイテムのCCコードをクリアしました。<br />
                これらのCCコードは次の入庫時に再利用できます。
              </div>
            </div>

            {/* 出庫後の在庫サマリー */}
            {confirmedLines.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 8 }}>📊 出庫後の在庫状況</div>
                {confirmedLines.map(line => {
                  const rem          = remaining[line.detail.barcode] ?? 0;
                  const totalShipped = line.detail.shipped_qty + line.shipQty;
                  return (
                    <div key={line.detail.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '8px 10px', background: rem === 0 ? '#f0fdf4' : '#fffbeb', borderRadius: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {line.detail.product_name || line.detail.barcode}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{line.detail.barcode}</div>
                        <div style={{ fontSize: 11, marginTop: 2, color: '#6b7280' }}>
                          今回: {line.shipQty}件 ／ 出庫済合計: {totalShipped}件
                        </div>
                      </div>
                      <div style={{ textAlign: 'center', flexShrink: 0 }}>
                        {rem === 0 ? (
                          <div style={{ fontSize: 11, fontWeight: 800, color: G, background: '#dcfce7', padding: '4px 10px', borderRadius: 8 }}>在庫0</div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: P }}>{rem}</div>
                            <div style={{ fontSize: 10, color: '#92400e' }}>在庫残</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <button onClick={startOver}
              style={{ width: '100%', padding: 17, border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: 'pointer', background: P, color: '#fff', marginBottom: 10 }}>
              🚚 続けて出庫処理
            </button>
            <a href="/"
              style={{ display: 'block', width: '100%', padding: 15, border: '1.5px solid #e5e7eb', borderRadius: 14, fontSize: 15, fontWeight: 700, background: '#fff', color: '#111827', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
              🏠 メニューへ戻る
            </a>
          </>
        )}
      </div>

      {/* ===== フッター: スキャン + 出庫確定ボタン ===== */}
      {step === 'list' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 16px 28px', boxShadow: '0 -4px 20px rgba(0,0,0,.08)', zIndex: 60 }}>
          {/* スキャンボタン（大） */}
          {!allScanned && (
            <button
              onClick={executeShipCCScan}
              style={{ width: '100%', padding: 16, border: 'none', borderRadius: 14, fontSize: 17, fontWeight: 800, cursor: 'pointer', background: '#c2410c', color: '#fff', marginBottom: 10, boxShadow: '0 2px 8px rgba(194,65,12,.3)' }}>
              📷 CCコードスキャン
              {totalScanned > 0 && ` （${totalScanned}/${totalEffective}件確認済）`}
            </button>
          )}
          {/* 未スキャン警告 */}
          {!allScanned && totalScanned > 0 && (
            <div style={{ background: '#fef3c7', borderRadius: 8, padding: '6px 12px', marginBottom: 8, fontSize: 12, color: '#92400e', textAlign: 'center', fontWeight: 600 }}>
              ⚠️ {totalEffective - totalScanned}件未スキャン（このまま確定も可能）
            </div>
          )}
          {/* 出庫確定ボタン */}
          {totalShipQty > 0 && (
            <>
              <button
                onClick={confirmShipment}
                disabled={confirming}
                style={{ width: '100%', padding: 16, border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: confirming ? 'default' : 'pointer', background: confirming ? '#e5e7eb' : allScanned ? G : '#6b7280', color: confirming ? '#9ca3af' : '#fff' }}>
                {confirming ? '処理中...' : `🚚 出庫確定（${totalShipQty}件）`}
              </button>
              <div style={{ textAlign: 'center', fontSize: 11, color: '#6b7280', marginTop: 5 }}>
                {allScanned ? '全件スキャン確認済 ✓' : 'スキャン後に確定してください'}
              </div>
            </>
          )}
        </div>
      )}

      {/* トースト */}
      <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none', width: 'calc(100% - 32px)', maxWidth: 440 }}>
        {toasts.map(t => (
          <div key={t.id}
            style={{ background: t.type === 'error' ? '#fee2e2' : t.type === 'warning' ? '#fef3c7' : '#d1fae5', color: t.type === 'error' ? '#dc2626' : t.type === 'warning' ? '#92400e' : '#065f46', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,.12)' }}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
