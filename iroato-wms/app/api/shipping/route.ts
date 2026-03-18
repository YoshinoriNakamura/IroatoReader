import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// 出荷一覧取得
export async function GET() {
  try {
    const shipments = await sql`SELECT * FROM shipments ORDER BY created_at DESC`;
    return NextResponse.json({ success: true, shipments });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// 出荷登録
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipment_no, destination = '', notes = '', created_by = 'system' } = body;

    const [shipment] = await sql`
      INSERT INTO shipments (shipment_no, destination, notes, created_by, updated_by)
      VALUES (${shipment_no}, ${destination}, ${notes}, ${created_by}, ${created_by})
      RETURNING *
    `;

    return NextResponse.json({ success: true, shipment });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// 出荷ステータス更新
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, updated_by = 'system' } = body;

    const [shipment] = await sql`
      UPDATE shipments
      SET status = ${status}, updated_by = ${updated_by}, updated_at = NOW(),
          shipped_at = CASE WHEN ${status} = 'shipped' THEN NOW() ELSE shipped_at END
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json({ success: true, shipment });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
