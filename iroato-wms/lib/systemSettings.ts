export interface SystemSettings {
  company_name: string;
  warehouse_name: string;
  item_cc_min: number;
  item_cc_max: number;
  loc_cc_min: number;
  loc_cc_max: number;
  stagnant_receive_days: number;
  stagnant_locate_days: number;
  loc_max_capacity: number;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  company_name: 'InfoFarm',
  warehouse_name: 'メイン倉庫',
  item_cc_min: 1,
  item_cc_max: 89,
  loc_cc_min: 90,
  loc_cc_max: 255,
  stagnant_receive_days: 2,
  stagnant_locate_days: 5,
  loc_max_capacity: 100,
};

export async function fetchSystemSettings(): Promise<SystemSettings> {
  try {
    const res = await fetch('/api/system');
    const data = await res.json();
    if (data.success && data.settings) return { ...DEFAULT_SETTINGS, ...data.settings };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export function isItemCC(cc: string | number, s: SystemSettings): boolean {
  const n = Number(cc);
  return !isNaN(n) && n >= s.item_cc_min && n <= s.item_cc_max;
}

export function isLocCC(cc: string | number, s: SystemSettings): boolean {
  const n = Number(cc);
  return !isNaN(n) && n >= s.loc_cc_min && n <= s.loc_cc_max;
}
