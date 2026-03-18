'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, Session } from '@/lib/auth';
import { SystemSettings, DEFAULT_SETTINGS, fetchSystemSettings, isItemCC } from '@/lib/systemSettings';

declare global { interface Window { IroatoReader: any; } }

// ───── 型定義 ─────────────────────────────────────────
type Step     = 'mode' | 'list' | 'pick' | 'done';
type PickMode = 'wo' | 'free';

interface Item {
  id: number; barcode: string; cc_code: string; name: string;
  status: string; location_code: string | null; location_name: string | null;
  work_order_id: number | null;
}
interface WorkOrder {
  id: number; order_no: string; order_name: string;
  planned_date: string | null; status: string;
  detail_count: number; total_required: number; total_picked: number;
}
interface WorkOrderDetail {
  id: number; work_order_id: number; line_no: number;
  barcode: string; product_name: string; spec: string;
  required_qty: number; picked_qty: number; status: string;
  stock_count?: number;
  locations?: { code: string; name: string | null; count?: number }[];
}

// 統合ピック行（WOモード・フリーモード共通）
interface PickRow {
  rowId:              string;
  barcode:            string;
  product_name:       string;
  spec:               string;
  wo_id:              number | null;
  wo_detail_id:       number | null;
  required_qty:       number;   // 出庫予定数
  picked_qty:         number;   // 出庫済数（セッション中に更新）
  pickQty:            number;   // フリーモード合計ピック数（locPickQtysの合計）
  pickedThisSession:  number;   // = pickedItemIds.length
  pendingPick:        number;   // = pendingItems.length（WOモード）
  pendingItems:       Item[];   // WOモード: スキャン済みアイテム詳細
  items:              Item[];   // ピック可能な物理アイテム（located）
  pickedItemIds:      number[]; // このセッションでピック済みアイテムID
  locPickQtys:        Record<string, number>; // フリーモード: ロケーション別ピック数
}

// ───── ユーティリティ ──────────────────────────────────
function getLocations(items: Item[]): { code: string; name: string | null; count: number }[] {
  const map = new Map<string, { name: string | null; count: number }>();
  items.forEach(i => {
    if (i.location_code) {
      const e = map.get(i.location_code);
      e ? e.count++ : map.set(i.location_code, { name: i.location_name, count: 1 });
    }
  });
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ja'))
    .map(([code, v]) => ({ code, name: v.name, count: v.count }));
}

function primaryLocCode(items: Item[]): string {
  const locs = items.map(i => i.location_code).filter((c): c is string => !!c).sort((a, b) => a.localeCompare(b, 'ja'));
  return locs[0] ?? '\uFFFF';
}

function sortPickRows(rows: PickRow[]): PickRow[] {
  return [...rows].sort((a, b) => {
    const la = primaryLocCode(a.items), lb = primaryLocCode(b.items);
    if (la !== lb) return la.localeCompare(lb, 'ja');
    return a.barcode.localeCompare(b.barcode, 'ja');
  });
}

// フリーモード: 初期locPickQtysを計算（zansu分を先頭ロケーションから割り当て）
function buildInitialLocPickQtys(items: Item[], zansu: number): Record<string, number> {
  const locs = getLocations(items);
  const result: Record<string, number> = {};
  let remaining = Math.min(zansu, items.length);
  for (const loc of locs) {
    const allocate = Math.min(loc.count, remaining);
    if (allocate > 0) result[loc.code] = allocate;
    remaining -= allocate;
    if (remaining <= 0) break;
  }
  return result;
}

// ───── コンポーネント ──────────────────────────────────
export default function PickingPage() {
  const router  = useRouter();
  const [session,     setSession]     = useState<Session | null>(null);
  const [sysSettings, setSysSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);

  const [step,     setStep]     = useState<Step>('mode');
  const [pickMode, setPickMode] = useState<PickMode | null>(null);

  const [allLocated,  setAllLocated]  = useState<Item[]>([]);
  const [workOrders,  setWorkOrders]  = useState<WorkOrder[]>([]);
  const [sessionRows, setSessionRows] = useState<PickRow[]>([]);

  const [activeWo,    setActiveWo]    = useState<WorkOrder | null>(null);
  const [woModalOpen, setWoModalOpen] = useState(false);
  const [woSearch,    setWoSearch]    = useState('');
  const [woLoading,   setWoLoading]   = useState(false);

  // フリーモード入力
  const [searchVal, setSearchVal] = useState('');
  const [suggests,  setSuggests]  = useState<Item[]>([]);

  // WO明細キャッシュ
  const woDetailCache = useRef<Map<number, WorkOrderDetail[]>>(new Map());

  // トースト
  const [toasts, setToasts] = useState<{ id: number; msg: string; type: string }[]>([]);
  const toastId = useRef(0);
  const addToast = useCallback((msg: string, type = 'success') => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  // ───── 初期化 ──────────────────────────────────────
  useEffect(() => {
    const s = getSession();
    if (!s) { router.push('/auth'); return; }
    setSession(s);
    fetchSystemSettings().then(setSysSettings);
    fetchItems();
    fetchWorkOrders();
  }, [router]);

  const fetchItems = async () => {
    const res  = await fetch('/api/items?status=located');
    const data = await res.json();
    if (data.success) setAllLocated(data.items);
  };

  const fetchWorkOrders = async () => {
    const res  = await fetch('/api/work-orders');
    const data = await res.json();
    if (data.success) setWorkOrders(data.orders.filter((wo: WorkOrder) => wo.status !== 'completed'));
  };

  const isItemReader = () => { try { return typeof window.IroatoReader !== 'undefined'; } catch { return false; } }

  // ───── 集計ヘルパー ────────────────────────────────
  const zansuOf    = (row: PickRow) => Math.max(0, row.required_qty - row.picked_qty);
  const totalPending = sessionRows.reduce((s, r) => s + r.pendingPick, 0);

  // ピック完了チェック
  const checkAllDone = (rows: PickRow[]) =>
    rows.length > 0 && rows.every(r => {
      const needed = r.required_qty > 0 ? zansuOf(r) : r.items.length - r.pickedItemIds.length;
      return needed <= 0 || r.pickedItemIds.length >= r.items.length;
    });

  // ───── WOモード: 作業指図書選択 ───────────────────
  const selectWorkOrder = async (wo: WorkOrder) => {
    setWoLoading(true);
    setWoModalOpen(false); setWoSearch('');
    try {
      const res  = await fetch(`/api/work-orders/${wo.id}`);
      const data = await res.json();
      if (!data.success) { addToast('明細の取得に失敗しました', 'error'); return; }
      const details: WorkOrderDetail[] = data.details;
      woDetailCache.current.set(wo.id, details);

      const rows: PickRow[] = details
        .filter(d => d.required_qty - d.picked_qty > 0)
        .map(d => {
          const matched = allLocated.filter(i => i.barcode === d.barcode);
          return {
            rowId:             `wo-${d.id}`,
            barcode:           d.barcode,
            product_name:      d.product_name,
            spec:              d.spec,
            wo_id:             wo.id,
            wo_detail_id:      d.id,
            required_qty:      d.required_qty,
            picked_qty:        d.picked_qty,
            pickQty:           1,
            pickedThisSession: 0,
            pendingPick:       0,
            pendingItems:      [],
            items:             matched,
            pickedItemIds:     [],
            locPickQtys:       {},
          };
        });

      setSessionRows(sortPickRows(rows));
      setActiveWo(wo);
      addToast(`📋 ${wo.order_no}：残${rows.length}件の明細を読み込みました`, 'success');
    } finally {
      setWoLoading(false);
    }
  };

  // ───── WOモード: CCスキャン（リスト画面内） ───────
  const executeCCScanInList = () => {
    const unpickedItems = sessionRows.flatMap(r => {
      const handledIds = new Set([...r.pickedItemIds, ...r.pendingItems.map(i => i.id)]);
      return r.items.filter(i => !handledIds.has(i.id)).map(i => i.cc_code).filter(Boolean);
    });
    if (!unpickedItems.length) { addToast('スキャン対象がありません', 'warning'); return; }

    const displayData: Record<string, string> = {};
    sessionRows.forEach(r => r.items.forEach(i => { if (i.cc_code) displayData[i.cc_code] = i.name || i.barcode; }));

    try {
      const reader = new window.IroatoReader('cc', { mode: window.IroatoReader.multi, resolution: window.IroatoReader.r1280x720, labelText: `CCスキャン（${unpickedItems.length}件）`, lineColor: window.IroatoReader.green, lineWidth: 10, errLineColor: window.IroatoReader.red, searchCodes: unpickedItems, displayData });
      reader.read((res: any) => {
        if (!res?.data?.codes?.length) { addToast('スキャンがキャンセルされました', 'warning'); return; }
        handleCCScanInList(res.data.codes.map((c: any) => c.code).filter(Boolean));
      });
    } catch {
      const manual = prompt('CCコードをカンマ区切りで入力\n例: 1,2,3');
      if (manual?.trim()) handleCCScanInList(manual.split(',').map(s => s.trim()).filter(Boolean));
    }
  };

  const handleCCScanInList = (codes: string[]) => {
    let matched = 0;
    const notFound: string[] = [];

    setSessionRows(prev => {
      const newRows = prev.map(r => ({ ...r, pendingItems: [...r.pendingItems] }));
      for (const cc of codes) {
        if (!isItemCC(cc, sysSettings)) {
          notFound.push(`${cc}(範囲外)`); continue;
        }
        let found = false;
        for (const row of newRows) {
          const handledIds = new Set([...row.pickedItemIds, ...row.pendingItems.map(i => i.id)]);
          const avail = row.items.find(i => i.cc_code === cc && !handledIds.has(i.id));
          if (avail) {
            row.pendingItems.push(avail);
            row.pendingPick = row.pendingItems.length;
            matched++; found = true; break;
          }
        }
        if (!found) notFound.push(cc);
      }
      return newRows;
    });

    if (matched > 0) addToast(`📷 ${matched}件スキャンしました（要確定）`, 'success');
    if (notFound.length > 0) addToast(`リスト外: ${notFound.join(', ')}`, 'warning');
  };

  // WOモード: ロケーション別にpendingItemを1件取り消し
  const removePendingFromLoc = (rowId: string, locCode: string) => {
    setSessionRows(prev => prev.map(r => {
      if (r.rowId !== rowId) return r;
      // 該当ロケーションのpendingItemsを後ろから1件削除
      const idx = [...r.pendingItems].reverse().findIndex(i => (i.location_code || '未設定') === locCode);
      if (idx < 0) return r;
      const realIdx = r.pendingItems.length - 1 - idx;
      const newPendingItems = [...r.pendingItems.slice(0, realIdx), ...r.pendingItems.slice(realIdx + 1)];
      return { ...r, pendingItems: newPendingItems, pendingPick: newPendingItems.length };
    }));
  };

  // WOモード: ピッキング確定
  const confirmPicks = async () => {
    const pendingRows = sessionRows.filter(r => r.pendingItems.length > 0);
    if (!pendingRows.length) { addToast('スキャン済みアイテムがありません', 'warning'); return; }

    const now = new Date().toISOString();
    const userName = session?.userName || 'system';

    // WO別にアイテムをグループ化し、work_order_id を設定しながら一括更新
    const woItemGroups = new Map<number | null, number[]>(); // wo_id → item ids
    for (const row of pendingRows) {
      const woId = row.wo_id ?? null;
      const list = woItemGroups.get(woId) ?? [];
      list.push(...row.pendingItems.map(i => i.id));
      woItemGroups.set(woId, list);
    }
    await Promise.all([...woItemGroups.entries()].map(([woId, itemIds]) =>
      fetch('/api/items', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: itemIds, status: 'picked', picked_at: now,
          ...(woId ? { work_order_id: woId } : {}), updated_by: userName }) })
    ));

    // WO明細をWO別にまとめて一括更新（pick_batch）
    const woGroups = new Map<number, { detail_id: number; qty_delta: number }[]>();
    for (const row of pendingRows) {
      if (row.wo_detail_id && row.wo_id && row.pendingItems.length > 0) {
        const list = woGroups.get(row.wo_id) ?? [];
        list.push({ detail_id: row.wo_detail_id, qty_delta: row.pendingItems.length });
        woGroups.set(row.wo_id, list);
      }
    }
    await Promise.all([...woGroups.entries()].map(([woId, pick_deltas]) =>
      fetch(`/api/work-orders/${woId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pick_batch', pick_deltas, updated_by: userName }) })
    ));

    const totalConfirmed = pendingRows.reduce((s, r) => s + r.pendingItems.length, 0);
    const updatedRows = sessionRows.map(r => {
      if (r.pendingItems.length <= 0) return r;
      const newPickedIds = [...r.pickedItemIds, ...r.pendingItems.map(i => i.id)];
      return {
        ...r,
        picked_qty: r.picked_qty + r.pendingItems.length,
        pickedThisSession: newPickedIds.length,
        pickedItemIds: newPickedIds,
        pendingItems: [],
        pendingPick: 0,
      };
    });

    setSessionRows(updatedRows);
    addToast(`✓ ${totalConfirmed}件のピッキングを確定しました`, 'success');
    if (checkAllDone(updatedRows)) setTimeout(() => setStep('done'), 600);
  };

  // ───── フリーモード: アイテム追加 ─────────────────
  const onSearchInput = useCallback((val: string) => {
    setSearchVal(val);
    if (!val.trim()) { setSuggests([]); return; }
    const lq = val.toLowerCase();
    const existBarcodes = new Set(sessionRows.map(r => r.barcode));
    setSuggests(
      allLocated.filter(i =>
        !existBarcodes.has(i.barcode) &&
        (i.name?.toLowerCase().includes(lq) || i.barcode?.toLowerCase().includes(lq))
      ).slice(0, 8)
    );
  }, [allLocated, sessionRows]);

  const addFreeRow = async (query: string) => {
    const matched = allLocated.filter(i =>
      i.barcode === query ||
      (i.name && (i.name === query || (query.length >= 3 && i.name.toLowerCase().includes(query.toLowerCase()))))
    );
    if (!matched.length) { addToast(`一致する在庫が見つかりません: ${query}`, 'warning'); return; }
    const barcode = matched[0].barcode;
    if (sessionRows.find(r => r.barcode === barcode)) { addToast('すでにリストにあります', 'warning'); return; }

    let reqQty = 0, pickedQty = 0, woId: number | null = null, woDetailId: number | null = null;
    const woIdFromItem = matched[0].work_order_id;
    if (woIdFromItem) {
      let details = woDetailCache.current.get(woIdFromItem);
      if (!details) {
        const res = await fetch(`/api/work-orders/${woIdFromItem}`);
        const data = await res.json();
        if (data.success) { details = data.details as WorkOrderDetail[]; woDetailCache.current.set(woIdFromItem, details); }
      }
      const det = details?.find(d => d.barcode === barcode);
      if (det) { reqQty = det.required_qty; pickedQty = det.picked_qty; woId = woIdFromItem; woDetailId = det.id; }
    }

    const zansu = reqQty > 0 ? Math.max(0, reqQty - pickedQty) : matched.length;
    const locPickQtys = buildInitialLocPickQtys(matched, zansu || 1);
    const pickQty = Object.values(locPickQtys).reduce((s, v) => s + v, 0);

    const newRow: PickRow = {
      rowId: `free-${barcode}-${Date.now()}`, barcode,
      product_name: matched[0].name || barcode, spec: '',
      wo_id: woId, wo_detail_id: woDetailId,
      required_qty: reqQty, picked_qty: pickedQty,
      pickQty: Math.max(1, pickQty),
      pickedThisSession: 0, pendingPick: 0,
      pendingItems: [], items: matched,
      pickedItemIds: [], locPickQtys,
    };
    setSessionRows(prev => sortPickRows([...prev, newRow]));
    addToast(`✓ ${newRow.product_name} をリストに追加しました`, 'success');
  };

  const addByInput  = () => { const v = searchVal.trim(); if (!v) return; setSuggests([]); setSearchVal(''); addFreeRow(v); };
  const addByBarcode = () => {
    try {
      const r = new window.IroatoReader('barcode', { mode: window.IroatoReader.single, resolution: window.IroatoReader.r1280x720, lineColor: window.IroatoReader.green, lineWidth: 10, labelText: 'バーコードをスキャンして追加' });
      r.read((res: any) => { const c = res?.data?.codes?.[0]?.code; if (c) addFreeRow(c.trim()); else addToast('読み取れませんでした', 'error'); });
    } catch { const v = prompt('バーコード値を入力'); if (v?.trim()) addFreeRow(v.trim()); }
  };
  const addByOCR = () => {
    try {
      const r = new window.IroatoReader('ocr', { mode: window.IroatoReader.single, resolution: window.IroatoReader.r1280x720, lineColor: window.IroatoReader.green, lineWidth: 10, labelText: 'OCRスキャン' });
      r.read((res: any) => { const t = res?.data?.codes?.[0]?.code; if (t) addFreeRow(t.trim()); else addToast('読み取れませんでした', 'error'); });
    } catch { const v = prompt('品目番号を入力'); if (v?.trim()) addFreeRow(v.trim()); }
  };
  const removeFreeRow = (rowId: string) => setSessionRows(prev => prev.filter(r => r.rowId !== rowId));

  // フリーモード: ロケーション別数量変更
  const changeLocPickQty = (rowId: string, locCode: string, delta: number) => {
    setSessionRows(prev => prev.map(r => {
      if (r.rowId !== rowId) return r;
      const available = r.items.filter(i => !r.pickedItemIds.includes(i.id) && i.location_code === locCode);
      const maxForLoc = available.length;
      const currentQty = r.locPickQtys[locCode] || 0;
      const newQty = Math.min(Math.max(0, currentQty + delta), maxForLoc);

      // 合計が出庫残数を超えないようにチェック
      const totalOther = Object.entries(r.locPickQtys)
        .filter(([k]) => k !== locCode)
        .reduce((s, [, v]) => s + v, 0);
      const zansu = r.required_qty > 0 ? zansuOf(r) : r.items.filter(i => !r.pickedItemIds.includes(i.id)).length;
      const clampedQty = Math.min(newQty, Math.max(0, zansu - totalOther));

      const newLocPickQtys = { ...r.locPickQtys, [locCode]: clampedQty };
      const newPickQty = Object.values(newLocPickQtys).reduce((s, v) => s + v, 0);
      return { ...r, locPickQtys: newLocPickQtys, pickQty: newPickQty };
    }));
  };

  // ───── フリーモード: STEP2 ピック処理 ─────────────
  const doPickRow = async (rowId: string) => {
    const row = sessionRows.find(r => r.rowId === rowId);
    if (!row) return;

    // locPickQtysに基づいてロケーション別に対象アイテムを収集
    const toPick: Item[] = [];
    const availableItems = row.items.filter(i => !row.pickedItemIds.includes(i.id));

    if (Object.keys(row.locPickQtys).length > 0) {
      for (const [locCode, qty] of Object.entries(row.locPickQtys)) {
        if (qty <= 0) continue;
        const locItems = availableItems.filter(i => i.location_code === locCode).slice(0, qty);
        toPick.push(...locItems);
      }
    } else {
      // locPickQtysが未設定の場合は先頭からpickQty件
      toPick.push(...availableItems.slice(0, row.pickQty));
    }

    if (!toPick.length) { addToast('ピック可能なアイテムがありません', 'warning'); return; }
    const now = new Date().toISOString();
    const userName = session?.userName || 'system';
    // アイテム一括更新（work_order_id付き）+ WO更新を並列実行
    await Promise.all([
      fetch('/api/items', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: toPick.map(i => i.id), status: 'picked', picked_at: now,
          ...(row.wo_id ? { work_order_id: row.wo_id } : {}), updated_by: userName }) }),
      ...(row.wo_detail_id && row.wo_id ? [
        fetch(`/api/work-orders/${row.wo_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pick', detail_id: row.wo_detail_id, qty_delta: toPick.length, updated_by: userName }) })
      ] : []),
    ]);

    const newPickedIds = [...row.pickedItemIds, ...toPick.map(i => i.id)];
    const remainingItems = row.items.filter(i => !newPickedIds.includes(i.id));
    const remainingZansu = row.required_qty > 0
      ? Math.max(0, row.required_qty - (row.picked_qty + toPick.length))
      : remainingItems.length;
    const newLocPickQtys = buildInitialLocPickQtys(remainingItems, remainingZansu || 0);
    const newPickQty = Object.values(newLocPickQtys).reduce((s, v) => s + v, 0);

    const updatedRows = sessionRows.map(r => {
      if (r.rowId !== rowId) return r;
      return {
        ...r,
        picked_qty: r.picked_qty + toPick.length,
        pickedThisSession: newPickedIds.length,
        pickedItemIds: newPickedIds,
        locPickQtys: newLocPickQtys,
        pickQty: newPickQty,
      };
    });
    setSessionRows(updatedRows);
    addToast(`✓ ${row.product_name}: ${toPick.length}件ピック`, 'success');
    if (checkAllDone(updatedRows)) setStep('done');
  };

  const executeCCScan = () => {
    const codes = sessionRows.flatMap(r =>
      r.items.filter(i => !r.pickedItemIds.includes(i.id)).map(i => i.cc_code).filter(Boolean)
    );
    if (!codes.length) { addToast('スキャン対象がありません', 'warning'); return; }
    const displayData: Record<string, string> = {};
    sessionRows.forEach(r => r.items.forEach(i => { if (i.cc_code) displayData[i.cc_code] = i.name || i.barcode; }));
    try {
      const reader = new window.IroatoReader('cc', { mode: window.IroatoReader.multi, resolution: window.IroatoReader.r1280x720, labelText: `まとめスキャン`, lineColor: window.IroatoReader.green, lineWidth: 10, errLineColor: window.IroatoReader.red, searchCodes: codes, displayData });
      reader.read((res: any) => {
        if (!res?.data?.codes?.length) { addToast('キャンセルされました', 'warning'); return; }
        handleCCScanPick(res.data.codes.map((c: any) => c.code).filter(Boolean));
      });
    } catch {
      const manual = prompt('CCコードをカンマ区切りで入力');
      if (manual?.trim()) handleCCScanPick(manual.split(',').map(s => s.trim()).filter(Boolean));
    }
  };

  const handleCCScanPick = async (codes: string[]) => {
    let matched = 0;
    const notFound: string[] = [];
    const now = new Date().toISOString();
    const userName = session?.userName || 'system';
    const updatedRows = [...sessionRows.map(r => ({ ...r, pickedItemIds: [...r.pickedItemIds] }))];

    // マッチしたアイテムIDをWO別に収集（work_order_id設定のため）
    const woItemMap  = new Map<number | null, number[]>(); // woId → item ids
    const woPickMap  = new Map<number, Map<number, number>>(); // woId → (detailId → count)

    for (const cc of codes) {
      if (!isItemCC(cc, sysSettings)) { addToast(`「${cc}」範囲外`, 'error'); continue; }
      const rowIdx = updatedRows.findIndex(r =>
        r.items.some(i => i.cc_code === cc && !r.pickedItemIds.includes(i.id))
      );
      if (rowIdx < 0) { notFound.push(cc); continue; }
      const row = updatedRows[rowIdx];
      const item = row.items.find(i => i.cc_code === cc && !row.pickedItemIds.includes(i.id));
      if (!item) continue;

      // WO別にアイテムIDを分類
      const woId = row.wo_id ?? null;
      const itemList = woItemMap.get(woId) ?? [];
      itemList.push(item.id);
      woItemMap.set(woId, itemList);

      row.pickedItemIds.push(item.id);
      row.pickedThisSession = row.pickedItemIds.length;
      row.picked_qty += 1;
      matched++;

      if (row.wo_detail_id && row.wo_id) {
        const detailMap = woPickMap.get(row.wo_id) ?? new Map<number, number>();
        detailMap.set(row.wo_detail_id, (detailMap.get(row.wo_detail_id) ?? 0) + 1);
        woPickMap.set(row.wo_id, detailMap);
      }
    }

    if (woItemMap.size > 0) {
      // アイテム更新（WO別に work_order_id を設定）+ WO明細更新を並列実行
      await Promise.all([
        ...[...woItemMap.entries()].map(([woId, itemIds]) =>
          fetch('/api/items', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: itemIds, status: 'picked', picked_at: now,
              ...(woId ? { work_order_id: woId } : {}), updated_by: userName }) })
        ),
        ...[...woPickMap.entries()].map(([woId, detailMap]) => {
          const pick_deltas = [...detailMap.entries()].map(([detail_id, qty_delta]) => ({ detail_id, qty_delta }));
          return fetch(`/api/work-orders/${woId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'pick_batch', pick_deltas, updated_by: userName }) });
        }),
      ]);
    }

    setSessionRows(updatedRows);
    if (matched > 0) addToast(`✓ ${matched}件ピックしました`, 'success');
    if (notFound.length > 0) addToast(`リスト外: ${notFound.join(', ')}`, 'warning');
    if (checkAllDone(updatedRows)) setStep('done');
  };

  const executeBarcodePick = () => {
    try {
      const r = new window.IroatoReader('barcode', { mode: window.IroatoReader.single, resolution: window.IroatoReader.r1280x720, lineColor: window.IroatoReader.green, lineWidth: 10, labelText: 'バーコードスキャン' });
      r.read((res: any) => { const c = res?.data?.codes?.[0]?.code; if (c) doPickRow(sessionRows.find(r => r.barcode === c.trim())?.rowId ?? ''); else addToast('読み取れませんでした', 'error'); });
    } catch { const v = prompt('バーコード値を入力'); if (v?.trim()) doPickRow(sessionRows.find(r => r.barcode === v.trim())?.rowId ?? ''); }
  };
  const executeOCRPick = () => {
    try {
      const r = new window.IroatoReader('ocr', { mode: window.IroatoReader.single, resolution: window.IroatoReader.r1280x720, lineColor: window.IroatoReader.green, lineWidth: 10, labelText: 'OCRスキャン' });
      r.read((res: any) => { const t = res?.data?.codes?.[0]?.code; if (t) doPickRow(sessionRows.find(r => r.barcode === t.trim())?.rowId ?? ''); else addToast('読み取れませんでした', 'error'); });
    } catch { const v = prompt('品目番号を入力'); if (v?.trim()) doPickRow(sessionRows.find(r => r.barcode === v.trim())?.rowId ?? ''); }
  };

  // ───── ナビゲーション ──────────────────────────────
  const startNewSession = () => {
    setStep('mode'); setPickMode(null); setSessionRows([]);
    setActiveWo(null); setSearchVal(''); setSuggests([]);
    fetchItems(); fetchWorkOrders();
  };
  const goBack = () => {
    if (step === 'pick') setStep('list');
    else if (step === 'list') { setStep('mode'); setPickMode(null); setSessionRows([]); setActiveWo(null); }
    else router.push('/');
  };

  // ───── 集計 ─────────────────────────────────────
  const totalRows  = sessionRows.length;
  const pickedRows = sessionRows.filter(r => zansuOf(r) <= 0 || r.pickedItemIds.length >= r.items.length).length;
  const pct        = totalRows > 0 ? Math.round(pickedRows / totalRows * 100) : 0;
  const filteredWOs = workOrders.filter(wo => !woSearch || wo.order_no.toLowerCase().includes(woSearch.toLowerCase()) || wo.order_name.toLowerCase().includes(woSearch.toLowerCase()));

  const P = '#0891b2', G = '#057a55';
  if (!session) return null;

  // ─── ロケーションバッジ（全体サマリー表示用） ──────
  const LocBadges = ({ items }: { items: Item[] }) => {
    const locs = getLocations(items);
    if (!locs.length) return <span style={{ fontSize: 11, color: '#94a3b8' }}>未ロケーション</span>;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
        {locs.map((loc, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 700, color: '#6d28d9', background: '#f5f3ff', padding: '2px 7px', borderRadius: 8, border: '1px solid #ede9fe', whiteSpace: 'nowrap' }}>
            📍 {loc.code}{loc.name ? ` ${loc.name}` : ''}{loc.count > 1 ? ` (${loc.count}件)` : ''}
          </span>
        ))}
      </div>
    );
  };

  // ─── 数量セレクタ ─────────────────────────────────
  const QtySelector = ({ value, onMinus, onPlus, max, label }: { value: number; onMinus: () => void; onPlus: () => void; max: number; label?: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {label && <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <button onClick={onMinus} disabled={value <= 0}
          style={{ width: 28, height: 28, border: '1.5px solid #e5e7eb', borderRadius: 6, background: value <= 0 ? '#f9fafb' : '#fff', color: value <= 0 ? '#d1d5db' : '#374151', fontSize: 16, cursor: value <= 0 ? 'default' : 'pointer', fontWeight: 700 }}>−</button>
        <span style={{ width: 28, textAlign: 'center', fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{value}</span>
        <button onClick={onPlus} disabled={value >= max}
          style={{ width: 28, height: 28, border: '1.5px solid #e5e7eb', borderRadius: 6, background: value >= max ? '#f9fafb' : '#fff', color: value >= max ? '#d1d5db' : '#374151', fontSize: 16, cursor: value >= max ? 'default' : 'pointer', fontWeight: 700 }}>＋</button>
      </div>
      <div style={{ fontSize: 9, color: '#9ca3af' }}>上限 {max}</div>
    </div>
  );

  // ─── PickRow 共通カード ────────────────────────────
  const RowCard = ({ row, mode }: { row: PickRow; mode: 'wo-list' | 'free-list' | 'pick' }) => {
    const zansu      = zansuOf(row);
    const hasPending = row.pendingPick > 0;
    const isDone     = mode === 'pick' && (zansu <= 0 || row.pickedItemIds.length >= row.items.length);
    const isPartial  = mode === 'pick' && row.pickedThisSession > 0 && !isDone;

    let borderColor = '#e5e7eb';
    if (hasPending)  borderColor = '#fbbf24';
    if (isDone)      borderColor = '#bbf7d0';
    if (isPartial)   borderColor = '#fde68a';

    let bg = '#fff';
    if (hasPending)  bg = '#fffbeb';
    if (isDone)      bg = '#f0fdf4';
    if (isPartial)   bg = '#fefce8';

    // WOモード: pendingItemsをロケーション別にグルーピング
    const pendingByLoc = (() => {
      if (mode !== 'wo-list' || !row.pendingItems.length) return [];
      const map = new Map<string, { name: string | null; items: Item[] }>();
      row.pendingItems.forEach(i => {
        const key = i.location_code || '未設定';
        const e = map.get(key);
        if (e) e.items.push(i);
        else map.set(key, { name: i.location_name, items: [i] });
      });
      return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'ja'))
        .map(([code, v]) => ({ code, name: v.name, count: v.items.length }));
    })();

    // フリーモード: 未ピックのロケーション別在庫
    const availByLoc = (() => {
      if (mode !== 'free-list') return [];
      return getLocations(row.items.filter(i => !row.pickedItemIds.includes(i.id)));
    })();

    return (
      <div style={{ background: bg, border: `1.5px solid ${borderColor}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8, opacity: isDone ? 0.7 : 1, transition: 'all .2s' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* ステータスアイコン（ピック画面） */}
          {mode === 'pick' && (
            <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, background: isDone ? G : isPartial ? '#f59e0b' : '#e5e7eb', color: isDone || isPartial ? '#fff' : '#9ca3af', marginTop: 2 }}>
              {isDone ? '✓' : isPartial ? '▸' : '○'}
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', textDecoration: isDone ? 'line-through' : 'none' }}>
              {row.product_name || row.barcode}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace', marginTop: 1 }}>{row.barcode}</div>
            {row.spec && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>規格: {row.spec}</div>}

            {/* ロケーションサマリー（フリーモード以外、またはfree-listで在庫なし時） */}
            {mode !== 'free-list' && <LocBadges items={row.items} />}

            {/* 出庫数量情報 */}
            {row.required_qty > 0 ? (
              <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 12, flexWrap: 'wrap' }}>
                <span style={{ color: '#6b7280' }}>予定: <strong style={{ color: '#0f172a' }}>{row.required_qty}</strong></span>
                <span style={{ color: '#6b7280' }}>済: <strong style={{ color: '#16a34a' }}>{row.picked_qty}</strong></span>
                <span style={{ color: '#6b7280' }}>残: <strong style={{ color: zansu === 0 ? '#16a34a' : '#dc2626' }}>{zansu}</strong></span>
                {row.items.length > 0 && <span style={{ color: '#6b7280' }}>在庫: <strong style={{ color: '#0f172a' }}>{row.items.length}</strong></span>}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>在庫: {row.items.length}件</div>
            )}

            {/* ─── WOモード: スキャン済みのロケーション別表示 ─── */}
            {mode === 'wo-list' && hasPending && (
              <div style={{ marginTop: 8, background: '#fef3c7', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700, marginBottom: 6 }}>📷 スキャン済（確定待ち）</div>
                {pendingByLoc.map(loc => (
                  <div key={loc.code} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, background: '#fff', color: '#92400e', padding: '2px 8px', borderRadius: 8, fontWeight: 700, border: '1px solid #fde68a', flexShrink: 0 }}>
                      📍 {loc.code}{loc.name ? ` ${loc.name}` : ''}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#92400e', minWidth: 24, textAlign: 'center' }}>{loc.count}件</span>
                    <button
                      onClick={() => removePendingFromLoc(row.rowId, loc.code)}
                      style={{ width: 26, height: 26, border: 'none', borderRadius: 6, background: '#fee2e2', color: '#dc2626', fontSize: 14, cursor: 'pointer', fontWeight: 700, padding: 0, flexShrink: 0 }}
                      title="1件取り消し">−</button>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: '#b45309', fontWeight: 700, marginTop: 2, textAlign: 'right' }}>
                  合計: {row.pendingPick}件
                </div>
              </div>
            )}

            {/* ─── フリーモード: ロケーション別QtySelector ─── */}
            {mode === 'free-list' && availByLoc.length > 0 && (
              <div style={{ marginTop: 8, background: '#f5f3ff', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, color: '#6d28d9', fontWeight: 700, marginBottom: 6 }}>ロケーション別ピック数</div>
                {availByLoc.map(loc => (
                  <div key={loc.code} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 11, background: '#fff', color: '#6d28d9', padding: '2px 8px', borderRadius: 8, fontWeight: 700, border: '1px solid #ede9fe', whiteSpace: 'nowrap' }}>
                        📍 {loc.code}{loc.name ? ` ${loc.name}` : ''}
                      </span>
                      <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>在庫{loc.count}</span>
                    </div>
                    <QtySelector
                      value={row.locPickQtys[loc.code] || 0}
                      onMinus={() => changeLocPickQty(row.rowId, loc.code, -1)}
                      onPlus={() => changeLocPickQty(row.rowId, loc.code, +1)}
                      max={loc.count}
                    />
                  </div>
                ))}
                <div style={{ fontSize: 11, color: '#5b21b6', fontWeight: 700, marginTop: 4, textAlign: 'right', borderTop: '1px solid #ede9fe', paddingTop: 4 }}>
                  合計: {row.pickQty}件
                </div>
              </div>
            )}
            {mode === 'free-list' && availByLoc.length === 0 && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#94a3b8' }}>未ロケーション</div>
            )}

            {/* ピック画面: 部分ピック */}
            {isPartial && (
              <div style={{ marginTop: 4, fontSize: 11, color: '#f59e0b', fontWeight: 700 }}>⚡ このセッション: {row.pickedThisSession}件ピック済</div>
            )}
          </div>

          {/* 右側コントロール */}
          {mode === 'free-list' && (
            <button onClick={() => removeFreeRow(row.rowId)}
              style={{ width: 28, height: 28, border: 'none', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', fontSize: 14, cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}>×</button>
          )}
          {mode === 'pick' && !isDone && (
            <button onClick={() => doPickRow(row.rowId)}
              style={{ padding: '8px 12px', background: P, color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', textAlign: 'center', lineHeight: 1.4 }}>
              ✓ ピック<br /><span style={{ fontSize: 11 }}>{row.pickQty}件</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f0f9ff', fontFamily: "-apple-system,'Hiragino Kaku Gothic ProN',sans-serif", color: '#111827', paddingBottom: 160 }}>

      {/* ヘッダー */}
      <div style={{ background: P, color: '#fff', padding: '12px 16px 10px', position: 'sticky', top: 0, zIndex: 50, boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={goBack} style={{ background: 'rgba(255,255,255,.2)', border: 'none', borderRadius: 8, color: '#fff', padding: '7px 12px', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {step === 'mode' ? '← 戻る' : step === 'list' ? '← モード選択' : '← リスト'}
          </button>
          <h1 style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 700, margin: 0 }}>🔍 ピッキング</h1>
          <span style={{ background: 'rgba(255,255,255,.25)', borderRadius: 20, fontSize: 11, fontWeight: 700, padding: '3px 10px', whiteSpace: 'nowrap' }}>
            {step === 'mode' ? 'モード選択' : step === 'list' ? 'STEP 1/2' : step === 'pick' ? 'STEP 2/2' : '完了'}
          </span>
        </div>
        {activeWo && (
          <div style={{ marginTop: 6, background: 'rgba(255,255,255,.15)', borderRadius: 8, padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📋</span>
            <span style={{ fontWeight: 700 }}>{activeWo.order_no}</span>
            {activeWo.order_name && <span style={{ opacity: 0.8 }}>{activeWo.order_name}</span>}
          </div>
        )}
      </div>

      {/* プログレスバー（STEP2 フリーモード） */}
      {step === 'pick' && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '10px 16px', position: 'sticky', top: 56, zIndex: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>ピッキング進捗 {pct}%</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: P }}>{pickedRows} / {totalRows} 行</span>
          </div>
          <div style={{ height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: pickedRows === totalRows ? G : P, borderRadius: 4, width: `${pct}%`, transition: 'width .4s' }} />
          </div>
        </div>
      )}

      <div style={{ padding: '14px', maxWidth: 480, margin: '0 auto' }}>

        {/* ===== モード選択 ===== */}
        {step === 'mode' && (
          <>
            <div style={{ textAlign: 'center', padding: '20px 0 16px', fontSize: 14, color: '#374151', fontWeight: 600 }}>ピッキング方法を選択してください</div>
            <button onClick={() => { setPickMode('wo'); setStep('list'); setWoModalOpen(true); }}
              style={{ width: '100%', background: '#fff', border: '2px solid #1e40af', borderRadius: 16, padding: '20px 18px', marginBottom: 14, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 36 }}>📋</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1e40af', marginBottom: 4 }}>ピッキングリストから選択</div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>作業指図書の明細一覧からCCスキャン<br />スキャン後にロケーション別確認・取り消し可能</div>
              </div>
            </button>
            <button onClick={() => { setPickMode('free'); setStep('list'); }}
              style={{ width: '100%', background: '#fff', border: '2px solid #0891b2', borderRadius: 16, padding: '20px 18px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ fontSize: 36 }}>🔍</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0891b2', marginBottom: 4 }}>任意入力でリストを作成</div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>品目番号・バーコード・OCRで追加<br />ロケーション別にピック数を指定できます</div>
              </div>
            </button>
          </>
        )}

        {/* ===== STEP 1: リスト ===== */}
        {step === 'list' && (
          <>
            {/* WOモード: WO未選択 */}
            {pickMode === 'wo' && !activeWo && !woLoading && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280', fontSize: 14 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ marginBottom: 16 }}>作業指図書を選択してください</div>
                <button onClick={() => setWoModalOpen(true)}
                  style={{ padding: '12px 28px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>作業指図書を選択</button>
              </div>
            )}
            {woLoading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>読み込み中...</div>}

            {/* フリーモード: 入力エリア */}
            {pickMode === 'free' && (
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 10 }}>品目番号・バーコードを入力またはスキャンして追加</div>
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input type="text" value={searchVal} onChange={e => onSearchInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addByInput()}
                      placeholder="品目番号 / バーコード"
                      style={{ flex: 1, padding: '11px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 15, outline: 'none', background: '#f0f9ff' }} />
                    <button onClick={addByInput} style={{ padding: '11px 16px', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', background: P, color: '#fff' }}>追加</button>
                  </div>
                  {suggests.length > 0 && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100, background: '#fff', border: `1.5px solid ${P}`, borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,.12)', maxHeight: 220, overflowY: 'auto' }}>
                      {suggests.map(item => (
                        <div key={item.id} onClick={() => { setSuggests([]); setSearchVal(''); addFreeRow(item.barcode); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{item.name || item.barcode}</div>
                          {item.name && <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{item.barcode}</div>}
                          {(item.location_name || item.location_code) && <div style={{ fontSize: 10, color: '#6d28d9', fontWeight: 700 }}>📍 {item.location_name || item.location_code}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={addByBarcode} style={{ flex: 1, padding: '11px 6px', border: '1.5px solid #a3e635', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#f7fee7', color: '#365314' }}>🔲 バーコード</button>
                  <button onClick={addByOCR}     style={{ flex: 1, padding: '11px 6px', border: '1.5px solid #93c5fd', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#eff6ff', color: '#1e3a8a' }}>🔤 OCR</button>
                </div>
              </div>
            )}

            {/* リスト（WO・フリー共通） */}
            {sessionRows.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', padding: '0 2px 8px' }}>
                  {pickMode === 'wo' ? `明細: ${sessionRows.length}件` : `追加済み: ${sessionRows.length}件`}
                  {pickMode === 'wo' && totalPending > 0 && (
                    <span style={{ marginLeft: 8, color: '#b45309', background: '#fef3c7', borderRadius: 10, padding: '1px 8px', fontSize: 11 }}>
                      📷 スキャン済 {totalPending}件（確定待ち）
                    </span>
                  )}
                </div>
                {sessionRows.map(row => (
                  <RowCard key={row.rowId} row={row} mode={pickMode === 'wo' ? 'wo-list' : 'free-list'} />
                ))}
              </>
            )}
          </>
        )}

        {/* ===== STEP 2: ピッキング実行（フリーモード） ===== */}
        {step === 'pick' && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', padding: '0 2px 8px' }}>
              ピッキング対象: {totalRows}件（完了: {pickedRows}件）
            </div>
            {sessionRows.map(row => (
              <RowCard key={row.rowId} row={row} mode="pick" />
            ))}
          </>
        )}

        {/* ===== 完了 ===== */}
        {step === 'done' && (
          <>
            <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 16, padding: '28px 20px', textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: G, marginBottom: 6 }}>ピッキング完了！</div>
              <div style={{ fontSize: 14, color: '#6b7280' }}>すべてのピッキングが完了しました</div>
              {activeWo && (
                <div style={{ marginTop: 10, fontSize: 13, color: '#1e40af', background: '#eff6ff', borderRadius: 8, padding: '8px 12px', display: 'inline-block' }}>
                  📋 {activeWo.order_no} を更新しました
                </div>
              )}
            </div>
            <button onClick={startNewSession} style={{ width: '100%', padding: 17, border: 'none', borderRadius: 14, fontSize: 17, fontWeight: 800, cursor: 'pointer', background: G, color: '#fff', marginBottom: 10 }}>✓ 新しいピッキングを開始</button>
            <a href="/" style={{ display: 'block', width: '100%', padding: 15, border: '1.5px solid #e5e7eb', borderRadius: 14, fontSize: 15, fontWeight: 700, background: '#fff', color: '#111827', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>🏠 メニューへ戻る</a>
          </>
        )}
      </div>

      {/* ===== フッター ===== */}
      {/* WOモード リスト画面: CCスキャン＋確定 */}
      {step === 'list' && pickMode === 'wo' && sessionRows.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 16px 28px', boxShadow: '0 -4px 20px rgba(0,0,0,.08)', zIndex: 60 }}>
          <button onClick={executeCCScanInList}
            style={{ width: '100%', padding: 17, border: 'none', borderRadius: 14, fontSize: 17, fontWeight: 800, cursor: 'pointer', background: P, color: '#fff', marginBottom: 8 }}>
            📷 CCスキャン
          </button>
          {totalPending > 0 && (
            <button onClick={confirmPicks}
              style={{ width: '100%', padding: 15, border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 800, cursor: 'pointer', background: G, color: '#fff' }}>
              ✓ ピッキング確定（{totalPending}件）
            </button>
          )}
          <div style={{ textAlign: 'center', fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            スキャン後、ロケーション別に確認・取り消しして確定してください
          </div>
        </div>
      )}

      {/* フリーモード リスト画面: ピッキング開始 */}
      {step === 'list' && pickMode === 'free' && sessionRows.length > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 16px 28px', boxShadow: '0 -4px 20px rgba(0,0,0,.08)', zIndex: 60 }}>
          <button onClick={() => setStep('pick')}
            style={{ width: '100%', padding: 17, border: 'none', borderRadius: 14, fontSize: 17, fontWeight: 800, cursor: 'pointer', background: P, color: '#fff' }}>
            📦 ピッキング開始（{sessionRows.length}件）
          </button>
        </div>
      )}

      {/* フリーモード STEP2: スキャンボタン */}
      {step === 'pick' && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 16px 28px', boxShadow: '0 -4px 20px rgba(0,0,0,.08)', zIndex: 60 }}>
          <button onClick={executeCCScan}
            style={{ width: '100%', padding: 17, border: 'none', borderRadius: 14, fontSize: 17, fontWeight: 800, cursor: 'pointer', background: P, color: '#fff', marginBottom: 8 }}>
            📷 CCまとめスキャン
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={executeBarcodePick} style={{ flex: 1, padding: 12, border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#fff', color: '#111827' }}>🔲 バーコード</button>
            <button onClick={executeOCRPick}     style={{ flex: 1, padding: 12, border: '1.5px solid #e5e7eb', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#fff', color: '#111827' }}>🔤 OCR</button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#6b7280', marginTop: 7 }}>各行の「ピック」ボタンでも確認できます</div>
        </div>
      )}

      {/* 作業指図書選択モーダル */}
      {woModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>📋 作業指図書を選択</div>
              <button onClick={() => { setWoModalOpen(false); setWoSearch(''); if (!activeWo) { setStep('mode'); setPickMode(null); } }}
                style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            <div style={{ padding: '10px 14px' }}>
              <input type="text" value={woSearch} onChange={e => setWoSearch(e.target.value)} placeholder="指図書番号・名称で検索..."
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 16px' }}>
              {filteredWOs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#6b7280', fontSize: 13 }}>対象の作業指図書がありません</div>
              ) : filteredWOs.map(wo => {
                const pickPct = wo.total_required > 0 ? Math.round(wo.total_picked / wo.total_required * 100) : 0;
                return (
                  <div key={wo.id} onClick={() => selectWorkOrder(wo)}
                    style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 8, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#1e40af' }}>{wo.order_no}</span>
                      {wo.order_name && <span style={{ fontSize: 13, color: '#374151' }}>{wo.order_name}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#6b7280', marginBottom: 6, flexWrap: 'wrap' }}>
                      {wo.planned_date && <span>📅 {wo.planned_date}</span>}
                      <span>明細: {wo.detail_count}件</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: pickPct === 100 ? G : P, borderRadius: 3, width: `${pickPct}%` }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pickPct === 100 ? G : P, whiteSpace: 'nowrap' }}>
                        {wo.total_picked}/{wo.total_required} ({pickPct}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* トースト */}
      <div style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 300, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none', width: 'calc(100% - 32px)', maxWidth: 440 }}>
        {toasts.map(t => (
          <div key={t.id} style={{ background: t.type === 'error' ? '#fee2e2' : t.type === 'warning' ? '#fef3c7' : '#d1fae5', color: t.type === 'error' ? '#dc2626' : t.type === 'warning' ? '#92400e' : '#065f46', padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,.12)', animation: 'fadeIn .2s ease' }}>
            {t.msg}
          </div>
        ))}
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
