import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// 品目マスタ一覧取得
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get('barcode');

    if (barcode) {
      // バーコードで1件検索（入庫画面での自動入力用）
      const rows = await sql`
        SELECT * FROM products WHERE barcode = ${barcode} AND active = true LIMIT 1
      `;
      if (rows.length === 0) {
        return NextResponse.json({ success: true, product: null });
      }
      return NextResponse.json({ success: true, product: rows[0] });
    }

    const products = await sql`
      SELECT
        p.*,
        COALESCE((
          SELECT COUNT(*)::int FROM items i WHERE i.barcode = p.barcode
        ), 0) AS item_count
      FROM products p
      ORDER BY p.barcode ASC
    `;
    return NextResponse.json({ success: true, products });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// 品目マスタ登録
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { barcode, name, spec = null, unit = '個', notes = '', created_by = 'system' } = body;

    if (!barcode || !name) {
      return NextResponse.json({ success: false, error: '品目番号と品目名称は必須です' }, { status: 400 });
    }

    const [product] = await sql`
      INSERT INTO products (barcode, name, spec, unit, notes, created_by, updated_by)
      VALUES (${barcode}, ${name}, ${spec}, ${unit}, ${notes}, ${created_by}, ${created_by})
      RETURNING *
    `;
    return NextResponse.json({ success: true, product });
  } catch (error) {
    const msg = String(error);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ success: false, error: '同じ品目番号が既に登録されています' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// 品目マスタ更新
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, barcode, name, spec, unit, notes, active, updated_by = 'system' } = body;

    if (!id) return NextResponse.json({ success: false, error: 'idが必要です' }, { status: 400 });

    const [product] = await sql`
      UPDATE products
      SET
        barcode    = COALESCE(${barcode ?? null}, barcode),
        name       = COALESCE(${name ?? null}, name),
        spec       = COALESCE(${spec ?? null}, spec),
        unit       = COALESCE(${unit ?? null}, unit),
        notes      = COALESCE(${notes ?? null}, notes),
        active     = COALESCE(${active ?? null}, active),
        updated_by = ${updated_by},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json({ success: true, product });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// 品目マスタ削除
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ success: false, error: 'idが必要です' }, { status: 400 });

    await sql`DELETE FROM products WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
