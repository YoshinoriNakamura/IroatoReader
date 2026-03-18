import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

interface ImportRow {
  code: string;
  name: string;
  zone?: string;
  cc_code?: string;
}

// ロケーションCSV一括取込
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, rows, created_by = 'system' } = body as {
      mode: 'replace' | 'add' | 'update';
      rows: ImportRow[];
      created_by?: string;
    };

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: '取込データがありません' }, { status: 400 });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    if (mode === 'replace') {
      // 洗い替え: 全削除してから挿入
      await sql`DELETE FROM locations`;
      for (const row of rows) {
        if (!row.code || !row.name) { skipped++; continue; }
        await sql`
          INSERT INTO locations (code, name, zone, cc_code, created_by, updated_by)
          VALUES (
            ${row.code},
            ${row.name},
            ${row.zone ?? ''},
            ${row.cc_code ?? null},
            ${created_by},
            ${created_by}
          )
        `;
        inserted++;
      }
    } else if (mode === 'add') {
      // 追加のみ: 既存コードはスキップ
      for (const row of rows) {
        if (!row.code || !row.name) { skipped++; continue; }
        const result = await sql`
          INSERT INTO locations (code, name, zone, cc_code, created_by, updated_by)
          VALUES (
            ${row.code},
            ${row.name},
            ${row.zone ?? ''},
            ${row.cc_code ?? null},
            ${created_by},
            ${created_by}
          )
          ON CONFLICT (code) DO NOTHING
          RETURNING code
        `;
        if (result.length > 0) inserted++; else skipped++;
      }
    } else if (mode === 'update') {
      // 追加+更新: UPSERT
      for (const row of rows) {
        if (!row.code || !row.name) { skipped++; continue; }
        const result = await sql`
          INSERT INTO locations (code, name, zone, cc_code, created_by, updated_by)
          VALUES (
            ${row.code},
            ${row.name},
            ${row.zone ?? ''},
            ${row.cc_code ?? null},
            ${created_by},
            ${created_by}
          )
          ON CONFLICT (code) DO UPDATE SET
            name       = EXCLUDED.name,
            zone       = EXCLUDED.zone,
            cc_code    = EXCLUDED.cc_code,
            updated_at = NOW(),
            updated_by = ${created_by}
          RETURNING code, (xmax = 0) AS is_insert
        `;
        if (result.length > 0) {
          if (result[0].is_insert) inserted++; else updated++;
        }
      }
    } else {
      return NextResponse.json({ success: false, error: '不正なmodeです' }, { status: 400 });
    }

    return NextResponse.json({ success: true, inserted, updated, skipped });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
