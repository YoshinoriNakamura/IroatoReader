import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// 作業指図書一覧取得（明細集計付き）
export async function GET() {
  try {
    const orders = await sql`
      SELECT
        wo.id,
        wo.order_no,
        wo.order_name,
        wo.planned_date,
        wo.item_count,
        wo.status,
        wo.created_at,
        wo.updated_at,
        wo.created_by,
        COUNT(wod.id)                                AS detail_count,
        COALESCE(SUM(wod.required_qty), 0)           AS total_required,
        COALESCE(SUM(wod.picked_qty), 0)             AS total_picked,
        COALESCE(SUM(wod.shipped_qty), 0)            AS total_shipped
      FROM work_orders wo
      LEFT JOIN work_order_details wod ON wod.work_order_id = wo.id
      GROUP BY wo.id
      ORDER BY wo.created_at DESC
    `;
    return NextResponse.json({ success: true, orders });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// 作業指図書単票作成
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { order_no, order_name = '', planned_date = null, created_by = 'system' } = body;
    if (!order_no) {
      return NextResponse.json({ success: false, error: '作業指図書番号は必須です' }, { status: 400 });
    }
    const [order] = await sql`
      INSERT INTO work_orders (order_no, order_name, planned_date, created_by, updated_by)
      VALUES (${order_no}, ${order_name}, ${planned_date}, ${created_by}, ${created_by})
      RETURNING *
    `;
    return NextResponse.json({ success: true, order });
  } catch (error) {
    const msg = String(error);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ success: false, error: 'この作業指図書番号は既に存在します' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// 作業指図書削除（明細はCASCADE）
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'idは必須です' }, { status: 400 });
    await sql`DELETE FROM work_orders WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
