'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, Session } from '@/lib/auth';
import { SystemSettings, DEFAULT_SETTINGS } from '@/lib/systemSettings';

interface Stats { received: number; located: number; picked: number; shipped: number; }
interface Item {
  id: number; barcode: string; cc_code: string | null; name: string; quantity: number;
  status: string; location_code: string | null; location_name: string | null;
  location_cc_code: string | null; received_at: string | null; picked_at: string | null;
  created_at: string; updated_at: string; active: boolean;
}
interface Location { code: string; name: string; zone: string; cc_code: string | null; active: boolean; }
interface UserRecord { id: string; name: string; role: string; active: boolean; created_at: string; }
interface ProductRecord { id: number; barcode: string; cc_code: string | null; name: string; spec: string | null; unit: string; notes: string | null; active: boolean; created_at: string; updated_at: string; allocated_qty?: number; shipped_qty?: number; item_count?: number; }
interface WorkOrder { id: number; order_no: string; order_name: string; planned_date: string | null; item_count: number; status: string; created_at: string; detail_count: number; total_required: number; total_picked: number; total_shipped: number; }
interface WorkOrderDetail { id: number; work_order_id: number; line_no: number; barcode: string; product_name: string; spec: string; required_qty: number; picked_qty: number; shipped_qty: number; status: string; stock_count: number; locations: { code: string; name: string | null; count?: number }[]; }

type Tab = 'dashboard' | 'items' | 'locations' | 'alerts' | 'products' | 'users' | 'settings' | 'workorders';

export default function PcPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<Stats>({ received: 0, located: 0, picked: 0, shipped: 0 });
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  // Location form
  const [locCode, setLocCode] = useState('');
  const [locName, setLocName] = useState('');
  const [locZone, setLocZone] = useState('');
  const [locMessage, setLocMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Users
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userForm, setUserForm] = useState({ id: '', name: '', password: '', role: 'user' });
  const [userMessage, setUserMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userSaving, setUserSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [editPw, setEditPw] = useState('');
  const [editName, setEditName] = useState('');
  // Products
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productForm, setProductForm] = useState({ barcode: '', name: '', spec: '', unit: '個', notes: '' });
  const [productMessage, setProductMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [productSaving, setProductSaving] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null);
  const [editProductForm, setEditProductForm] = useState({ name: '', spec: '', unit: '', notes: '', active: true });
  // CSV取込
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvStep, setCsvStep] = useState<'upload'|'mapping'|'confirm'|'done'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState<Record<string,string>>({ barcode:'', name:'', spec:'', unit:'', notes:'' });
  const [csvImportMode, setCsvImportMode] = useState<'replace'|'add'|'update'>('add');
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ success: number; error: number } | null>(null);
  // System settings
  const [sysSettings, setSysSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [sysForm, setSysForm] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [sysMessage, setSysMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [sysSaving, setSysSaving] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  // ロケーション編集・検索・ページネーション
  const [locationSearch, setLocationSearch] = useState('');
  const [locationPage, setLocationPage] = useState(1);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editLocationForm, setEditLocationForm] = useState({ name: '', zone: '', cc_code: '', active: true });
  // ロケーションCSV
  const [locCsvImportOpen, setLocCsvImportOpen] = useState(false);
  const [locCsvStep, setLocCsvStep] = useState<'upload'|'mapping'|'confirm'|'done'>('upload');
  const [locCsvHeaders, setLocCsvHeaders] = useState<string[]>([]);
  const [locCsvRows, setLocCsvRows] = useState<string[][]>([]);
  const [locCsvMapping, setLocCsvMapping] = useState<Record<string,string>>({ code:'', name:'', zone:'', cc_code:'' });
  const [locCsvImportMode, setLocCsvImportMode] = useState<'replace'|'add'|'update'>('add');
  const [locCsvDragOver, setLocCsvDragOver] = useState(false);
  const [locCsvImporting, setLocCsvImporting] = useState(false);
  const [locCsvResult, setLocCsvResult] = useState<{ inserted: number; updated: number; skipped: number } | null>(null);
  // ユーザー検索・ページネーション
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [editRole, setEditRole] = useState('user');
  const [editActive, setEditActive] = useState(true);
  // ユーザーCSV
  const [userCsvImportOpen, setUserCsvImportOpen] = useState(false);
  const [userCsvStep, setUserCsvStep] = useState<'upload'|'mapping'|'confirm'|'done'>('upload');
  const [userCsvHeaders, setUserCsvHeaders] = useState<string[]>([]);
  const [userCsvRows, setUserCsvRows] = useState<string[][]>([]);
  const [userCsvMapping, setUserCsvMapping] = useState<Record<string,string>>({ id:'', name:'', password:'', role:'' });
  const [userCsvImportMode, setUserCsvImportMode] = useState<'add'|'update'>('add');
  const [userCsvDragOver, setUserCsvDragOver] = useState(false);
  const [userCsvImporting, setUserCsvImporting] = useState(false);
  const [userCsvResult, setUserCsvResult] = useState<{ inserted: number; updated: number; skipped: number } | null>(null);
  // 作業指図書
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [woSearch, setWoSearch] = useState('');
  const [woPage, setWoPage] = useState(1);
  const [woMessage, setWoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [woCsvImportOpen, setWoCsvImportOpen] = useState(false);
  const [woCsvStep, setWoCsvStep] = useState<'upload'|'mapping'|'confirm'|'done'>('upload');
  const [woCsvHeaders, setWoCsvHeaders] = useState<string[]>([]);
  const [woCsvRows, setWoCsvRows] = useState<string[][]>([]);
  const [woCsvMapping, setWoCsvMapping] = useState<Record<string,string>>({ order_no:'', order_name:'', barcode:'', product_name:'', spec:'', required_qty:'' });
  // 保存済みマッピング（列名ベース）: { order_no: '作業指図書番号', barcode: '品目番号', ... }
  const [savedWoCsvMapping, setSavedWoCsvMapping] = useState<Record<string,string>>({});
  const [woCsvPlannedDate, setWoCsvPlannedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [woCsvFiles, setWoCsvFiles] = useState<{ name: string; headers: string[]; rows: string[][] }[]>([]);
  const [woDetailOpen, setWoDetailOpen] = useState(false);
  const [woDetailWo, setWoDetailWo] = useState<WorkOrder | null>(null);
  const [woDetailList, setWoDetailList] = useState<WorkOrderDetail[]>([]);
  const [woDetailLoading, setWoDetailLoading] = useState(false);
  const [woCsvDragOver, setWoCsvDragOver] = useState(false);
  const [woCsvImporting, setWoCsvImporting] = useState(false);
  const [woCsvResult, setWoCsvResult] = useState<{ inserted_orders: number; updated_orders: number; inserted_details: number; total_orders: number } | null>(null);

  const fetchAll = useCallback(async () => {
    const [itemsRes, locsRes, sysRes, usersRes, productsRes, woRes] = await Promise.all([
      fetch('/api/items?all=true'),
      fetch('/api/locations?all=true'),
      fetch('/api/system'),
      fetch('/api/users'),
      fetch('/api/products'),
      fetch('/api/work-orders'),
    ]);
    const itemsData    = await itemsRes.json();
    const locsData     = await locsRes.json();
    const sysData      = await sysRes.json();
    const usersData    = await usersRes.json();
    const productsData = await productsRes.json();
    const woData       = await woRes.json();
    if (itemsData.success) {
      const all: Item[] = itemsData.items;
      setItems(all);
      setStats({
        received: all.filter(i => i.status === 'received').length,
        located:  all.filter(i => i.status === 'located').length,
        picked:   all.filter(i => i.status === 'picked').length,
        shipped:  all.filter(i => i.status === 'shipped').length,
      });
    }
    if (locsData.success)     setLocations(locsData.locations);
    if (usersData.success)    setUsers(usersData.users);
    if (productsData.success) setProducts(productsData.products);
    if (woData.success) setWorkOrders(woData.orders);
    if (sysData.success && sysData.settings) {
      const s = { ...DEFAULT_SETTINGS, ...sysData.settings };
      setSysSettings(s);
      setSysForm(s);
      // DBからCSVマッピングを復元
      if (sysData.settings.csv_product_mapping) {
        setCsvMapping(m => ({ ...m, ...sysData.settings.csv_product_mapping }));
      }
      // DBからWO CSVマッピング（列名ベース）を復元
      if (sysData.settings.wo_csv_mapping) {
        setSavedWoCsvMapping(sysData.settings.wo_csv_mapping);
      }
    }
  }, []);

  useEffect(() => {
    const s = getSession();
    if (!s) { router.push('/auth'); return; }
    if (s.role !== 'admin') { router.push('/'); return; }
    setSession(s);
    fetchAll();
  }, [router, fetchAll]);

  const handleAddLocation = async () => {
    if (!locCode || !locName) return;
    setLocLoading(true);
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: locCode, name: locName, zone: locZone }),
      });
      const data = await res.json();
      if (data.success) {
        setLocMessage({ type: 'success', text: `✅ ロケーション「${locCode}」を登録しました` });
        setLocCode(''); setLocName(''); setLocZone('');
        fetchAll();
        setTimeout(() => setLocMessage(null), 3000);
      }
    } catch {
      setLocMessage({ type: 'error', text: '通信エラーが発生しました' });
    }
    setLocLoading(false);
  };

  const showUserMsg = (type: 'success' | 'error', text: string) => {
    setUserMessage({ type, text });
    setTimeout(() => setUserMessage(null), 3500);
  };

  const handleAddUser = async () => {
    if (!userForm.id || !userForm.name || !userForm.password) {
      showUserMsg('error', 'ID・名前・パスワードはすべて必須です'); return;
    }
    setUserSaving(true);
    const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userForm) });
    const data = await res.json();
    if (data.success) {
      showUserMsg('success', `✅ ユーザー「${userForm.name}」を登録しました`);
      setUserForm({ id: '', name: '', password: '', role: 'user' });
      fetchAll();
    } else {
      showUserMsg('error', data.error || '登録に失敗しました');
    }
    setUserSaving(false);
  };

  const handleToggleActive = async (u: UserRecord) => {
    const res = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id, active: !u.active }) });
    const data = await res.json();
    if (data.success) { showUserMsg('success', `${!u.active ? '✅ 有効化' : '🚫 無効化'}しました`); fetchAll(); }
    else showUserMsg('error', data.error || '更新に失敗しました');
  };

  const handleSaveUserEdit = async () => {
    if (!editingUser) return;
    const body: Record<string, string | boolean> = { id: editingUser.id, role: editRole, active: editActive };
    if (editName.trim())  body.name     = editName.trim();
    if (editPw.trim())    body.password = editPw.trim();
    const res = await fetch('/api/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.success) {
      showUserMsg('success', `✅ ユーザー情報を更新しました`);
      setEditingUser(null); setEditPw(''); setEditName('');
      fetchAll();
    } else {
      showUserMsg('error', data.error || '変更に失敗しました');
    }
  };

  const handleDeleteUser = async (u: UserRecord) => {
    if (!confirm(`ユーザー「${u.name}」を削除しますか？`)) return;
    const res = await fetch('/api/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: u.id }) });
    const data = await res.json();
    if (data.success) { showUserMsg('success', '削除しました'); fetchAll(); }
    else showUserMsg('error', data.error || '削除に失敗しました');
  };

  const saveSettings = async () => {
    setSysSaving(true);
    try {
      const res = await fetch('/api/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sysForm),
      });
      const data = await res.json();
      if (data.success) {
        const s = { ...DEFAULT_SETTINGS, ...data.settings };
        setSysSettings(s); setSysForm(s);
        setSysMessage({ type: 'success', text: '✅ 設定を保存しました' });
        setTimeout(() => setSysMessage(null), 3000);
      } else {
        setSysMessage({ type: 'error', text: data.error || '保存に失敗しました' });
      }
    } catch {
      setSysMessage({ type: 'error', text: '通信エラーが発生しました' });
    }
    setSysSaving(false);
  };

  const exportCSV = () => {
    const header = ['ID', 'バーコード', 'CCコード', '製品名', '数量', 'ステータス',
      'ロケーション', 'ロケーション名', 'ロケーションCC', '入庫日時', 'ピック日時', '更新日時'];
    const rows = filteredItems.map(i => [
      i.id, i.barcode, i.cc_code || '', i.name, i.quantity, statusLabel(i.status),
      i.location_code || '', i.location_name || '', i.location_cc_code || '',
      i.received_at ? new Date(i.received_at).toLocaleString('ja-JP') : '',
      i.picked_at   ? new Date(i.picked_at).toLocaleString('ja-JP') : '',
      new Date(i.updated_at).toLocaleString('ja-JP'),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const bom = '\uFEFF';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `items_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const statusLabel = (s: string) => ({ received: '入庫済', located: 'ロケーション済', picked: 'ピック済', shipped: '出庫済' }[s] || s);
  const statusColor = (s: string) => ({ received: '#2563eb', located: '#0891b2', picked: '#7c3aed', shipped: '#16a34a' }[s] || '#6b7280');

  const filteredItems = items.filter(item => {
    const matchStatus = !filterStatus || item.status === filterStatus;
    const q = searchQuery.toLowerCase();
    const matchSearch = !searchQuery ||
      item.name.toLowerCase().includes(q) ||
      item.barcode.toLowerCase().includes(q) ||
      (item.cc_code || '').toLowerCase().includes(q) ||
      (item.location_code || '').toLowerCase().includes(q) ||
      (item.location_name || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const LOCATIONS_PER_PAGE = 50;
  const filteredLocations = locations
    .filter(loc => {
      if (!locationSearch) return true;
      const q = locationSearch.toLowerCase();
      return loc.code.toLowerCase().includes(q) || loc.name.toLowerCase().includes(q) || (loc.zone || '').toLowerCase().includes(q) || (loc.cc_code || '').toLowerCase().includes(q);
    })
    .sort((a, b) => a.code.localeCompare(b.code, 'ja'));
  const locationTotalPages = Math.max(1, Math.ceil(filteredLocations.length / LOCATIONS_PER_PAGE));
  const pagedLocations = filteredLocations.slice((locationPage - 1) * LOCATIONS_PER_PAGE, locationPage * LOCATIONS_PER_PAGE);

  const exportLocationCSV = () => {
    const header = ['コード', '名称', 'ゾーン', 'CCコード', '有効'];
    const rows = filteredLocations.map(loc => [
      loc.code, loc.name, loc.zone || '', loc.cc_code || '', loc.active ? '有効' : '無効',
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `locations_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const USERS_PER_PAGE = 50;
  const filteredUsers = users
    .filter(u => {
      if (!userSearch) return true;
      const q = userSearch.toLowerCase();
      return u.id.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'ja'));
  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const pagedUsers = filteredUsers.slice((userPage - 1) * USERS_PER_PAGE, userPage * USERS_PER_PAGE);

  const exportUserCSV = () => {
    const header = ['ユーザーID', '名前', '権限', '有効', '登録日時'];
    const rows = filteredUsers.map(u => [
      u.id, u.name, u.role === 'admin' ? '管理者' : '一般ユーザー',
      u.active ? '有効' : '無効',
      new Date(u.created_at).toLocaleString('ja-JP'),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `users_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const formatDateShort = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Alerts
  const alertItems = {
    noCc: items.filter(i => !i.cc_code && i.status === 'located'),
    stagnantReceived: items.filter(i => {
      if (i.status !== 'received') return false;
      const d = i.received_at || i.created_at;
      return d && (Date.now() - new Date(d).getTime()) > 2 * 86400000;
    }),
    stagnantLocated: items.filter(i => {
      if (i.status !== 'located') return false;
      const d = i.received_at || i.created_at;
      return d && (Date.now() - new Date(d).getTime()) > 5 * 86400000;
    }),
  };
  const totalAlerts = alertItems.noCc.length + alertItems.stagnantReceived.length + alertItems.stagnantLocated.length;

  if (!session) return null;

  const totalStock = stats.received + stats.located + stats.picked;

  const showProductMsg = (type: 'success' | 'error', text: string) => {
    setProductMessage({ type, text });
    setTimeout(() => setProductMessage(null), 3500);
  };

  const handleAddProduct = async () => {
    if (!productForm.barcode || !productForm.name) {
      showProductMsg('error', '品目番号と品名は必須です'); return;
    }
    setProductSaving(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...productForm, created_by: session?.userId || 'system' }),
      });
      const data = await res.json();
      if (data.success) {
        showProductMsg('success', `✅ 製品「${productForm.name}」を登録しました`);
        setProductForm({ barcode: '', name: '', spec: '', unit: '個', notes: '' });
        fetchAll();
      } else {
        showProductMsg('error', data.error || '登録に失敗しました');
      }
    } catch {
      showProductMsg('error', '通信エラーが発生しました');
    }
    setProductSaving(false);
  };

  const handleSaveProductEdit = async () => {
    if (!editingProduct) return;
    if (!editProductForm.name.trim()) { showProductMsg('error', '品名は必須です'); return; }
    const res = await fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingProduct.id,
        name: editProductForm.name.trim(),
        spec: editProductForm.spec.trim() || null,
        unit: editProductForm.unit.trim() || '個',
        notes: editProductForm.notes,
        active: editProductForm.active,
        updated_by: session?.userId || 'system',
      }),
    });
    const data = await res.json();
    if (data.success) {
      showProductMsg('success', '✅ 製品情報を更新しました');
      setEditingProduct(null);
      fetchAll();
    } else {
      showProductMsg('error', data.error || '更新に失敗しました');
    }
  };

  const handleToggleItemActive = async (item: Item) => {
    const res = await fetch('/api/items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, active: !item.active, updated_by: session?.userId || 'system' }),
    });
    const data = await res.json();
    if (data.success) { fetchAll(); }
  };

  const handleDeleteItem = async (item: Item) => {
    if (!confirm(`「${item.name || item.barcode}」を削除しますか？\nこの操作は取り消せません。`)) return;
    const res = await fetch('/api/items', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id }),
    });
    const data = await res.json();
    if (data.success) { fetchAll(); }
    else { alert(data.error || '削除に失敗しました'); }
  };

  const handleToggleProductActive = async (p: ProductRecord) => {
    const res = await fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, active: !p.active }),
    });
    const data = await res.json();
    if (data.success) { showProductMsg('success', `${!p.active ? '✅ 有効化' : '🚫 無効化'}しました`); fetchAll(); }
    else showProductMsg('error', data.error || '更新に失敗しました');
  };

  const handleDeleteProduct = async (p: ProductRecord) => {
    if (!confirm(`製品「${p.name}」を削除しますか？`)) return;
    const res = await fetch('/api/products', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id }),
    });
    const data = await res.json();
    if (data.success) { showProductMsg('success', '削除しました'); fetchAll(); }
    else showProductMsg('error', data.error || '削除に失敗しました');
  };

  const PRODUCTS_PER_PAGE = 50;
  const filteredProducts = products
    .filter(p => {
      if (!productSearch) return true;
      const q = productSearch.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q) || (p.spec || '').toLowerCase().includes(q) || (p.notes || '').toLowerCase().includes(q);
    })
    .sort((a, b) => a.barcode.localeCompare(b.barcode, 'ja'));
  const productTotalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const pagedProducts = filteredProducts.slice((productPage - 1) * PRODUCTS_PER_PAGE, productPage * PRODUCTS_PER_PAGE);

  const exportProductCSV = () => {
    const header = ['ID', '品目番号', '品目名称', '規格', '単位', '備考', '有効', '登録日時'];
    const rows = filteredProducts.map(p => [
      p.id, p.barcode, p.name, p.spec || '', p.unit, p.notes || '',
      p.active ? '有効' : '無効',
      new Date(p.created_at).toLocaleString('ja-JP'),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `products_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ---- CSV取込 ----
  const parseCsv = (text: string): string[][] => {
    const t = text.startsWith('\uFEFF') ? text.slice(1) : text;
    const lines: string[][] = [];
    let cur = '', inQ = false;
    let row: string[] = [];
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch === '"') {
        if (inQ && t[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        row.push(cur.trim()); cur = '';
      } else if ((ch === '\n' || (ch === '\r' && t[i+1] === '\n')) && !inQ) {
        if (ch === '\r') i++;
        row.push(cur.trim()); cur = '';
        if (row.some(c => c)) lines.push(row);
        row = [];
      } else { cur += ch; }
    }
    if (cur || row.length) { row.push(cur.trim()); if (row.some(c => c)) lines.push(row); }
    return lines;
  };

  const detectAndDecodeCsv = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    // UTF-8 BOM判定 (EF BB BF)
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(buffer);
    }
    // UTF-8で試みて文字化け（U+FFFD）がなければUTF-8
    const utf8 = new TextDecoder('utf-8').decode(buffer);
    if (!utf8.includes('\uFFFD')) return utf8;
    // Shift-JIS (CP932) にフォールバック
    try {
      return new TextDecoder('shift-jis').decode(buffer);
    } catch {
      return utf8; // 最終フォールバック
    }
  };

  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const text = detectAndDecodeCsv(buffer);
      const all = parseCsv(text);
      if (all.length < 2) { showProductMsg('error', 'CSVのデータが不足しています（ヘッダー+1行以上必要）'); return; }
      const [headers, ...dataRows] = all;
      setCsvHeaders(headers);
      setCsvRows(dataRows);
      // DB保存済みマッピング（csvMapping state）を優先、なければ列名から自動マッチ
      const autoAliases: Record<string, string[]> = {
        barcode: ['品目番号','バーコード','barcode','sku','jan','JAN','品番'],
        name:    ['品目名称','品名','製品名','name','名称','品目名'],
        spec:    ['規格','spec','仕様','スペック'],
        unit:    ['単位','unit'],
        notes:   ['備考','notes','メモ','note'],
      };
      const newMap: Record<string,string> = { barcode:'', name:'', spec:'', unit:'', notes:'' };
      for (const field of Object.keys(newMap)) {
        const dbSaved = csvMapping[field];
        if (dbSaved && headers.includes(dbSaved)) { newMap[field] = dbSaved; continue; }
        const candidates = autoAliases[field] || [];
        newMap[field] = headers.find(h => candidates.some(c => h.toLowerCase() === c.toLowerCase())) || '';
      }
      setCsvMapping(newMap);
      setCsvStep('mapping');
    };
    reader.readAsArrayBuffer(file);
  };

  const buildImportRows = () => {
    const idx = (col: string) => col ? csvHeaders.indexOf(col) : -1;
    const bIdx = idx(csvMapping.barcode), nIdx = idx(csvMapping.name);
    const sIdx = idx(csvMapping.spec), uIdx = idx(csvMapping.unit), oIdx = idx(csvMapping.notes);
    return csvRows
      .filter(row => bIdx >= 0 && row[bIdx]?.trim())
      .map(row => ({
        barcode: row[bIdx]?.trim() || '',
        name:    nIdx >= 0 ? (row[nIdx]?.trim() || '') : '',
        spec:    sIdx >= 0 ? (row[sIdx]?.trim() || null) : null,
        unit:    uIdx >= 0 ? (row[uIdx]?.trim() || '個') : '個',
        notes:   oIdx >= 0 ? (row[oIdx]?.trim() || '') : '',
      }))
      .filter(r => r.barcode && r.name);
  };

  const executeCsvImport = async () => {
    const rows = buildImportRows();
    if (!rows.length) { showProductMsg('error', '有効なデータ行がありません'); return; }
    // マッピングをDBに保存（端末非依存）
    fetch('/api/system', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_product_mapping: csvMapping }),
    }).catch(() => {/* ignore save error */});
    setCsvImporting(true);
    try {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: csvImportMode, rows, created_by: session?.userId || 'system' }),
      });
      const data = await res.json();
      if (data.success) { setCsvResult({ success: data.count, error: data.errors || 0 }); setCsvStep('done'); fetchAll(); }
      else showProductMsg('error', data.error || 'インポートに失敗しました');
    } catch { showProductMsg('error', '通信エラーが発生しました'); }
    setCsvImporting(false);
  };

  const resetCsvImport = () => {
    setCsvImportOpen(false); setCsvStep('upload'); setCsvHeaders([]); setCsvRows([]);
    setCsvMapping({ barcode:'', name:'', spec:'', unit:'', notes:'' });
    setCsvImportMode('add'); setCsvResult(null);
  };

  // ---- ロケーション削除 ----
  const handleDeleteLocation = async (loc: Location) => {
    if (!confirm(`ロケーション「${loc.code}（${loc.name}）」を削除しますか？\nこの操作は元に戻せません。`)) return;
    const res = await fetch('/api/locations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: loc.code }),
    });
    const data = await res.json();
    if (data.success) {
      setLocMessage({ type: 'success', text: `🗑️ ロケーション「${loc.code}」を削除しました` });
      setEditingLocation(null);
      fetchAll();
      setTimeout(() => setLocMessage(null), 3000);
    } else {
      setLocMessage({ type: 'error', text: data.error || '削除に失敗しました' });
      setTimeout(() => setLocMessage(null), 8000);
    }
  };

  // ---- ロケーションCSV取込 ----
  const handleSaveLocationEdit = async () => {
    if (!editingLocation) return;
    const res = await fetch('/api/locations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: editingLocation.code,
        name: editLocationForm.name.trim() || undefined,
        zone: editLocationForm.zone,
        cc_code: editLocationForm.cc_code.trim() || null,
        active: editLocationForm.active,
        updated_by: session?.userId || 'system',
      }),
    });
    const data = await res.json();
    if (data.success) {
      setLocMessage({ type: 'success', text: '✅ ロケーション情報を更新しました' });
      setEditingLocation(null);
      fetchAll();
      setTimeout(() => setLocMessage(null), 3000);
    } else {
      setLocMessage({ type: 'error', text: data.error || '更新に失敗しました' });
    }
  };

  const handleLocCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const text = detectAndDecodeCsv(buffer);
      const all = parseCsv(text);
      if (all.length < 2) { setLocMessage({ type: 'error', text: 'CSVのデータが不足しています（ヘッダー+1行以上必要）' }); return; }
      const [headers, ...dataRows] = all;
      setLocCsvHeaders(headers);
      setLocCsvRows(dataRows);
      const autoAliases: Record<string, string[]> = {
        code:    ['コード','code','ロケーションコード','ロケNo','loc_code'],
        name:    ['名称','name','ロケーション名','ロケーション名称'],
        zone:    ['ゾーン','zone','エリア','area'],
        cc_code: ['CCコード','cc_code','CC','ccコード'],
      };
      const newMap: Record<string,string> = { code:'', name:'', zone:'', cc_code:'' };
      for (const field of Object.keys(newMap)) {
        const candidates = autoAliases[field] || [];
        newMap[field] = headers.find(h => candidates.some(c => h.toLowerCase() === c.toLowerCase())) || '';
      }
      setLocCsvMapping(newMap);
      setLocCsvStep('mapping');
    };
    reader.readAsArrayBuffer(file);
  };

  const buildLocImportRows = () => {
    const idx = (col: string) => col ? locCsvHeaders.indexOf(col) : -1;
    const cIdx = idx(locCsvMapping.code), nIdx = idx(locCsvMapping.name);
    const zIdx = idx(locCsvMapping.zone), ccIdx = idx(locCsvMapping.cc_code);
    return locCsvRows
      .filter(row => cIdx >= 0 && row[cIdx]?.trim())
      .map(row => ({
        code:    row[cIdx]?.trim() || '',
        name:    nIdx >= 0 ? (row[nIdx]?.trim() || '') : '',
        zone:    zIdx >= 0 ? (row[zIdx]?.trim() || '') : '',
        cc_code: ccIdx >= 0 ? (row[ccIdx]?.trim() || null) : null,
      }))
      .filter(r => r.code && r.name);
  };

  const executeLocCsvImport = async () => {
    const rows = buildLocImportRows();
    if (!rows.length) { setLocMessage({ type: 'error', text: '有効なデータ行がありません' }); return; }
    setLocCsvImporting(true);
    try {
      const res = await fetch('/api/locations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: locCsvImportMode, rows, created_by: session?.userId || 'system' }),
      });
      const data = await res.json();
      if (data.success) {
        setLocCsvResult({ inserted: data.inserted || 0, updated: data.updated || 0, skipped: data.skipped || 0 });
        setLocCsvStep('done');
        fetchAll();
      } else {
        setLocMessage({ type: 'error', text: data.error || 'インポートに失敗しました' });
      }
    } catch { setLocMessage({ type: 'error', text: '通信エラーが発生しました' }); }
    setLocCsvImporting(false);
  };

  const resetLocCsvImport = () => {
    setLocCsvImportOpen(false); setLocCsvStep('upload'); setLocCsvHeaders([]); setLocCsvRows([]);
    setLocCsvMapping({ code:'', name:'', zone:'', cc_code:'' });
    setLocCsvImportMode('add'); setLocCsvResult(null);
  };

  // ---- ユーザーCSV取込 ----
  const handleUserCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const text = detectAndDecodeCsv(buffer);
      const all = parseCsv(text);
      if (all.length < 2) { showUserMsg('error', 'CSVのデータが不足しています（ヘッダー+1行以上必要）'); return; }
      const [headers, ...dataRows] = all;
      setUserCsvHeaders(headers);
      setUserCsvRows(dataRows);
      const autoAliases: Record<string, string[]> = {
        id:       ['ユーザーID','id','ID','user_id','userid'],
        name:     ['名前','name','氏名','ユーザー名','user_name'],
        password: ['パスワード','password','pw','passwd'],
        role:     ['権限','role','ロール'],
      };
      const newMap: Record<string,string> = { id:'', name:'', password:'', role:'' };
      for (const field of Object.keys(newMap)) {
        const candidates = autoAliases[field] || [];
        newMap[field] = headers.find(h => candidates.some(c => h.toLowerCase() === c.toLowerCase())) || '';
      }
      setUserCsvMapping(newMap);
      setUserCsvStep('mapping');
    };
    reader.readAsArrayBuffer(file);
  };

  const buildUserImportRows = () => {
    const idx = (col: string) => col ? userCsvHeaders.indexOf(col) : -1;
    const iIdx = idx(userCsvMapping.id), nIdx = idx(userCsvMapping.name);
    const pIdx = idx(userCsvMapping.password), rIdx = idx(userCsvMapping.role);
    return userCsvRows
      .filter(row => iIdx >= 0 && row[iIdx]?.trim())
      .map(row => ({
        id:       row[iIdx]?.trim() || '',
        name:     nIdx >= 0 ? (row[nIdx]?.trim() || '') : '',
        password: pIdx >= 0 ? (row[pIdx]?.trim() || '') : '',
        role:     rIdx >= 0 ? (row[rIdx]?.trim() || 'user') : 'user',
      }))
      .filter(r => r.id && r.name);
  };

  const executeUserCsvImport = async () => {
    const rows = buildUserImportRows();
    if (!rows.length) { showUserMsg('error', '有効なデータ行がありません'); return; }
    setUserCsvImporting(true);
    try {
      const res = await fetch('/api/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: userCsvImportMode, rows, created_by: session?.userId || 'system' }),
      });
      const data = await res.json();
      if (data.success) {
        setUserCsvResult({ inserted: data.inserted || 0, updated: data.updated || 0, skipped: data.skipped || 0 });
        setUserCsvStep('done');
        fetchAll();
      } else {
        showUserMsg('error', data.error || 'インポートに失敗しました');
      }
    } catch { showUserMsg('error', '通信エラーが発生しました'); }
    setUserCsvImporting(false);
  };

  const resetUserCsvImport = () => {
    setUserCsvImportOpen(false); setUserCsvStep('upload'); setUserCsvHeaders([]); setUserCsvRows([]);
    setUserCsvMapping({ id:'', name:'', password:'', role:'' });
    setUserCsvImportMode('add'); setUserCsvResult(null);
  };

  // ---- 作業指図書 ----
  const showWoMsg = (type: 'success' | 'error', text: string) => {
    setWoMessage({ type, text });
    setTimeout(() => setWoMessage(null), 4000);
  };

  const openWoDetail = async (wo: WorkOrder) => {
    setWoDetailWo(wo);
    setWoDetailList([]);
    setWoDetailOpen(true);
    setWoDetailLoading(true);
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`);
      const data = await res.json();
      if (data.success) setWoDetailList(data.details);
    } catch { /* ignore */ }
    setWoDetailLoading(false);
  };

  const handleDeleteWorkOrder = async (wo: WorkOrder) => {
    if (!confirm(`作業指図書「${wo.order_no} ${wo.order_name}」を削除しますか？\n明細もすべて削除されます。`)) return;
    const res = await fetch('/api/work-orders', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: wo.id }),
    });
    const data = await res.json();
    if (data.success) { showWoMsg('success', '削除しました'); fetchAll(); }
    else showWoMsg('error', data.error || '削除に失敗しました');
  };

  const WO_CSV_MAX = 10;

  const parseWoCsvFileAsync = (file: File): Promise<{ name: string; headers: string[]; rows: string[][] }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const text = detectAndDecodeCsv(buffer);
        const all = parseCsv(text);
        if (all.length < 2) { reject(new Error(`${file.name}: データ不足（ヘッダー+1行以上必要）`)); return; }
        const [headers, ...dataRows] = all;
        resolve({ name: file.name, headers, rows: dataRows });
      };
      reader.onerror = () => reject(new Error(`${file.name}: 読み込みエラー`));
      reader.readAsArrayBuffer(file);
    });

  const applyAutoMapping = (headers: string[]) => {
    const autoAliases: Record<string, string[]> = {
      order_no:     ['作業指図書番号','指図書番号','order_no','orderNo','WO番号','作業No','作業NO','作業no','指図No','WO_NO','指図書No'],
      order_name:   ['作業指図書名','指図書名','order_name','orderName','作業指図書名称','指図書名称'],
      barcode:      ['品目番号','バーコード','barcode','sku','JAN','品番','品目コード','商品コード','アイテムコード','JANコード','品番号','品目番号（バーコード）','jan','jan_code'],
      product_name: ['品目名称','品名','製品名','product_name','productName','品目名','商品名','製品名称','アイテム名','品名称','品目名称（製品名）','item_name','itemName'],
      spec:         ['規格','spec','仕様','specifications','製品規格','品目規格','サイズ','規格仕様','specification','size'],
      required_qty: ['出庫予定数','出庫数','数量','qty','required_qty','requiredQty','出庫数量','必要数','必要数量','要求数','要求数量','指示数','指示数量'],
    };
    const newMap: Record<string,string> = { order_no:'', order_name:'', barcode:'', product_name:'', spec:'', required_qty:'' };
    for (const field of Object.keys(newMap)) {
      // 1. 保存済みマッピング（列名ベース）を優先
      const savedHeader = savedWoCsvMapping[field];
      if (savedHeader) {
        const savedIdx = headers.findIndex(h => h === savedHeader);
        if (savedIdx >= 0) { newMap[field] = String(savedIdx); continue; }
      }
      // 2. フォールバック: エイリアス自動マッチ
      const candidates = autoAliases[field] || [];
      const idx = headers.findIndex(h => candidates.some(c => h.toLowerCase() === c.toLowerCase()));
      newMap[field] = idx >= 0 ? String(idx) : '';
    }
    setWoCsvMapping(newMap);
  };

  const handleWoCsvFiles = async (newFiles: File[]) => {
    const csvFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.csv'));
    if (csvFiles.length === 0) { showWoMsg('error', 'CSVファイルを選択してください'); return; }
    const remaining = WO_CSV_MAX - woCsvFiles.length;
    if (remaining <= 0) { showWoMsg('error', `最大${WO_CSV_MAX}ファイルまでです`); return; }
    const toAdd = csvFiles.slice(0, remaining);
    try {
      const parsed = await Promise.all(toAdd.map(parseWoCsvFileAsync));
      setWoCsvFiles(prev => {
        const updated = [...prev, ...parsed];
        // 最初のファイル追加時にヘッダー・マッピングを設定
        if (prev.length === 0 && updated.length > 0) {
          setWoCsvHeaders(updated[0].headers);
          setWoCsvRows(updated[0].rows);
          applyAutoMapping(updated[0].headers);
        }
        return updated;
      });
      if (toAdd.length < csvFiles.length) showWoMsg('error', `最大${WO_CSV_MAX}ファイルのため${csvFiles.length - toAdd.length}件を除外しました`);
    } catch (err) {
      showWoMsg('error', err instanceof Error ? err.message : 'ファイルの読み込みに失敗しました');
    }
  };

  const removeWoCsvFile = (idx: number) => {
    setWoCsvFiles(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      if (updated.length === 0) {
        setWoCsvHeaders([]); setWoCsvRows([]);
        setWoCsvMapping({ order_no:'', order_name:'', barcode:'', product_name:'', spec:'', required_qty:'' });
      } else if (idx === 0) {
        setWoCsvHeaders(updated[0].headers);
        setWoCsvRows(updated[0].rows);
        applyAutoMapping(updated[0].headers);
      }
      return updated;
    });
  };

  const buildWoImportRows = () => {
    const sources = woCsvFiles.length > 0
      ? woCsvFiles
      : (woCsvHeaders.length > 0 ? [{ name: '', headers: woCsvHeaders, rows: woCsvRows }] : []);
    // マッピング値は列インデックス文字列（例: "0", "2"）または空文字
    const colIdx = (idxStr: string) => idxStr !== '' ? parseInt(idxStr, 10) : -1;
    const oIdx  = colIdx(woCsvMapping.order_no);
    const onIdx = colIdx(woCsvMapping.order_name);
    const bIdx  = colIdx(woCsvMapping.barcode);
    const pnIdx = colIdx(woCsvMapping.product_name);
    const spIdx = colIdx(woCsvMapping.spec);
    const rqIdx = colIdx(woCsvMapping.required_qty);
    const allRows: { order_no: string; order_name: string; planned_date: string; barcode: string; product_name: string; spec: string; required_qty: string }[] = [];
    for (const file of sources) {
      const rows = file.rows
        .filter(row => oIdx >= 0 && row[oIdx]?.trim() && bIdx >= 0 && row[bIdx]?.trim())
        .map(row => ({
          order_no:     row[oIdx]?.trim() || '',
          order_name:   onIdx >= 0 ? (row[onIdx]?.trim() || '') : '',
          planned_date: woCsvPlannedDate,
          barcode:      bIdx  >= 0 ? (row[bIdx]?.trim()  || '') : '',
          product_name: pnIdx >= 0 ? (row[pnIdx]?.trim() || '') : '',
          spec:         spIdx >= 0 ? (row[spIdx]?.trim() || '') : '',
          required_qty: rqIdx >= 0 ? (row[rqIdx]?.trim() || '1') : '1',
        }))
        .filter(r => r.order_no && r.barcode);
      allRows.push(...rows);
    }
    return allRows;
  };

  const executeWoCsvImport = async () => {
    const rows = buildWoImportRows();
    if (!rows.length) { showWoMsg('error', '有効なデータ行がありません（作業指図書番号と品目番号は必須）'); return; }
    // マッピングを列名ベースでDBに保存（次回CSVアップ時に自動復元）
    const headerMap: Record<string,string> = {};
    for (const [field, idxStr] of Object.entries(woCsvMapping)) {
      const idx = parseInt(idxStr, 10);
      headerMap[field] = (idx >= 0 && idx < woCsvHeaders.length) ? woCsvHeaders[idx] : '';
    }
    setSavedWoCsvMapping(headerMap);
    fetch('/api/system', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wo_csv_mapping: headerMap }),
    }).catch(() => {/* ignore save error */});
    setWoCsvImporting(true);
    try {
      const res = await fetch('/api/work-orders/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, created_by: session?.userId || 'system' }),
      });
      const data = await res.json();
      if (data.success) {
        setWoCsvResult({ inserted_orders: data.inserted_orders, updated_orders: data.updated_orders, inserted_details: data.inserted_details, total_orders: data.total_orders });
        setWoCsvStep('done');
        fetchAll();
      } else {
        showWoMsg('error', data.error || 'インポートに失敗しました');
      }
    } catch { showWoMsg('error', '通信エラーが発生しました'); }
    setWoCsvImporting(false);
  };

  const resetWoCsvImport = () => {
    setWoCsvImportOpen(false); setWoCsvStep('upload'); setWoCsvHeaders([]); setWoCsvRows([]);
    setWoCsvFiles([]);
    setWoCsvMapping({ order_no:'', order_name:'', barcode:'', product_name:'', spec:'', required_qty:'' });
    setWoCsvPlannedDate(new Date().toISOString().slice(0, 10));
    setWoCsvResult(null);
  };

  const exportWorkOrderCSV = () => {
    const header = ['作業指図書番号', '作業指図書名', '出庫依頼日', 'アイテム数', 'ステータス', '出庫予定数', '出庫済数', '出庫残数', '登録日時'];
    const rows = filteredWorkOrders.map(wo => [
      wo.order_no, wo.order_name, wo.planned_date || '',
      wo.item_count, woStatusLabel(wo.status),
      wo.total_required, wo.total_picked, Math.max(0, wo.total_required - wo.total_picked),
      new Date(wo.created_at).toLocaleString('ja-JP'),
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `work_orders_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const WO_PER_PAGE = 50;
  const woStatusLabel = (s: string) => ({ open: '未着手', in_progress: '進行中', completed: '完了' }[s] || s);
  const woStatusColor = (s: string) => ({ open: '#2563eb', in_progress: '#d97706', completed: '#16a34a' }[s] || '#6b7280');
  const filteredWorkOrders = workOrders
    .filter(wo => {
      if (!woSearch) return true;
      const q = woSearch.toLowerCase();
      return wo.order_no.toLowerCase().includes(q) || wo.order_name.toLowerCase().includes(q);
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const woTotalPages = Math.max(1, Math.ceil(filteredWorkOrders.length / WO_PER_PAGE));
  const pagedWorkOrders = filteredWorkOrders.slice((woPage - 1) * WO_PER_PAGE, woPage * WO_PER_PAGE);

  const TAB_DEFS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'dashboard',  label: '📊 ダッシュボード' },
    { id: 'items',      label: `📦 アイテム (${items.length})` },
    { id: 'locations',  label: `📍 ロケーション (${locations.length})` },
    { id: 'alerts',     label: `⚠️ アラート`, badge: totalAlerts },
    { id: 'products',   label: `🏷️ 品目マスタ (${products.length})` },
    { id: 'workorders', label: `📋 ピッキングリスト作成 (${workOrders.length})` },
    { id: 'users',      label: `👤 ユーザー (${users.length})` },
    { id: 'settings',   label: '⚙️ 設定' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "-apple-system, 'Hiragino Kaku Gothic ProN', 'Segoe UI', sans-serif", color: '#0f172a', fontSize: '14px' }}>
      {/* Header */}
      <div style={{ background: '#1e3a5f', color: '#fff', padding: '0 20px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <a href="/" style={{ color: '#fff', textDecoration: 'none', fontSize: '18px', opacity: 0.8 }}>←</a>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', letterSpacing: '-0.3px' }}>⚙️ PC管理</div>
            <div style={{ fontSize: '11px', opacity: 0.6 }}>管理者ダッシュボード</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={fetchAll} style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: '6px', color: '#fff', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>
            🔄 更新
          </button>
          <div style={{ fontSize: '12px', background: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '3px 10px' }}>
            {session.userName}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '2px solid #e2e8f0', overflowX: 'auto', position: 'sticky', top: '52px', zIndex: 99 }}>
        {TAB_DEFS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: '0 0 auto', padding: '10px 14px', border: 'none', background: 'none', fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? '#1e3a5f' : '#64748b', borderBottom: tab === t.id ? '3px solid #1e3a5f' : '3px solid transparent', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap', position: 'relative' }}>
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span style={{ position: 'absolute', top: '6px', right: '4px', background: '#dc2626', color: '#fff', borderRadius: '10px', fontSize: '9px', fontWeight: 700, padding: '1px 5px', minWidth: '16px', textAlign: 'center' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* ===== DASHBOARD ===== */}
        {tab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Pipeline */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>📦 在庫パイプライン</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: '360px' }}>
                {[
                  { label: '入庫済', sub: 'ロケ未登録', value: stats.received, color: '#2563eb', bg: '#eff6ff', icon: '📥' },
                  { label: 'ロケ登録済', sub: 'ピック待ち', value: stats.located, color: '#0891b2', bg: '#ecfeff', icon: '📍' },
                  { label: 'ピック済', sub: '出庫待ち', value: stats.picked, color: '#7c3aed', bg: '#faf5ff', icon: '🔍' },
                  { label: '出庫済', sub: '完了', value: stats.shipped, color: '#16a34a', bg: '#f0fdf4', icon: '🚚' },
                ].map((step, i, arr) => (
                  <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                    <div style={{ flex: 1, background: step.bg, borderRadius: '10px', padding: '10px 8px', textAlign: 'center', border: `1px solid ${step.color}33` }}>
                      <div style={{ fontSize: '18px', marginBottom: '3px' }}>{step.icon}</div>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: step.color, lineHeight: 1 }}>{step.value}</div>
                      <div style={{ fontSize: '10px', color: step.color, fontWeight: 600, marginTop: '2px' }}>{step.label}</div>
                      <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '1px' }}>{step.sub}</div>
                    </div>
                    {i < arr.length - 1 && <div style={{ color: '#cbd5e1', fontSize: '16px', fontWeight: 700, flexShrink: 0 }}>→</div>}
                  </div>
                ))}
                <div style={{ width: '1px', background: '#e2e8f0', margin: '0 8px', alignSelf: 'stretch' }}/>
                <div style={{ textAlign: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '10px', minWidth: '80px' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>在庫中</div>
                  <div style={{ fontSize: '30px', fontWeight: 800, lineHeight: 1, color: '#0f172a' }}>{totalStock}</div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>全{items.length}件中</div>
                </div>
              </div>
            </div>

            {/* Stat cards 2x2 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {[
                { label: '入庫済', value: stats.received, icon: '📥', color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
                { label: 'ロケーション済', value: stats.located, icon: '📍', color: '#0891b2', bg: '#ecfeff', border: '#0891b2' },
                { label: 'ピック済', value: stats.picked, icon: '🔍', color: '#7c3aed', bg: '#faf5ff', border: '#7c3aed' },
                { label: '出庫済', value: stats.shipped, icon: '🚚', color: '#16a34a', bg: '#f0fdf4', border: '#16a34a' },
              ].map(card => (
                <div key={card.label} style={{ background: card.bg, borderRadius: '12px', padding: '14px', border: `1px solid ${card.border}33`, borderTop: `3px solid ${card.border}`, cursor: 'pointer' }} onClick={() => setTab('items')}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{card.icon}</div>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>{card.label}</div>
                </div>
              ))}
            </div>

            {/* Summary info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ background: '#fff', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>📍 ロケーション</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{locations.length}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>登録保管場所数</div>
              </div>
              <div style={{ background: totalAlerts > 0 ? '#fef2f2' : '#fff', borderRadius: '12px', padding: '14px', border: `1px solid ${totalAlerts > 0 ? '#fecaca' : '#e2e8f0'}`, cursor: totalAlerts > 0 ? 'pointer' : 'default' }}
                onClick={() => totalAlerts > 0 && setTab('alerts')}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: totalAlerts > 0 ? '#dc2626' : '#64748b', marginBottom: '4px' }}>⚠️ アラート</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: totalAlerts > 0 ? '#dc2626' : '#0f172a', lineHeight: 1 }}>{totalAlerts}</div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>要対応件数</div>
              </div>
            </div>

            {/* CC code not registered alert */}
            {alertItems.noCc.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '14px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '6px' }}>❌ CCコード未登録: {alertItems.noCc.length}件</div>
                <div style={{ fontSize: '12px', color: '#b91c1c' }}>CCコードが未登録のアイテムはCCスキャンでピッキングできません。入庫処理を確認してください。</div>
                <button onClick={() => setTab('alerts')} style={{ marginTop: '8px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  詳細を見る →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===== ITEMS ===== */}
        {tab === 'items' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Search + filter */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="商品名・バーコード・CCコードで検索"
                style={{ flex: '1 1 180px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', minWidth: '0' }}
              />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                style={{ height: '44px', padding: '0 32px 0 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', background: '#fff', WebkitAppearance: 'none', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%2364748b\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
                <option value="">すべて</option>
                <option value="received">入庫済</option>
                <option value="located">ロケーション済</option>
                <option value="picked">ピック済</option>
                <option value="shipped">出庫済</option>
              </select>
              <button onClick={exportCSV}
                style={{ padding: '10px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ⬇ CSV
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>{filteredItems.length}件表示</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredItems.map(item => (
                <div key={item.id} style={{ background: item.active !== false ? '#fff' : '#f8fafc', borderRadius: '10px', padding: '12px 14px', border: `1px solid ${item.active !== false ? '#e2e8f0' : '#fecaca'}`, opacity: item.active !== false ? 1 : 0.7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', flex: 1, marginRight: '8px', color: item.active !== false ? '#0f172a' : '#94a3b8' }}>{item.name}</div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                      {item.active === false && (
                        <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '6px', padding: '2px 6px', fontSize: '10px', fontWeight: 700 }}>無効</span>
                      )}
                      <span style={{ background: statusColor(item.status) + '22', color: statusColor(item.status), borderRadius: '6px', padding: '2px 8px', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {statusLabel(item.status)}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', fontSize: '11px', color: '#475569' }}>
                    <div>📋 バーコード: <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{item.barcode}</span></div>
                    <div>🔷 CCコード: <span style={{ fontFamily: 'monospace', color: item.cc_code ? '#0f172a' : '#dc2626', fontWeight: item.cc_code ? 400 : 700 }}>{item.cc_code || '未登録'}</span></div>
                    <div>📦 数量: {item.quantity}</div>
                    {item.location_code && <div>📍 {item.location_code}{item.location_name ? ` (${item.location_name})` : ''}</div>}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '5px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span>入庫: {formatDateShort(item.received_at || item.created_at)}</span>
                    {item.picked_at && <span>ピック: {formatDateShort(item.picked_at)}</span>}
                    <span>更新: {formatDate(item.updated_at)}</span>
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button onClick={() => handleToggleItemActive(item)}
                      style={{ padding: '4px 10px', background: item.active !== false ? '#fef2f2' : '#f0fdf4', color: item.active !== false ? '#dc2626' : '#16a34a', border: `1px solid ${item.active !== false ? '#fecaca' : '#86efac'}`, borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                      {item.active !== false ? '🚫 無効にする' : '✅ 有効にする'}
                    </button>
                    {['received', 'located'].includes(item.status) && (
                      <button onClick={() => handleDeleteItem(item)}
                        style={{ padding: '4px 10px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                        🗑️ 削除
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                  <div>アイテムがありません</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== LOCATIONS ===== */}
        {tab === 'locations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Add location form */}
            <div style={{ background: '#fff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>➕ ロケーション追加</div>
              {locMessage && (
                <div style={{ padding: '10px 12px', borderRadius: '8px', marginBottom: '12px', background: locMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${locMessage.type === 'success' ? '#86efac' : '#fecaca'}`, color: locMessage.type === 'success' ? '#166534' : '#dc2626', fontWeight: 600, fontSize: '13px' }}>
                  {locMessage.text}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="text" value={locCode} onChange={e => setLocCode(e.target.value)}
                  placeholder="コード（例：A-01-01）"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <input type="text" value={locName} onChange={e => setLocName(e.target.value)}
                  placeholder="名称（例：Aゾーン1列1段）"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <input type="text" value={locZone} onChange={e => setLocZone(e.target.value)}
                  placeholder="ゾーン（例：A / B / 冷蔵）"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }}
                />
                <button onClick={handleAddLocation} disabled={!locCode || !locName || locLoading}
                  style={{ padding: '12px', background: (!locCode || !locName) ? '#d1d5db' : 'linear-gradient(135deg, #1e3a5f, #334155)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: (!locCode || !locName) ? 'not-allowed' : 'pointer' }}>
                  {locLoading ? '登録中...' : '📍 ロケーションを登録する'}
                </button>
              </div>
            </div>

            {/* 検索・CSV */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="text" value={locationSearch} onChange={e => { setLocationSearch(e.target.value); setLocationPage(1); }}
                placeholder="コード・名称・ゾーンで検索"
                style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', minWidth: '0' }} />
              <button onClick={exportLocationCSV}
                style={{ padding: '10px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ⬇ CSV出力
              </button>
              <button onClick={() => { setLocCsvImportOpen(true); setLocCsvStep('upload'); }}
                style={{ padding: '10px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                📥 CSV取込
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                全{filteredLocations.length}件 · {filteredLocations.length > 0 ? `${(locationPage - 1) * LOCATIONS_PER_PAGE + 1}〜${Math.min(locationPage * LOCATIONS_PER_PAGE, filteredLocations.length)}件表示` : '0件'}
              </div>
              {locationTotalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button onClick={() => setLocationPage(1)} disabled={locationPage === 1} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: locationPage === 1 ? 'not-allowed' : 'pointer', color: locationPage === 1 ? '#cbd5e1' : '#374151' }}>«</button>
                  <button onClick={() => setLocationPage(p => Math.max(1, p - 1))} disabled={locationPage === 1} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: locationPage === 1 ? 'not-allowed' : 'pointer', color: locationPage === 1 ? '#cbd5e1' : '#374151' }}>‹</button>
                  <span style={{ fontSize: '12px', color: '#374151', padding: '0 6px' }}>{locationPage} / {locationTotalPages}</span>
                  <button onClick={() => setLocationPage(p => Math.min(locationTotalPages, p + 1))} disabled={locationPage === locationTotalPages} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: locationPage === locationTotalPages ? 'not-allowed' : 'pointer', color: locationPage === locationTotalPages ? '#cbd5e1' : '#374151' }}>›</button>
                  <button onClick={() => setLocationPage(locationTotalPages)} disabled={locationPage === locationTotalPages} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: locationPage === locationTotalPages ? 'not-allowed' : 'pointer', color: locationPage === locationTotalPages ? '#cbd5e1' : '#374151' }}>»</button>
                </div>
              )}
            </div>

            {/* Location list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredLocations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📍</div>
                  <div>ロケーションが登録されていません</div>
                </div>
              ) : pagedLocations.map(loc => {
                const locItems = items.filter(i => i.location_code === loc.code && i.status === 'located');
                return (
                  <div key={loc.code} style={{ background: '#fff', borderRadius: '10px', border: `1px solid ${loc.active ? '#e2e8f0' : '#fecaca'}`, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '15px', color: loc.active ? '#0f172a' : '#94a3b8' }}>{loc.code}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{loc.name}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                          {!loc.active && <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '6px', padding: '2px 6px', fontSize: '10px', fontWeight: 700 }}>無効</span>}
                          {loc.zone && <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>{loc.zone}</span>}
                          {locItems.length > 0 && <span style={{ background: '#ecfeff', color: '#0891b2', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>{locItems.length}件在庫</span>}
                        </div>
                      </div>
                      {loc.cc_code && (
                        <div style={{ fontSize: '11px', color: '#475569', marginBottom: '6px' }}>
                          🔷 CC: <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{loc.cc_code}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button onClick={() => { setEditingLocation(l => l?.code === loc.code ? null : loc); setEditLocationForm({ name: loc.name, zone: loc.zone || '', cc_code: loc.cc_code || '', active: loc.active }); }}
                          style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: editingLocation?.code === loc.code ? '#f1f5f9' : '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                          ✏️ 編集
                        </button>
                        <button onClick={() => handleDeleteLocation(loc)}
                          style={{ padding: '5px 10px', border: '1px solid #fecaca', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>
                          🗑️ 削除
                        </button>
                      </div>
                    </div>
                    {editingLocation?.code === loc.code && (
                      <div style={{ padding: '12px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>編集</div>
                        <div style={{ marginBottom: '8px' }}>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>名称</label>
                          <input type="text" value={editLocationForm.name} onChange={e => setEditLocationForm(f => ({ ...f, name: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                          <div>
                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>ゾーン</label>
                            <input type="text" value={editLocationForm.zone} onChange={e => setEditLocationForm(f => ({ ...f, zone: e.target.value }))}
                              placeholder="例: A / 冷蔵"
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>CCコード</label>
                            <input type="text" value={editLocationForm.cc_code} onChange={e => setEditLocationForm(f => ({ ...f, cc_code: e.target.value }))}
                              placeholder="CCコード"
                              style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: editLocationForm.active ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', border: `1px solid ${editLocationForm.active ? '#bbf7d0' : '#fecaca'}` }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: editLocationForm.active ? '#16a34a' : '#dc2626' }}>
                            {editLocationForm.active ? '✅ 有効' : '🚫 無効'}
                          </span>
                          <button type="button" onClick={() => setEditLocationForm(f => ({ ...f, active: !f.active }))}
                            style={{ padding: '4px 12px', border: `1px solid ${editLocationForm.active ? '#86efac' : '#fca5a5'}`, borderRadius: '6px', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: editLocationForm.active ? '#dc2626' : '#16a34a' }}>
                            {editLocationForm.active ? '無効にする' : '有効にする'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={handleSaveLocationEdit}
                            style={{ padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                            💾 保存
                          </button>
                          <button onClick={() => setEditingLocation(null)}
                            style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', color: '#64748b' }}>
                            キャンセル
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {locationTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', paddingTop: '8px' }}>
                <button onClick={() => setLocationPage(1)} disabled={locationPage === 1} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: locationPage === 1 ? 'not-allowed' : 'pointer', color: locationPage === 1 ? '#cbd5e1' : '#374151' }}>«</button>
                <button onClick={() => setLocationPage(p => Math.max(1, p - 1))} disabled={locationPage === 1} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: locationPage === 1 ? 'not-allowed' : 'pointer', color: locationPage === 1 ? '#cbd5e1' : '#374151' }}>‹ 前へ</button>
                <span style={{ fontSize: '13px', color: '#374151', padding: '0 10px', fontWeight: 600 }}>{locationPage} / {locationTotalPages} ページ</span>
                <button onClick={() => setLocationPage(p => Math.min(locationTotalPages, p + 1))} disabled={locationPage === locationTotalPages} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: locationPage === locationTotalPages ? 'not-allowed' : 'pointer', color: locationPage === locationTotalPages ? '#cbd5e1' : '#374151' }}>次へ ›</button>
                <button onClick={() => setLocationPage(locationTotalPages)} disabled={locationPage === locationTotalPages} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: locationPage === locationTotalPages ? 'not-allowed' : 'pointer', color: locationPage === locationTotalPages ? '#cbd5e1' : '#374151' }}>»</button>
              </div>
            )}
          </div>
        )}

        {/* ===== ALERTS ===== */}
        {tab === 'alerts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {totalAlerts === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#16a34a', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>アラートなし</div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>すべて正常です</div>
              </div>
            ) : (
              <>
                {/* CC code not registered */}
                {alertItems.noCc.length > 0 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626', marginBottom: '10px' }}>
                      ❌ CCコード未登録 ({alertItems.noCc.length}件)
                    </div>
                    <div style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '10px' }}>
                      ロケーション登録済だがCCコードが未設定です。ピッキング時にCCスキャンが使えません。
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {alertItems.noCc.slice(0, 10).map(item => (
                        <div key={item.id} style={{ background: '#fff', borderRadius: '8px', padding: '8px 12px', border: '1px solid #fecaca', fontSize: '12px' }}>
                          <div style={{ fontWeight: 700 }}>{item.name}</div>
                          <div style={{ color: '#64748b' }}>バーコード: <span style={{ fontFamily: 'monospace' }}>{item.barcode}</span> | 📍 {item.location_code || '-'}</div>
                        </div>
                      ))}
                      {alertItems.noCc.length > 10 && <div style={{ fontSize: '12px', color: '#dc2626', textAlign: 'center', padding: '4px' }}>... 他{alertItems.noCc.length - 10}件</div>}
                    </div>
                  </div>
                )}

                {/* Stagnant received */}
                {alertItems.stagnantReceived.length > 0 && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#d97706', marginBottom: '10px' }}>
                      ⏰ 入庫後ロケーション未登録 2日以上 ({alertItems.stagnantReceived.length}件)
                    </div>
                    <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '10px' }}>
                      入庫から2日以上経過してもロケーション登録が完了していません。
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {alertItems.stagnantReceived.slice(0, 10).map(item => (
                        <div key={item.id} style={{ background: '#fff', borderRadius: '8px', padding: '8px 12px', border: '1px solid #fde68a', fontSize: '12px' }}>
                          <div style={{ fontWeight: 700 }}>{item.name}</div>
                          <div style={{ color: '#64748b' }}>入庫: {formatDate(item.received_at || item.created_at)}</div>
                        </div>
                      ))}
                      {alertItems.stagnantReceived.length > 10 && <div style={{ fontSize: '12px', color: '#d97706', textAlign: 'center', padding: '4px' }}>... 他{alertItems.stagnantReceived.length - 10}件</div>}
                    </div>
                  </div>
                )}

                {/* Stagnant located */}
                {alertItems.stagnantLocated.length > 0 && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#ea580c', marginBottom: '10px' }}>
                      ⏳ ロケーション登録後ピック未完了 5日以上 ({alertItems.stagnantLocated.length}件)
                    </div>
                    <div style={{ fontSize: '12px', color: '#9a3412', marginBottom: '10px' }}>
                      ロケーション登録から5日以上経過してもピッキングが完了していません。
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {alertItems.stagnantLocated.slice(0, 10).map(item => (
                        <div key={item.id} style={{ background: '#fff', borderRadius: '8px', padding: '8px 12px', border: '1px solid #fed7aa', fontSize: '12px' }}>
                          <div style={{ fontWeight: 700 }}>{item.name}</div>
                          <div style={{ color: '#64748b' }}>📍 {item.location_code || '-'} | 入庫: {formatDate(item.received_at || item.created_at)}</div>
                        </div>
                      ))}
                      {alertItems.stagnantLocated.length > 10 && <div style={{ fontSize: '12px', color: '#ea580c', textAlign: 'center', padding: '4px' }}>... 他{alertItems.stagnantLocated.length - 10}件</div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== PRODUCTS ===== */}
        {tab === 'products' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {productMessage && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: productMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', color: productMessage.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${productMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
                {productMessage.text}
              </div>
            )}

            {/* 新規登録フォーム */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>➕ 新規品目登録</div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>品目番号（バーコード）<span style={{ color: '#dc2626' }}>*</span></label>
                <input type="text" value={productForm.barcode} onChange={e => setProductForm(f => ({ ...f, barcode: e.target.value }))}
                  placeholder="例: 4901234567890"
                  style={{ width: '100%', padding: '9px 11px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>品目名称<span style={{ color: '#dc2626' }}>*</span></label>
                <input type="text" value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例: サンプル製品A"
                  style={{ width: '100%', padding: '9px 11px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>規格</label>
                  <input type="text" value={productForm.spec} onChange={e => setProductForm(f => ({ ...f, spec: e.target.value }))}
                    placeholder="例: 500ml / φ30×H50"
                    style={{ width: '100%', padding: '9px 11px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>単位</label>
                  <input type="text" value={productForm.unit} onChange={e => setProductForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="個"
                    style={{ width: '100%', padding: '9px 11px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>備考（任意）</label>
                <input type="text" value={productForm.notes} onChange={e => setProductForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="メモ"
                  style={{ width: '100%', padding: '9px 11px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <button onClick={handleAddProduct} disabled={productSaving}
                style={{ width: '100%', padding: '12px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: productSaving ? 'not-allowed' : 'pointer', opacity: productSaving ? 0.7 : 1 }}>
                {productSaving ? '登録中...' : '🏷️ 品目を登録する'}
              </button>
            </div>

            {/* 検索・CSV */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="text" value={productSearch} onChange={e => { setProductSearch(e.target.value); setProductPage(1); }}
                placeholder="品目名称・品目番号・規格で検索"
                style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', minWidth: '0' }} />
              <button onClick={exportProductCSV}
                style={{ padding: '10px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ⬇ CSV出力
              </button>
              <button onClick={() => { setCsvImportOpen(true); setCsvStep('upload'); }}
                style={{ padding: '10px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                📥 CSV取込
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                全{filteredProducts.length}件 · {filteredProducts.length > 0 ? `${(productPage - 1) * PRODUCTS_PER_PAGE + 1}〜${Math.min(productPage * PRODUCTS_PER_PAGE, filteredProducts.length)}件表示` : '0件'}
              </div>
              {productTotalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button onClick={() => setProductPage(1)} disabled={productPage === 1}
                    style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: productPage === 1 ? 'not-allowed' : 'pointer', color: productPage === 1 ? '#cbd5e1' : '#374151' }}>«</button>
                  <button onClick={() => setProductPage(p => Math.max(1, p - 1))} disabled={productPage === 1}
                    style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: productPage === 1 ? 'not-allowed' : 'pointer', color: productPage === 1 ? '#cbd5e1' : '#374151' }}>‹</button>
                  <span style={{ fontSize: '12px', color: '#374151', padding: '0 6px' }}>{productPage} / {productTotalPages}</span>
                  <button onClick={() => setProductPage(p => Math.min(productTotalPages, p + 1))} disabled={productPage === productTotalPages}
                    style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: productPage === productTotalPages ? 'not-allowed' : 'pointer', color: productPage === productTotalPages ? '#cbd5e1' : '#374151' }}>›</button>
                  <button onClick={() => setProductPage(productTotalPages)} disabled={productPage === productTotalPages}
                    style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: productPage === productTotalPages ? 'not-allowed' : 'pointer', color: productPage === productTotalPages ? '#cbd5e1' : '#374151' }}>»</button>
                </div>
              )}
            </div>

            {/* 製品一覧 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>🏷️</div>
                  <div style={{ fontWeight: 600 }}>品目マスタが登録されていません</div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>上のフォームから登録してください</div>
                </div>
              ) : pagedProducts.map(product => (
                <div key={product.id} style={{ background: '#fff', borderRadius: '10px', border: `1px solid ${product.active ? '#e2e8f0' : '#fecaca'}`, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 14px' }}>
                    {(() => {
                      const itemCnt   = product.item_count   ?? 0;
                      const allocQty  = product.allocated_qty ?? 0;
                      const shippedQt = product.shipped_qty   ?? 0;
                      const isAllShipped = itemCnt > 0 && shippedQt >= itemCnt;
                      return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div style={{ flex: 1, marginRight: '8px' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: product.active ? '#0f172a' : '#94a3b8' }}>{product.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>{product.barcode}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                        {isAllShipped && <span style={{ background: '#f0fdf4', color: '#16a34a', borderRadius: '6px', padding: '2px 7px', fontSize: '10px', fontWeight: 700, border: '1px solid #bbf7d0' }}>✅ 出庫済み</span>}
                        {!product.active && <span style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '6px', padding: '2px 6px', fontSize: '10px', fontWeight: 700 }}>無効</span>}
                        <span style={{ background: '#f8fafc', color: '#64748b', borderRadius: '6px', padding: '2px 8px', fontSize: '10px' }}>{product.unit}</span>
                      </div>
                    </div>
                      );
                    })()}
                    {product.spec && <div style={{ fontSize: '12px', color: '#475569', marginBottom: '3px' }}>📐 {product.spec}</div>}
                    {product.notes && <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>📝 {product.notes}</div>}
                    {/* 在庫数量バッジ: 入庫数 / 引当数 / 出庫数 */}
                    {((product.item_count ?? 0) > 0 || (product.shipped_qty ?? 0) > 0) && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f1f5f9', color: '#475569', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 600 }}>
                          📦 入庫 <strong style={{ color: '#0f172a' }}>{product.item_count ?? 0}</strong>
                        </span>
                        {(product.allocated_qty ?? 0) > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fffbeb', color: '#92400e', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, border: '1px solid #fde68a' }}>
                            🔒 引当 <strong>{product.allocated_qty}</strong>
                          </span>
                        )}
                        {(product.shipped_qty ?? 0) > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: 600, border: '1px solid #bfdbfe' }}>
                            🚚 出庫 <strong>{product.shipped_qty}</strong>
                          </span>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button onClick={() => { setEditingProduct(p => p?.id === product.id ? null : product); setEditProductForm({ name: product.name, spec: product.spec || '', unit: product.unit, notes: product.notes || '', active: product.active }); }}
                        style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: editingProduct?.id === product.id ? '#f1f5f9' : '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>
                        ✏️ 編集
                      </button>
                      <button onClick={() => handleDeleteProduct(product)}
                        style={{ padding: '5px 10px', border: '1px solid #fecaca', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>
                        🗑️ 削除
                      </button>
                    </div>
                  </div>
                  {editingProduct?.id === product.id && (
                    <div style={{ padding: '12px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>編集</div>
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>品目名称</label>
                        <input type="text" value={editProductForm.name} onChange={e => setEditProductForm(f => ({ ...f, name: e.target.value }))}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>規格</label>
                          <input type="text" value={editProductForm.spec} onChange={e => setEditProductForm(f => ({ ...f, spec: e.target.value }))}
                            placeholder="例: 500ml / φ30×H50"
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>単位</label>
                          <input type="text" value={editProductForm.unit} onChange={e => setEditProductForm(f => ({ ...f, unit: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '3px' }}>備考</label>
                        <input type="text" value={editProductForm.notes} onChange={e => setEditProductForm(f => ({ ...f, notes: e.target.value }))}
                          style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: editProductForm.active ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', border: `1px solid ${editProductForm.active ? '#bbf7d0' : '#fecaca'}` }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: editProductForm.active ? '#16a34a' : '#dc2626' }}>
                          {editProductForm.active ? '✅ 有効' : '🚫 無効'}
                        </span>
                        <button type="button" onClick={() => setEditProductForm(f => ({ ...f, active: !f.active }))}
                          style={{ padding: '4px 12px', border: `1px solid ${editProductForm.active ? '#86efac' : '#fca5a5'}`, borderRadius: '6px', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: editProductForm.active ? '#dc2626' : '#16a34a' }}>
                          {editProductForm.active ? '無効にする' : '有効にする'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={handleSaveProductEdit}
                          style={{ padding: '8px 16px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                          💾 保存
                        </button>
                        <button onClick={() => setEditingProduct(null)}
                          style={{ padding: '8px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', cursor: 'pointer', color: '#64748b' }}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 下部ページネーション */}
            {productTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', paddingTop: '8px' }}>
                <button onClick={() => setProductPage(1)} disabled={productPage === 1}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: productPage === 1 ? 'not-allowed' : 'pointer', color: productPage === 1 ? '#cbd5e1' : '#374151' }}>«</button>
                <button onClick={() => setProductPage(p => Math.max(1, p - 1))} disabled={productPage === 1}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: productPage === 1 ? 'not-allowed' : 'pointer', color: productPage === 1 ? '#cbd5e1' : '#374151' }}>‹ 前へ</button>
                <span style={{ fontSize: '13px', color: '#374151', padding: '0 10px', fontWeight: 600 }}>{productPage} / {productTotalPages} ページ</span>
                <button onClick={() => setProductPage(p => Math.min(productTotalPages, p + 1))} disabled={productPage === productTotalPages}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: productPage === productTotalPages ? 'not-allowed' : 'pointer', color: productPage === productTotalPages ? '#cbd5e1' : '#374151' }}>次へ ›</button>
                <button onClick={() => setProductPage(productTotalPages)} disabled={productPage === productTotalPages}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: productPage === productTotalPages ? 'not-allowed' : 'pointer', color: productPage === productTotalPages ? '#cbd5e1' : '#374151' }}>»</button>
              </div>
            )}
          </div>
        )}

        {/* ===== USERS ===== */}
        {tab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {userMessage && (
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: userMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${userMessage.type === 'success' ? '#86efac' : '#fecaca'}`, color: userMessage.type === 'success' ? '#166534' : '#dc2626', fontWeight: 700, fontSize: '14px' }}>
                {userMessage.text}
              </div>
            )}

            {/* 新規ユーザー追加フォーム */}
            <div style={{ background: '#fff', borderRadius: '14px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>➕ ユーザー追加</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '3px' }}>ユーザーID</label>
                    <input type="text" value={userForm.id} onChange={e => setUserForm(p => ({ ...p, id: e.target.value }))}
                      placeholder="例: user01"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '3px' }}>名前</label>
                    <input type="text" value={userForm.name} onChange={e => setUserForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="例: 山田太郎"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '3px' }}>パスワード</label>
                    <input type="password" value={userForm.password} onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="パスワード"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '3px' }}>権限</label>
                    <select value={userForm.role} onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}
                      style={{ width: '100%', height: '44px', padding: '0 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', background: '#fff', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%2364748b\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}>
                      <option value="user">一般ユーザー</option>
                      <option value="admin">管理者</option>
                    </select>
                  </div>
                </div>
                <button onClick={handleAddUser} disabled={userSaving || !userForm.id || !userForm.name || !userForm.password}
                  style={{ padding: '12px', background: (!userForm.id || !userForm.name || !userForm.password) ? '#d1d5db' : 'linear-gradient(135deg, #1e3a5f, #334155)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                  {userSaving ? '登録中...' : '👤 ユーザーを追加する'}
                </button>
              </div>
            </div>

            {/* 検索・CSV */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input type="text" value={userSearch} onChange={e => { setUserSearch(e.target.value); setUserPage(1); }}
                placeholder="ID・名前・権限で検索"
                style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', minWidth: '0' }} />
              <button onClick={exportUserCSV}
                style={{ padding: '10px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ⬇ CSV出力
              </button>
              <button onClick={() => { setUserCsvImportOpen(true); setUserCsvStep('upload'); }}
                style={{ padding: '10px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                📥 CSV取込
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                全{filteredUsers.length}件 · {filteredUsers.length > 0 ? `${(userPage - 1) * USERS_PER_PAGE + 1}〜${Math.min(userPage * USERS_PER_PAGE, filteredUsers.length)}件表示` : '0件'}
              </div>
              {userTotalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button onClick={() => setUserPage(1)} disabled={userPage === 1} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: userPage === 1 ? 'not-allowed' : 'pointer', color: userPage === 1 ? '#cbd5e1' : '#374151' }}>«</button>
                  <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: userPage === 1 ? 'not-allowed' : 'pointer', color: userPage === 1 ? '#cbd5e1' : '#374151' }}>‹</button>
                  <span style={{ fontSize: '12px', color: '#374151', padding: '0 6px' }}>{userPage} / {userTotalPages}</span>
                  <button onClick={() => setUserPage(p => Math.min(userTotalPages, p + 1))} disabled={userPage === userTotalPages} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: userPage === userTotalPages ? 'not-allowed' : 'pointer', color: userPage === userTotalPages ? '#cbd5e1' : '#374151' }}>›</button>
                  <button onClick={() => setUserPage(userTotalPages)} disabled={userPage === userTotalPages} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '12px', cursor: userPage === userTotalPages ? 'not-allowed' : 'pointer', color: userPage === userTotalPages ? '#cbd5e1' : '#374151' }}>»</button>
                </div>
              )}
            </div>

            {/* ユーザー一覧 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>👤</div>
                  <div>ユーザーが登録されていません</div>
                </div>
              ) : pagedUsers.map(u => (
                <div key={u.id} style={{ background: u.active ? '#fff' : '#f8fafc', borderRadius: '10px', border: `1px solid ${u.active ? '#e2e8f0' : '#fecaca'}`, overflow: 'hidden' }}>
                  <div style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '15px', color: u.active ? '#0f172a' : '#94a3b8' }}>{u.name}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace' }}>ID: {u.id}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span style={{ background: u.role === 'admin' ? '#fef3c7' : '#eff6ff', color: u.role === 'admin' ? '#d97706' : '#2563eb', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>
                          {u.role === 'admin' ? '管理者' : '一般'}
                        </span>
                        <span style={{ background: u.active ? '#f0fdf4' : '#fef2f2', color: u.active ? '#16a34a' : '#dc2626', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>
                          {u.active ? '有効' : '無効'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button onClick={() => { setEditingUser(editingUser?.id === u.id ? null : u); setEditPw(''); setEditName(''); setEditRole(u.role); setEditActive(u.active); }}
                        style={{ padding: '6px 12px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        ✏️ 編集
                      </button>
                      {u.id !== 'admin' && (
                        <button onClick={() => handleDeleteUser(u)}
                          style={{ padding: '6px 12px', background: '#fff', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                          🗑 削除
                        </button>
                      )}
                    </div>
                  </div>
                  {editingUser?.id === u.id && (
                    <div style={{ padding: '12px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>✏️ ユーザー情報を編集</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>名前（空欄で変更なし）</label>
                          <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                            placeholder={u.name}
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>パスワード（空欄で変更なし）</label>
                          <input type="password" value={editPw} onChange={e => setEditPw(e.target.value)}
                            placeholder="新しいパスワード"
                            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>権限</label>
                          <select value={editRole} onChange={e => setEditRole(e.target.value)} disabled={u.id === 'admin'}
                            style={{ width: '100%', height: '38px', padding: '0 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fff', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath d=\'M1 1l5 5 5-5\' stroke=\'%2364748b\' stroke-width=\'1.5\' fill=\'none\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}>
                            <option value="user">一般ユーザー</option>
                            <option value="admin">管理者</option>
                          </select>
                        </div>
                        {u.id !== 'admin' && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: editActive ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', border: `1px solid ${editActive ? '#bbf7d0' : '#fecaca'}` }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: editActive ? '#16a34a' : '#dc2626' }}>
                              {editActive ? '✅ 有効' : '🚫 無効'}
                            </span>
                            <button type="button" onClick={() => setEditActive(a => !a)}
                              style={{ padding: '4px 12px', border: `1px solid ${editActive ? '#86efac' : '#fca5a5'}`, borderRadius: '6px', background: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: editActive ? '#dc2626' : '#16a34a' }}>
                              {editActive ? '無効にする' : '有効にする'}
                            </button>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={handleSaveUserEdit}
                            style={{ flex: 1, padding: '9px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>💾 保存</button>
                          <button onClick={() => { setEditingUser(null); setEditPw(''); setEditName(''); }}
                            style={{ padding: '9px 16px', background: '#e2e8f0', color: '#374151', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>✕</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {userTotalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', paddingTop: '8px' }}>
                <button onClick={() => setUserPage(1)} disabled={userPage === 1} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: userPage === 1 ? 'not-allowed' : 'pointer', color: userPage === 1 ? '#cbd5e1' : '#374151' }}>«</button>
                <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: userPage === 1 ? 'not-allowed' : 'pointer', color: userPage === 1 ? '#cbd5e1' : '#374151' }}>‹ 前へ</button>
                <span style={{ fontSize: '13px', color: '#374151', padding: '0 10px', fontWeight: 600 }}>{userPage} / {userTotalPages} ページ</span>
                <button onClick={() => setUserPage(p => Math.min(userTotalPages, p + 1))} disabled={userPage === userTotalPages} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: userPage === userTotalPages ? 'not-allowed' : 'pointer', color: userPage === userTotalPages ? '#cbd5e1' : '#374151' }}>次へ ›</button>
                <button onClick={() => setUserPage(userTotalPages)} disabled={userPage === userTotalPages} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', fontSize: '13px', cursor: userPage === userTotalPages ? 'not-allowed' : 'pointer', color: userPage === userTotalPages ? '#cbd5e1' : '#374151' }}>»</button>
              </div>
            )}
          </div>
        )}

        {/* ===== SETTINGS ===== */}
        {tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {sysMessage && (
              <div style={{ padding: '12px 14px', borderRadius: '10px', background: sysMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${sysMessage.type === 'success' ? '#86efac' : '#fecaca'}`, color: sysMessage.type === 'success' ? '#166534' : '#dc2626', fontWeight: 700, fontSize: '14px' }}>
                {sysMessage.text}
              </div>
            )}

            {/* 会社・倉庫 */}
            <div style={{ background: '#fff', borderRadius: '14px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>🏢 会社・倉庫情報</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {([
                  { key: 'company_name',   label: '会社名',  placeholder: 'InfoFarm' },
                  { key: 'warehouse_name', label: '倉庫名',  placeholder: 'メイン倉庫' },
                ] as { key: keyof SystemSettings; label: string; placeholder: string }[]).map(f => (
                  <div key={f.key}>
                    <label style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>{f.label}</label>
                    <input type="text" value={String(sysForm[f.key])} onChange={e => setSysForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
            </div>

            {/* CCコード範囲 */}
            <div style={{ background: '#fff', borderRadius: '14px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>🔷 カメレオンコード範囲</div>
              <div style={{ background: '#eff6ff', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#1e40af', marginBottom: '14px' }}>
                範囲外のCCコードをスキャンした場合はエラーで拒否されます
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, marginBottom: '8px' }}>📦 品目用 CCコード範囲</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {([
                      { key: 'item_cc_min', label: '最小値' },
                      { key: 'item_cc_max', label: '最大値' },
                    ] as { key: keyof SystemSettings; label: string }[]).map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>{f.label}</label>
                        <input type="number" min={0} max={9999999999} value={Number(sysForm[f.key])} onChange={e => setSysForm(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '15px', fontWeight: 700, boxSizing: 'border-box', textAlign: 'center' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '4px' }}>
                    現在: {sysSettings.item_cc_min} 〜 {sysSettings.item_cc_max}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, marginBottom: '8px' }}>📍 ロケーション用 CCコード範囲</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {([
                      { key: 'loc_cc_min', label: '最小値' },
                      { key: 'loc_cc_max', label: '最大値' },
                    ] as { key: keyof SystemSettings; label: string }[]).map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '3px' }}>{f.label}</label>
                        <input type="number" min={0} max={9999999999} value={Number(sysForm[f.key])} onChange={e => setSysForm(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '15px', fontWeight: 700, boxSizing: 'border-box', textAlign: 'center' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', marginTop: '4px' }}>
                    現在: {sysSettings.loc_cc_min} 〜 {sysSettings.loc_cc_max}
                  </div>
                </div>
              </div>
            </div>

            {/* アラート・収容数 */}
            <div style={{ background: '#fff', borderRadius: '14px', padding: '18px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>⚠️ アラート・収容設定</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {([
                  { key: 'stagnant_receive_days', label: '入庫後ロケ未登録アラート日数', unit: '日' },
                  { key: 'stagnant_locate_days',  label: 'ロケ後ピック未完了アラート日数', unit: '日' },
                  { key: 'loc_max_capacity',       label: 'ロケーション最大収容数（デフォルト）', unit: '件' },
                ] as { key: keyof SystemSettings; label: string; unit: string }[]).map(f => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <label style={{ fontSize: '13px', color: '#374151', flex: 1 }}>{f.label}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="number" min={1} max={9999999999} value={Number(sysForm[f.key])} onChange={e => setSysForm(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                        style={{ width: '130px', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '15px', fontWeight: 700, textAlign: 'center' }} />
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{f.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 保存ボタン */}
            <button onClick={saveSettings} disabled={sysSaving}
              style={{ padding: '14px', background: sysSaving ? '#d1d5db' : 'linear-gradient(135deg, #1e3a5f, #334155)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '15px', cursor: sysSaving ? 'not-allowed' : 'pointer' }}>
              {sysSaving ? '保存中...' : '💾 設定を保存する'}
            </button>
          </div>
        )}

      </div>

      {/* ===== CSV取込モーダル ===== */}
      {csvImportOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '660px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            {/* モーダルヘッダー */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>📥 品目マスタ CSV取込</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {csvStep === 'upload' && 'STEP 1 — CSVファイルを選択'}
                  {csvStep === 'mapping' && `STEP 2 — 項目マッピング（${csvRows.length}行検出）`}
                  {csvStep === 'confirm' && 'STEP 3 — 取込方法の確認'}
                  {csvStep === 'done' && '✅ 取込完了'}
                </div>
              </div>
              <button onClick={resetCsvImport} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>

            <div style={{ padding: '20px' }}>

              {/* STEP 1: アップロード */}
              {csvStep === 'upload' && (
                <div>
                  <div
                    onDragOver={e => { e.preventDefault(); setCsvDragOver(true); }}
                    onDragLeave={() => setCsvDragOver(false)}
                    onDrop={e => { e.preventDefault(); setCsvDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleCsvFile(f); }}
                    style={{ border: `2px dashed ${csvDragOver ? '#0ea5e9' : '#cbd5e1'}`, borderRadius: '12px', padding: '32px 20px', textAlign: 'center', background: csvDragOver ? '#f0f9ff' : '#f8fafc', transition: 'all .2s' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📄</div>
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: '4px' }}>CSVファイルをここにドラッグ＆ドロップ</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>UTF-8 / Shift-JIS対応 · 1行目はヘッダー行</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0' }}>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>または</span>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                  </div>
                  <button onClick={() => document.getElementById('csvFileInput')?.click()}
                    style={{ width: '100%', padding: '12px', background: '#fff', border: '2px solid #0ea5e9', borderRadius: '10px', color: '#0ea5e9', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    📂 ファイルを選択
                  </button>
                  <input id="csvFileInput" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }} />
                </div>
              )}

              {/* STEP 2: マッピング */}
              {csvStep === 'mapping' && (
                <div>
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#0369a1', marginBottom: '16px' }}>
                    CSVの列を品目マスタの各項目に対応させてください。前回の設定が自動的に読み込まれます。
                  </div>
                  {[
                    { field: 'barcode', label: '品目番号（必須）', required: true },
                    { field: 'name',    label: '品目名称（必須）', required: true },
                    { field: 'spec',    label: '規格',            required: false },
                    { field: 'unit',    label: '単位',            required: false },
                    { field: 'notes',   label: '備考',            required: false },
                  ].map(({ field, label, required }) => (
                    <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ width: '130px', fontSize: '13px', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                        {label}
                        {required && <span style={{ color: '#dc2626' }}> *</span>}
                      </div>
                      <select
                        value={csvMapping[field]}
                        onChange={e => setCsvMapping(m => ({ ...m, [field]: e.target.value }))}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fff' }}>
                        <option value="">── 取込しない ──</option>
                        {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                  {/* プレビュー */}
                  {csvRows.length > 0 && csvMapping.barcode && csvMapping.name && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>プレビュー（先頭3行）</div>
                      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              {['品目番号','品目名称','規格','単位','備考'].map(h => (
                                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {buildImportRows().slice(0,3).map((r,i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.barcode}</td>
                                <td style={{ padding: '6px 10px' }}>{r.name}</td>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.spec || '-'}</td>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.unit}</td>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.notes || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>有効行: {buildImportRows().length}件 / 全{csvRows.length}行</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setCsvStep('upload')} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>← 戻る</button>
                    <button onClick={() => { if (!csvMapping.barcode || !csvMapping.name) { showProductMsg('error','品目番号と品目名称のマッピングは必須です'); return; } setCsvStep('confirm'); }}
                      style={{ padding: '9px 18px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                      次へ →
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: 確認・取込実行 */}
              {csvStep === 'confirm' && (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>取込方法を選択</div>
                    {([
                      { value: 'add',     label: '追加',    desc: '新規品目のみ追加。既存品目番号はスキップします', color: '#16a34a' },
                      { value: 'update',  label: '追加+更新', desc: '新規は追加、既存品目番号は上書き更新します',  color: '#0ea5e9' },
                      { value: 'replace', label: '洗い替え', desc: '全品目を削除してからCSVデータで置き換えます',    color: '#dc2626' },
                    ] as const).map(opt => (
                      <div key={opt.value} onClick={() => setCsvImportMode(opt.value)}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: `2px solid ${csvImportMode === opt.value ? opt.color : '#e2e8f0'}`, background: csvImportMode === opt.value ? (opt.value === 'replace' ? '#fef2f2' : opt.value === 'update' ? '#f0f9ff' : '#f0fdf4') : '#fff', cursor: 'pointer', marginBottom: '8px' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${opt.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                          {csvImportMode === opt.value && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: opt.color }} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: opt.color }}>{opt.label}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{opt.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {csvImportMode === 'replace' && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#dc2626', marginBottom: '16px' }}>
                      ⚠️ 洗い替えを実行すると、現在の品目マスタデータがすべて削除されます。この操作は元に戻せません。
                    </div>
                  )}
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 700, color: '#374151', marginBottom: '6px' }}>取込内容の確認</div>
                    <div style={{ color: '#64748b' }}>有効データ数: <strong style={{ color: '#0f172a' }}>{buildImportRows().length}件</strong></div>
                    <div style={{ color: '#64748b', marginTop: '2px' }}>取込方法: <strong style={{ color: '#0f172a' }}>{{ add:'追加', update:'追加+更新', replace:'洗い替え' }[csvImportMode]}</strong></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setCsvStep('mapping')} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>← 戻る</button>
                    <button onClick={executeCsvImport} disabled={csvImporting}
                      style={{ padding: '9px 20px', background: csvImportMode === 'replace' ? '#dc2626' : '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: csvImporting ? 'not-allowed' : 'pointer', opacity: csvImporting ? 0.7 : 1, minWidth: '100px' }}>
                      {csvImporting ? '取込中...' : '✅ 取込実行'}
                    </button>
                  </div>
                </div>
              )}

              {/* 完了 */}
              {csvStep === 'done' && csvResult && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                  <div style={{ fontWeight: 700, fontSize: '18px', color: '#16a34a', marginBottom: '8px' }}>取込完了！</div>
                  <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>成功: <strong>{csvResult.success}件</strong></div>
                  {csvResult.error > 0 && <div style={{ fontSize: '13px', color: '#dc2626' }}>エラー: {csvResult.error}件（品目番号または品目名称が空の行）</div>}
                  <button onClick={resetCsvImport}
                    style={{ marginTop: '20px', padding: '10px 28px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                    閉じる
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ===== ロケーションCSV取込モーダル ===== */}
      {locCsvImportOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>📥 ロケーションマスタ CSV取込</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {locCsvStep === 'upload' && 'STEP 1 — CSVファイルを選択'}
                  {locCsvStep === 'mapping' && `STEP 2 — 項目マッピング（${locCsvRows.length}行検出）`}
                  {locCsvStep === 'confirm' && 'STEP 3 — 取込方法の確認'}
                  {locCsvStep === 'done' && '✅ 取込完了'}
                </div>
              </div>
              <button onClick={resetLocCsvImport} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            <div style={{ padding: '20px' }}>
              {locCsvStep === 'upload' && (
                <div>
                  <div
                    onDragOver={e => { e.preventDefault(); setLocCsvDragOver(true); }}
                    onDragLeave={() => setLocCsvDragOver(false)}
                    onDrop={e => { e.preventDefault(); setLocCsvDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleLocCsvFile(f); }}
                    style={{ border: `2px dashed ${locCsvDragOver ? '#0ea5e9' : '#cbd5e1'}`, borderRadius: '12px', padding: '32px 20px', textAlign: 'center', background: locCsvDragOver ? '#f0f9ff' : '#f8fafc', transition: 'all .2s' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📄</div>
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: '4px' }}>CSVファイルをここにドラッグ＆ドロップ</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>UTF-8 / Shift-JIS対応 · 1行目はヘッダー行</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0' }}>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>または</span>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                  </div>
                  <button onClick={() => document.getElementById('locCsvFileInput')?.click()}
                    style={{ width: '100%', padding: '12px', background: '#fff', border: '2px solid #0ea5e9', borderRadius: '10px', color: '#0ea5e9', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                    📂 ファイルを選択
                  </button>
                  <input id="locCsvFileInput" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleLocCsvFile(f); e.target.value = ''; }} />
                </div>
              )}
              {locCsvStep === 'mapping' && (
                <div>
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#0369a1', marginBottom: '16px' }}>
                    CSVの列をロケーションマスタの各項目に対応させてください。
                  </div>
                  {[
                    { field: 'code',    label: 'コード（必須）',  required: true },
                    { field: 'name',    label: '名称（必須）',    required: true },
                    { field: 'zone',    label: 'ゾーン',          required: false },
                    { field: 'cc_code', label: 'CCコード',        required: false },
                  ].map(({ field, label, required }) => (
                    <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ width: '140px', fontSize: '13px', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
                      </div>
                      <select value={locCsvMapping[field]} onChange={e => setLocCsvMapping(m => ({ ...m, [field]: e.target.value }))}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fff' }}>
                        <option value="">── 取込しない ──</option>
                        {locCsvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                  {locCsvRows.length > 0 && locCsvMapping.code && locCsvMapping.name && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>プレビュー（先頭3行）</div>
                      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <thead><tr style={{ background: '#f8fafc' }}>
                            {['コード','名称','ゾーン','CCコード'].map(h => (
                              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {buildLocImportRows().slice(0,3).map((r,i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.code}</td>
                                <td style={{ padding: '6px 10px' }}>{r.name}</td>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.zone || '-'}</td>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.cc_code || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>有効行: {buildLocImportRows().length}件 / 全{locCsvRows.length}行</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setLocCsvStep('upload')} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>← 戻る</button>
                    <button onClick={() => { if (!locCsvMapping.code || !locCsvMapping.name) { setLocMessage({ type: 'error', text: 'コードと名称のマッピングは必須です' }); return; } setLocCsvStep('confirm'); }}
                      style={{ padding: '9px 18px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                      次へ →
                    </button>
                  </div>
                </div>
              )}
              {locCsvStep === 'confirm' && (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>取込方法を選択</div>
                    {([
                      { value: 'add',     label: '追加',    desc: '新規ロケーションのみ追加。既存コードはスキップします', color: '#16a34a' },
                      { value: 'update',  label: '追加+更新', desc: '新規は追加、既存コードは上書き更新します',           color: '#0ea5e9' },
                      { value: 'replace', label: '洗い替え', desc: '全ロケーションを削除してからCSVデータで置き換えます', color: '#dc2626' },
                    ] as const).map(opt => (
                      <div key={opt.value} onClick={() => setLocCsvImportMode(opt.value)}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: `2px solid ${locCsvImportMode === opt.value ? opt.color : '#e2e8f0'}`, background: locCsvImportMode === opt.value ? (opt.value === 'replace' ? '#fef2f2' : opt.value === 'update' ? '#f0f9ff' : '#f0fdf4') : '#fff', cursor: 'pointer', marginBottom: '8px' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${opt.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                          {locCsvImportMode === opt.value && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: opt.color }} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: opt.color }}>{opt.label}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{opt.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {locCsvImportMode === 'replace' && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#dc2626', marginBottom: '16px' }}>
                      ⚠️ 洗い替えを実行すると、現在のロケーションマスタデータがすべて削除されます。在庫アイテムに紐付いているロケーションが失われる可能性があります。この操作は元に戻せません。
                    </div>
                  )}
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 700, color: '#374151', marginBottom: '6px' }}>取込内容の確認</div>
                    <div style={{ color: '#64748b' }}>有効データ数: <strong style={{ color: '#0f172a' }}>{buildLocImportRows().length}件</strong></div>
                    <div style={{ color: '#64748b', marginTop: '2px' }}>取込方法: <strong style={{ color: '#0f172a' }}>{{ add:'追加', update:'追加+更新', replace:'洗い替え' }[locCsvImportMode]}</strong></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setLocCsvStep('mapping')} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>← 戻る</button>
                    <button onClick={executeLocCsvImport} disabled={locCsvImporting}
                      style={{ padding: '9px 20px', background: locCsvImportMode === 'replace' ? '#dc2626' : '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: locCsvImporting ? 'not-allowed' : 'pointer', opacity: locCsvImporting ? 0.7 : 1, minWidth: '100px' }}>
                      {locCsvImporting ? '取込中...' : '✅ 取込実行'}
                    </button>
                  </div>
                </div>
              )}
              {locCsvStep === 'done' && locCsvResult && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                  <div style={{ fontWeight: 700, fontSize: '18px', color: '#16a34a', marginBottom: '8px' }}>取込完了！</div>
                  <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>追加: <strong>{locCsvResult.inserted}件</strong></div>
                  {locCsvResult.updated > 0 && <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>更新: <strong>{locCsvResult.updated}件</strong></div>}
                  {locCsvResult.skipped > 0 && <div style={{ fontSize: '13px', color: '#64748b' }}>スキップ: {locCsvResult.skipped}件</div>}
                  <button onClick={resetLocCsvImport}
                    style={{ marginTop: '20px', padding: '10px 28px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                    閉じる
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== ユーザーCSV取込モーダル ===== */}
      {userCsvImportOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>📥 ユーザーマスタ CSV取込</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {userCsvStep === 'upload' && 'STEP 1 — CSVファイルを選択'}
                  {userCsvStep === 'mapping' && `STEP 2 — 項目マッピング（${userCsvRows.length}行検出）`}
                  {userCsvStep === 'confirm' && 'STEP 3 — 取込方法の確認'}
                  {userCsvStep === 'done' && '✅ 取込完了'}
                </div>
              </div>
              <button onClick={resetUserCsvImport} style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', width: '32px', height: '32px', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
            <div style={{ padding: '20px' }}>
              {userCsvStep === 'upload' && (
                <div>
                  <div
                    onDragOver={e => { e.preventDefault(); setUserCsvDragOver(true); }}
                    onDragLeave={() => setUserCsvDragOver(false)}
                    onDrop={e => { e.preventDefault(); setUserCsvDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUserCsvFile(f); }}
                    style={{ border: `2px dashed ${userCsvDragOver ? '#0ea5e9' : '#cbd5e1'}`, borderRadius: '12px', padding: '32px 20px', textAlign: 'center', background: userCsvDragOver ? '#f0f9ff' : '#f8fafc', transition: 'all .2s' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>📄</div>
                    <div style={{ fontWeight: 600, color: '#334155', marginBottom: '4px' }}>CSVファイルをここにドラッグ＆ドロップ</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>UTF-8 / Shift-JIS対応 · 1行目はヘッダー行</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '12px 0' }}>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>または</span>
                    <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                  </div>
                  <button onClick={() => document.getElementById('userCsvFileInput')?.click()}
                    style={{ width: '100%', padding: '12px', background: '#fff', border: '2px solid #0ea5e9', borderRadius: '10px', color: '#0ea5e9', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                    📂 ファイルを選択
                  </button>
                  <input id="userCsvFileInput" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUserCsvFile(f); e.target.value = ''; }} />
                  <div style={{ marginTop: '14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#92400e' }}>
                    ⚠️ セキュリティ上、ユーザーCSV取込は「追加」と「追加+更新」のみ対応です。adminユーザーは上書き保護されます。
                  </div>
                </div>
              )}
              {userCsvStep === 'mapping' && (
                <div>
                  <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#0369a1', marginBottom: '16px' }}>
                    CSVの列をユーザーマスタの各項目に対応させてください。
                  </div>
                  {[
                    { field: 'id',       label: 'ユーザーID（必須）', required: true },
                    { field: 'name',     label: '名前（必須）',       required: true },
                    { field: 'password', label: 'パスワード',         required: false },
                    { field: 'role',     label: '権限',               required: false },
                  ].map(({ field, label, required }) => (
                    <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                      <div style={{ width: '150px', fontSize: '13px', fontWeight: 600, color: '#374151', flexShrink: 0 }}>
                        {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
                      </div>
                      <select value={userCsvMapping[field]} onChange={e => setUserCsvMapping(m => ({ ...m, [field]: e.target.value }))}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: '7px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#fff' }}>
                        <option value="">── 取込しない ──</option>
                        {userCsvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                  {userCsvRows.length > 0 && userCsvMapping.id && userCsvMapping.name && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '8px' }}>プレビュー（先頭3行）</div>
                      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                          <thead><tr style={{ background: '#f8fafc' }}>
                            {['ユーザーID','名前','権限'].map(h => (
                              <th key={h} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {buildUserImportRows().slice(0,3).map((r,i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>{r.id}</td>
                                <td style={{ padding: '6px 10px' }}>{r.name}</td>
                                <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.role || 'user'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>有効行: {buildUserImportRows().length}件 / 全{userCsvRows.length}行</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '20px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setUserCsvStep('upload')} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>← 戻る</button>
                    <button onClick={() => { if (!userCsvMapping.id || !userCsvMapping.name) { showUserMsg('error','ユーザーIDと名前のマッピングは必須です'); return; } setUserCsvStep('confirm'); }}
                      style={{ padding: '9px 18px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                      次へ →
                    </button>
                  </div>
                </div>
              )}
              {userCsvStep === 'confirm' && (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '10px' }}>取込方法を選択</div>
                    {([
                      { value: 'add',    label: '追加',    desc: '新規ユーザーのみ追加。既存ユーザーIDはスキップします', color: '#16a34a' },
                      { value: 'update', label: '追加+更新', desc: '新規は追加、既存ユーザーIDは上書き更新します（adminを除く）', color: '#0ea5e9' },
                    ] as const).map(opt => (
                      <div key={opt.value} onClick={() => setUserCsvImportMode(opt.value)}
                        style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', borderRadius: '10px', border: `2px solid ${userCsvImportMode === opt.value ? opt.color : '#e2e8f0'}`, background: userCsvImportMode === opt.value ? (opt.value === 'update' ? '#f0f9ff' : '#f0fdf4') : '#fff', cursor: 'pointer', marginBottom: '8px' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${opt.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                          {userCsvImportMode === opt.value && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: opt.color }} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: opt.color }}>{opt.label}</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{opt.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px 14px', marginBottom: '20px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 700, color: '#374151', marginBottom: '6px' }}>取込内容の確認</div>
                    <div style={{ color: '#64748b' }}>有効データ数: <strong style={{ color: '#0f172a' }}>{buildUserImportRows().length}件</strong></div>
                    <div style={{ color: '#64748b', marginTop: '2px' }}>取込方法: <strong style={{ color: '#0f172a' }}>{{ add:'追加', update:'追加+更新' }[userCsvImportMode]}</strong></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setUserCsvStep('mapping')} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>← 戻る</button>
                    <button onClick={executeUserCsvImport} disabled={userCsvImporting}
                      style={{ padding: '9px 20px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: userCsvImporting ? 'not-allowed' : 'pointer', opacity: userCsvImporting ? 0.7 : 1, minWidth: '100px' }}>
                      {userCsvImporting ? '取込中...' : '✅ 取込実行'}
                    </button>
                  </div>
                </div>
              )}
              {userCsvStep === 'done' && userCsvResult && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                  <div style={{ fontWeight: 700, fontSize: '18px', color: '#16a34a', marginBottom: '8px' }}>取込完了！</div>
                  <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>追加: <strong>{userCsvResult.inserted}件</strong></div>
                  {userCsvResult.updated > 0 && <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>更新: <strong>{userCsvResult.updated}件</strong></div>}
                  {userCsvResult.skipped > 0 && <div style={{ fontSize: '13px', color: '#64748b' }}>スキップ: {userCsvResult.skipped}件</div>}
                  <button onClick={resetUserCsvImport}
                    style={{ marginTop: '20px', padding: '10px 28px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                    閉じる
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

        {/* ===== ピッキングリスト作成 ===== */}
        {tab === 'workorders' && (
          <div>
            {woMessage && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '12px', background: woMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${woMessage.type === 'success' ? '#86efac' : '#fecaca'}`, color: woMessage.type === 'success' ? '#16a34a' : '#dc2626', fontSize: '13px' }}>
                {woMessage.text}
              </div>
            )}

            {/* ツールバー */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="text" value={woSearch} onChange={e => { setWoSearch(e.target.value); setWoPage(1); }} placeholder="指図書番号・名称で検索..."
                style={{ flex: '1 1 200px', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', outline: 'none', minWidth: 0 }} />
              <button onClick={exportWorkOrderCSV}
                style={{ padding: '10px 14px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                ⬇ CSV出力
              </button>
              <button onClick={() => setWoCsvImportOpen(true)}
                style={{ padding: '10px 14px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                📥 CSV取込
              </button>
            </div>

            {/* 一覧 */}
            {pagedWorkOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>📋</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#6b7280' }}>ピッキングリストがありません</div>
                <div style={{ fontSize: '12px', marginTop: '6px', color: '#94a3b8' }}>CSVを取込んでピッキングリストを登録してください</div>
              </div>
            ) : (
              pagedWorkOrders.map(wo => {
                const pickPct = wo.total_required > 0 ? Math.round(wo.total_picked / wo.total_required * 100) : 0;
                const shipPct = wo.total_required > 0 ? Math.round(wo.total_shipped / wo.total_required * 100) : 0;
                return (
                  <div key={wo.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px' }}>{wo.order_no}</span>
                          {wo.order_name && <span style={{ fontSize: '13px', color: '#374151' }}>{wo.order_name}</span>}
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: `${woStatusColor(wo.status)}15`, color: woStatusColor(wo.status), border: `1px solid ${woStatusColor(wo.status)}33` }}>
                            {woStatusLabel(wo.status)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '4px', fontSize: '11px', color: '#6b7280', flexWrap: 'wrap' }}>
                          {wo.planned_date && <span>📅 出庫依頼日: {wo.planned_date.slice(0, 10).replace(/-/g, '/')}</span>}
                          <span>明細: {wo.detail_count}件</span>
                          <span>出庫予定数: {wo.total_required}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button onClick={() => openWoDetail(wo)}
                          style={{ padding: '5px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#1d4ed8', fontSize: '11px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          📋 明細
                        </button>
                        <button onClick={() => handleDeleteWorkOrder(wo)}
                          style={{ padding: '5px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#dc2626', fontSize: '11px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          🗑️ 削除
                        </button>
                      </div>
                    </div>
                    {/* ピック進捗 */}
                    <div style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '3px' }}>
                        <span>🔍 ピック進捗</span>
                        <span style={{ fontWeight: 700, color: pickPct === 100 ? '#16a34a' : '#0891b2' }}>{wo.total_picked} / {wo.total_required} ({pickPct}%)</span>
                      </div>
                      <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: pickPct === 100 ? '#16a34a' : '#0891b2', borderRadius: '3px', width: `${pickPct}%`, transition: 'width .3s' }} />
                      </div>
                    </div>
                    {/* 出庫進捗 */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '3px' }}>
                        <span>🚚 出庫進捗</span>
                        <span style={{ fontWeight: 700, color: shipPct === 100 ? '#16a34a' : '#d97706' }}>{wo.total_shipped} / {wo.total_required} ({shipPct}%)</span>
                      </div>
                      <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: shipPct === 100 ? '#16a34a' : '#f59e0b', borderRadius: '3px', width: `${shipPct}%`, transition: 'width .3s' }} />
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* ページネーション */}
            {woTotalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button onClick={() => setWoPage(p => Math.max(1, p - 1))} disabled={woPage === 1}
                  style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: woPage === 1 ? '#f8fafc' : '#fff', cursor: woPage === 1 ? 'not-allowed' : 'pointer', fontSize: '12px', color: '#374151' }}>←</button>
                {Array.from({ length: Math.min(woTotalPages, 7) }, (_, i) => {
                  const p = woTotalPages <= 7 ? i + 1 : woPage <= 4 ? i + 1 : woPage >= woTotalPages - 3 ? woTotalPages - 6 + i : woPage - 3 + i;
                  return (
                    <button key={p} onClick={() => setWoPage(p)}
                      style={{ padding: '6px 10px', border: `1px solid ${woPage === p ? '#1e3a5f' : '#e2e8f0'}`, borderRadius: '6px', background: woPage === p ? '#1e3a5f' : '#fff', color: woPage === p ? '#fff' : '#374151', cursor: 'pointer', fontSize: '12px', fontWeight: woPage === p ? 700 : 400 }}>{p}</button>
                  );
                })}
                <button onClick={() => setWoPage(p => Math.min(woTotalPages, p + 1))} disabled={woPage === woTotalPages}
                  style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', background: woPage === woTotalPages ? '#f8fafc' : '#fff', cursor: woPage === woTotalPages ? 'not-allowed' : 'pointer', fontSize: '12px', color: '#374151' }}>→</button>
              </div>
            )}

            {/* 明細モーダル */}
            {woDetailOpen && woDetailWo && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                onClick={e => { if (e.target === e.currentTarget) setWoDetailOpen(false); }}>
                <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '680px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* ヘッダー */}
                  <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: '#1e3a5f' }}>{woDetailWo.order_no}</div>
                      {woDetailWo.order_name && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{woDetailWo.order_name}</div>}
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                        {woDetailWo.planned_date && <>📅 {woDetailWo.planned_date.slice(0, 10).replace(/-/g, '/')}　</>}
                        明細 {woDetailWo.detail_count}件　出庫予定数 {woDetailWo.total_required}
                      </div>
                    </div>
                    <button onClick={() => setWoDetailOpen(false)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#64748b', lineHeight: 1, padding: '0 4px' }}>×</button>
                  </div>
                  {/* 明細一覧 */}
                  <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '0' }}>
                    {woDetailLoading ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>読み込み中...</div>
                    ) : woDetailList.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>明細データがありません</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '560px' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>品目番号</th>
                            <th style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>品目名</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>規格</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>出庫予定数</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>出庫済数</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#dc2626', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>出庫残数</th>
                            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e2e8f0' }}>ロケーション</th>
                          </tr>
                        </thead>
                        <tbody>
                          {woDetailList.map((d, i) => {
                            const zansu = Math.max(0, d.required_qty - d.picked_qty);
                            return (
                            <tr key={d.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 12px', color: '#1e3a5f', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.barcode}</td>
                              <td style={{ padding: '10px 10px', color: '#374151', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.product_name || '—'}</td>
                              <td style={{ padding: '10px 8px', color: '#6b7280', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.spec || '—'}</td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', color: '#0f172a', fontWeight: 700 }}>{d.required_qty}</td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', color: d.picked_qty > 0 ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>{d.picked_qty}</td>
                              <td style={{ padding: '10px 8px', textAlign: 'center', color: zansu === 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{zansu}</td>
                              <td style={{ padding: '10px 12px' }}>
                                {d.locations && d.locations.length > 0 ? (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {d.locations.map((loc, li) => (
                                      <span key={li} style={{ display: 'inline-block', padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: '12px', fontSize: '11px', fontWeight: 600, border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
                                        📍 {loc.code}{loc.name ? ` ${loc.name}` : ''}{(loc.count ?? 1) > 1 ? ` (${loc.count}件)` : ''}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>未配置</span>
                                )}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CSV取込モーダル */}
            {woCsvImportOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
                  <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 700, fontSize: '16px' }}>📋 ピッキングリストCSV取込</div>
                    <button onClick={resetWoCsvImport} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b', lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ padding: '20px' }}>
                    {/* STEP: upload */}
                    {woCsvStep === 'upload' && (
                      <div>
                        <div style={{ marginBottom: '12px', fontSize: '13px', color: '#6b7280', background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', lineHeight: 1.6 }}>
                          <strong style={{ color: '#374151' }}>CSVフォーマット（フラット形式）:</strong><br />
                          作業指図書番号, 作業指図書名, 品目番号, 品目名称, 規格, 出庫予定数<br />
                          <span style={{ color: '#94a3b8' }}>※ 同一指図書番号の行をまとめて1件として取込みます。最大{WO_CSV_MAX}ファイル一括対応。出庫依頼日は次の画面で入力します。</span>
                        </div>
                        {/* ドロップゾーン */}
                        <div
                          onDragOver={e => { e.preventDefault(); setWoCsvDragOver(true); }}
                          onDragLeave={() => setWoCsvDragOver(false)}
                          onDrop={e => {
                            e.preventDefault(); setWoCsvDragOver(false);
                            const files = Array.from(e.dataTransfer.files);
                            if (files.length > 0) handleWoCsvFiles(files);
                          }}
                          style={{ border: `2px dashed ${woCsvDragOver ? '#0ea5e9' : '#cbd5e1'}`, borderRadius: '12px', padding: '24px 20px', textAlign: 'center', background: woCsvDragOver ? '#f0f9ff' : '#fafafa', transition: 'all .2s', marginBottom: '10px' }}>
                          <div style={{ fontSize: '32px', marginBottom: '6px' }}>📂</div>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#374151' }}>CSVをここにドロップ</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>複数ファイル同時ドロップ対応 / UTF-8・Shift-JIS</div>
                        </div>
                        {/* ファイル選択ボタン */}
                        <label style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginBottom: '12px' }}>
                          <input type="file" accept=".csv" multiple style={{ display: 'none' }}
                            onChange={e => {
                              const files = Array.from(e.target.files || []);
                              if (files.length > 0) handleWoCsvFiles(files);
                              e.target.value = '';
                            }} />
                          <div style={{ width: '100%', padding: '11px', background: woCsvFiles.length >= WO_CSV_MAX ? '#e2e8f0' : '#0ea5e9', color: woCsvFiles.length >= WO_CSV_MAX ? '#94a3b8' : '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: woCsvFiles.length >= WO_CSV_MAX ? 'not-allowed' : 'pointer', textAlign: 'center', boxSizing: 'border-box' }}>
                            📁 CSVファイルを選択（複数可）
                          </div>
                        </label>
                        {/* 追加済みファイル一覧 */}
                        {woCsvFiles.length > 0 && (
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                              追加済みファイル ({woCsvFiles.length} / {WO_CSV_MAX})
                            </div>
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                              {woCsvFiles.map((f, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: i < woCsvFiles.length - 1 ? '1px solid #f1f5f9' : 'none', background: '#fff' }}>
                                  <span style={{ fontSize: '14px', marginRight: '8px' }}>📄</span>
                                  <span style={{ flex: 1, fontSize: '12px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                  <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '8px', flexShrink: 0 }}>{f.rows.length}行</span>
                                  <button onClick={() => removeWoCsvFile(i)}
                                    style={{ marginLeft: '10px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '16px', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 次へボタン */}
                        <button
                          onClick={() => setWoCsvStep('mapping')}
                          disabled={woCsvFiles.length === 0}
                          style={{ width: '100%', padding: '12px', background: woCsvFiles.length === 0 ? '#e2e8f0' : '#1e3a5f', color: woCsvFiles.length === 0 ? '#94a3b8' : '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: woCsvFiles.length === 0 ? 'not-allowed' : 'pointer' }}>
                          次へ →
                        </button>
                      </div>
                    )}
                    {/* STEP: mapping */}
                    {woCsvStep === 'mapping' && (
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>列マッピング設定</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>CSVの列名とシステム項目の対応を設定してください。<br /><span style={{ color: '#dc2626' }}>*必須</span>: 作業指図書番号・品目番号</div>
                        {([
                          { field: 'order_no',     label: '作業指図書番号 *', req: true },
                          { field: 'order_name',   label: '作業指図書名' },
                          { field: 'barcode',      label: '品目番号 *', req: true },
                          { field: 'product_name', label: '品目名称' },
                          { field: 'spec',         label: '規格' },
                          { field: 'required_qty', label: '出庫予定数' },
                        ] as { field: string; label: string; req?: boolean }[]).map(({ field, label, req }) => (
                          <div key={field} style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: req ? '#1e3a5f' : '#374151', marginBottom: '4px' }}>{label}</div>
                            <select value={woCsvMapping[field] ?? ''} onChange={e => setWoCsvMapping(m => ({ ...m, [field]: e.target.value }))}
                              style={{ width: '100%', padding: '8px 10px', border: `1.5px solid ${req && woCsvMapping[field] === '' ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
                              <option value="">（マッピングしない）</option>
                              {woCsvHeaders.map((h, i) => (
                                <option key={i} value={String(i)}>{i + 1}: {h}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>出庫依頼日</div>
                          <input type="date" value={woCsvPlannedDate} onChange={e => setWoCsvPlannedDate(e.target.value)}
                            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', background: '#fff', color: '#111827', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', marginTop: '14px', fontSize: '12px', color: '#64748b' }}>
                          <div style={{ marginBottom: '6px', fontWeight: 600, color: '#374151' }}>マッピング確認（先頭3行プレビュー）:
                            <span style={{ marginLeft: '8px', color: '#94a3b8', fontSize: '11px', fontWeight: 400 }}>{woCsvFiles.length}ファイル / 全{woCsvFiles.reduce((s, f) => s + f.rows.length, 0)}行</span>
                          </div>
                          {/* ヘッダー名表示 */}
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ borderCollapse: 'collapse', fontSize: '11px', width: '100%' }}>
                              <thead>
                                <tr style={{ background: '#e2e8f0' }}>
                                  {(['order_no','barcode','product_name','spec','required_qty'] as const).map(f => {
                                    const idx = woCsvMapping[f] !== '' ? parseInt(woCsvMapping[f], 10) : -1;
                                    return (
                                      <th key={f} style={{ padding: '4px 6px', textAlign: 'left', color: idx >= 0 ? '#1e3a5f' : '#94a3b8', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                        {idx >= 0 ? `Col${idx+1}: ${woCsvHeaders[idx]}` : '（未設定）'}
                                      </th>
                                    );
                                  })}
                                </tr>
                                <tr style={{ background: '#f1f5f9' }}>
                                  {(['指図書番号','品目番号','品目名称','規格','数量'] as const).map(lbl => (
                                    <th key={lbl} style={{ padding: '3px 6px', textAlign: 'left', color: '#64748b', fontSize: '10px', fontWeight: 400, whiteSpace: 'nowrap' }}>→ {lbl}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {woCsvRows.slice(0, 3).map((row, ri) => {
                                  const fields = ['order_no','barcode','product_name','spec','required_qty'] as const;
                                  return (
                                    <tr key={ri} style={{ borderBottom: '1px solid #e8edf2' }}>
                                      {fields.map(f => {
                                        const idx = woCsvMapping[f] !== '' ? parseInt(woCsvMapping[f], 10) : -1;
                                        const val = idx >= 0 ? row[idx] : '';
                                        return (
                                          <td key={f} style={{ padding: '4px 6px', fontFamily: 'monospace', fontSize: '11px', color: val ? '#0f172a' : '#94a3b8', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val || '—'}</td>
                                        );
                                      })}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                          <button onClick={() => setWoCsvStep('upload')} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>← 戻る</button>
                          <button onClick={() => setWoCsvStep('confirm')}
                            disabled={woCsvMapping.order_no === '' || woCsvMapping.barcode === ''}
                            style={{ padding: '9px 20px', background: (woCsvMapping.order_no === '' || woCsvMapping.barcode === '') ? '#e2e8f0' : '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: (woCsvMapping.order_no === '' || woCsvMapping.barcode === '') ? 'not-allowed' : 'pointer' }}>
                            次へ →
                          </button>
                        </div>
                      </div>
                    )}
                    {/* STEP: confirm */}
                    {woCsvStep === 'confirm' && (() => {
                      const confirmRows = buildWoImportRows();
                      const previewRows = confirmRows.slice(0, 5);
                      const hasEmptyBarcode = previewRows.some(r => !r.barcode);
                      const hasEmptyName    = previewRows.some(r => !r.product_name);
                      return (
                      <div>
                        <div style={{ background: '#f0f9ff', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px', fontSize: '12px' }}>
                          <div style={{ fontWeight: 700, color: '#374151', marginBottom: '6px' }}>取込内容の確認</div>
                          <div style={{ color: '#64748b' }}>対象ファイル: <strong style={{ color: '#0f172a' }}>{woCsvFiles.length}件</strong></div>
                          <div style={{ color: '#64748b', marginTop: '2px' }}>有効データ数: <strong style={{ color: '#0f172a' }}>{confirmRows.length}行</strong></div>
                          <div style={{ color: '#64748b', marginTop: '2px' }}>
                            ピッキングリスト数: <strong style={{ color: '#0f172a' }}>
                              {new Set(confirmRows.map(r => r.order_no)).size}件
                            </strong>
                          </div>
                          <div style={{ color: '#94a3b8', marginTop: '4px', fontSize: '11px' }}>※ 既存の指図書番号は明細を洗い替えして更新します</div>
                        </div>
                        {/* データプレビューテーブル */}
                        {previewRows.length > 0 && (
                          <div style={{ marginBottom: '14px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
                              データプレビュー（先頭{previewRows.length}行）
                              {hasEmptyBarcode && <span style={{ marginLeft: '8px', color: '#dc2626', fontWeight: 400 }}>⚠ 品目番号が空の行があります</span>}
                            </div>
                            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                <thead>
                                  <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#374151', fontWeight: 700, whiteSpace: 'nowrap' }}>指図書番号</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#374151', fontWeight: 700, whiteSpace: 'nowrap' }}>品目番号</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#374151', fontWeight: 700, whiteSpace: 'nowrap' }}>品目名称</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#374151', fontWeight: 700, whiteSpace: 'nowrap' }}>規格</th>
                                    <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #e2e8f0', color: '#374151', fontWeight: 700, whiteSpace: 'nowrap' }}>数量</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewRows.map((r, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                      <td style={{ padding: '5px 8px', color: '#1e3a5f', whiteSpace: 'nowrap', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.order_no}</td>
                                      <td style={{ padding: '5px 8px', fontWeight: 600, color: r.barcode ? '#0f172a' : '#dc2626', whiteSpace: 'nowrap' }}>{r.barcode || '（空）'}</td>
                                      <td style={{ padding: '5px 8px', color: r.product_name ? '#374151' : '#94a3b8', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.product_name || '（品目マスターから補完）'}</td>
                                      <td style={{ padding: '5px 8px', color: r.spec ? '#374151' : '#94a3b8', whiteSpace: 'nowrap' }}>{r.spec || '—'}</td>
                                      <td style={{ padding: '5px 8px', textAlign: 'center', color: '#374151' }}>{r.required_qty}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {confirmRows.length > 5 && (
                              <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px', textAlign: 'right' }}>...他 {confirmRows.length - 5} 行</div>
                            )}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => setWoCsvStep('mapping')} style={{ padding: '9px 18px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '13px', cursor: 'pointer', color: '#374151' }}>← 戻る</button>
                          <button onClick={executeWoCsvImport} disabled={woCsvImporting}
                            style={{ padding: '9px 20px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 700, cursor: woCsvImporting ? 'not-allowed' : 'pointer', opacity: woCsvImporting ? 0.7 : 1, minWidth: '100px' }}>
                            {woCsvImporting ? '取込中...' : '✅ 取込実行'}
                          </button>
                        </div>
                      </div>
                      );
                    })()}
                    {/* STEP: done */}
                    {woCsvStep === 'done' && woCsvResult && (
                      <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                        <div style={{ fontWeight: 700, fontSize: '18px', color: '#16a34a', marginBottom: '8px' }}>取込完了！</div>
                        <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>新規作成: <strong>{woCsvResult.inserted_orders}件</strong></div>
                        {woCsvResult.updated_orders > 0 && <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>更新（洗い替え）: <strong>{woCsvResult.updated_orders}件</strong></div>}
                        <div style={{ fontSize: '14px', color: '#374151', marginBottom: '4px' }}>明細登録: <strong>{woCsvResult.inserted_details}行</strong></div>
                        <button onClick={resetWoCsvImport}
                          style={{ marginTop: '20px', padding: '10px 28px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                          閉じる
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

    </div>
  );
}
