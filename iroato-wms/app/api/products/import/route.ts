import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

interface ImportRow {
  barcode: string;
  name: string;
  spec?: string | null;
  unit?: string;
  notes?: string;
}

// CSV一括取込
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, rows, created_by = 'system' } = body as {
      mode: 'replace' | 'add' | 'update';
      rows: ImportRow[];
      created_by: string;
    };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: '取込データがありません' }, { status: 400 });
    }

    let successCount = 0;
    let errorCount = 0;

    // 洗い替え: 全件削除してから挿入
    if (mode === 'replace') {
      await sql`DELETE FROM products`;
    }

    for (const row of rows) {
      if (!row.barcode?.trim() || !row.name?.trim()) { errorCount++; continue; }
      const barcode = row.barcode.trim();
      const name    = row.name.trim();
      const spec    = row.spec?.trim() || null;
      const unit    = row.unit?.trim() || '個';
      const notes   = row.notes?.trim() || '';

      try {
        if (mode === 'add') {
          // 追加: 既存バーコードはスキップ
          await sql`
            INSERT INTO products (barcode, name, spec, unit, notes, created_by, updated_by)
            VALUES (${barcode}, ${name}, ${spec}, ${unit}, ${notes}, ${created_by}, ${created_by})
            ON CONFLICT (barcode) DO NOTHING
          `;
        } else {
          // 洗い替え / 更新: UPSERT
          await sql`
            INSERT INTO products (barcode, name, spec, unit, notes, created_by, updated_by)
            VALUES (${barcode}, ${name}, ${spec}, ${unit}, ${notes}, ${created_by}, ${created_by})
            ON CONFLICT (barcode) DO UPDATE SET
              name       = EXCLUDED.name,
              spec       = EXCLUDED.spec,
              unit       = EXCLUDED.unit,
              notes      = EXCLUDED.notes,
              updated_by = ${created_by},
              updated_at = NOW()
          `;
        }
        successCount++;
      } catch {
        errorCount++;
      }
    }

    return NextResponse.json({ success: true, count: successCount, errors: errorCount });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
