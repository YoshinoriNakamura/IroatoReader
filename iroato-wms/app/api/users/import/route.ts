import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

interface ImportRow {
  id: string;
  name: string;
  password?: string;
  role?: string;
}

// ユーザーCSV一括取込（add / update のみ。replaceは安全上サポートしない）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, rows, created_by = 'system' } = body as {
      mode: 'add' | 'update';
      rows: ImportRow[];
      created_by?: string;
    };

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: '取込データがありません' }, { status: 400 });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    if (mode === 'add') {
      // 追加のみ: 既存IDはスキップ
      for (const row of rows) {
        if (!row.id || !row.name) { skipped++; continue; }
        const result = await sql`
          INSERT INTO users (id, name, password, role, created_by, updated_by)
          VALUES (
            ${row.id},
            ${row.name},
            ${row.password ?? 'changeme'},
            ${row.role ?? 'user'},
            ${created_by},
            ${created_by}
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id
        `;
        if (result.length > 0) inserted++; else skipped++;
      }
    } else if (mode === 'update') {
      // 追加+更新: UPSERT（adminは上書き不可）
      for (const row of rows) {
        if (!row.id || !row.name) { skipped++; continue; }
        if (row.id === 'admin') { skipped++; continue; }
        const result = await sql`
          INSERT INTO users (id, name, password, role, created_by, updated_by)
          VALUES (
            ${row.id},
            ${row.name},
            ${row.password ?? 'changeme'},
            ${row.role ?? 'user'},
            ${created_by},
            ${created_by}
          )
          ON CONFLICT (id) DO UPDATE SET
            name       = EXCLUDED.name,
            password   = CASE WHEN EXCLUDED.password IS NOT NULL AND EXCLUDED.password <> '' THEN EXCLUDED.password ELSE users.password END,
            role       = EXCLUDED.role,
            updated_at = NOW(),
            updated_by = ${created_by}
          RETURNING id, (xmax = 0) AS is_insert
        `;
        if (result.length > 0) {
          if (result[0].is_insert) inserted++; else updated++;
        }
      }
    } else {
      return NextResponse.json({ success: false, error: '不正なmodeです（add または update のみ対応）' }, { status: 400 });
    }

    return NextResponse.json({ success: true, inserted, updated, skipped });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
