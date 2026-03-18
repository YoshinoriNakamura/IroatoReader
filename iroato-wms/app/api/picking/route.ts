import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// ピッキングリスト一覧取得
export async function GET() {
  try {
    const lists = await sql`
      SELECT pl.*, COUNT(pi.id) as total_items,
             SUM(CASE WHEN pi.picked THEN 1 ELSE 0 END) as picked_items
      FROM picking_lists pl
      LEFT JOIN picking_items pi ON pi.picking_list_id = pl.id
      GROUP BY pl.id
      ORDER BY pl.created_at DESC
    `;
    return NextResponse.json({ success: true, lists });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ピッキングリスト作成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { list_no, item_ids = [], created_by = 'system' } = body;

    const [list] = await sql`
      INSERT INTO picking_lists (list_no, created_by, updated_by)
      VALUES (${list_no}, ${created_by}, ${created_by})
      RETURNING *
    `;

    if (item_ids.length > 0) {
      for (const item_id of item_ids) {
        await sql`
          INSERT INTO picking_items (picking_list_id, item_id)
          VALUES (${list.id}, ${item_id})
        `;
      }
    }

    return NextResponse.json({ success: true, list });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
