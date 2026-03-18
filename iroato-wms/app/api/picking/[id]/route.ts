import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// ピッキングリスト詳細取得
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const items = await sql`
      SELECT pi.id, pi.item_id, pi.picked, pi.picked_at, pi.picked_by,
             i.barcode, i.name, i.quantity, i.location_code
      FROM picking_items pi
      JOIN items i ON i.id = pi.item_id
      WHERE pi.picking_list_id = ${id}
      ORDER BY i.location_code, i.name
    `;
    return NextResponse.json({ success: true, items });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ピッキング完了（1件）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { picking_item_id, picked_by = 'system' } = body;

    await sql`
      UPDATE picking_items
      SET picked = true, picked_at = NOW(), picked_by = ${picked_by}
      WHERE id = ${picking_item_id} AND picking_list_id = ${id}
    `;

    // 全件ピック済みなら picking_list を completed に
    const [count] = await sql`
      SELECT COUNT(*) as total, SUM(CASE WHEN picked THEN 1 ELSE 0 END) as done
      FROM picking_items WHERE picking_list_id = ${id}
    `;
    if (Number(count.total) > 0 && Number(count.total) === Number(count.done)) {
      await sql`UPDATE picking_lists SET status = 'completed', updated_at = NOW() WHERE id = ${id}`;
    } else {
      await sql`UPDATE picking_lists SET status = 'in_progress', updated_at = NOW() WHERE id = ${id}`;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
