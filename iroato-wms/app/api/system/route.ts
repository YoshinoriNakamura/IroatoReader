import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// システムマスタ取得
export async function GET() {
  try {
    const [row] = await sql`SELECT * FROM system_master WHERE id = 1`;
    return NextResponse.json({ success: true, settings: row ?? null });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// システムマスタ更新
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      company_name,
      warehouse_name,
      item_cc_min,
      item_cc_max,
      loc_cc_min,
      loc_cc_max,
      stagnant_receive_days,
      stagnant_locate_days,
      loc_max_capacity,
      csv_product_mapping,
      wo_csv_mapping,
    } = body;

    const [row] = await sql`
      UPDATE system_master SET
        company_name          = COALESCE(${company_name          ?? null}, company_name),
        warehouse_name        = COALESCE(${warehouse_name        ?? null}, warehouse_name),
        item_cc_min           = COALESCE(${item_cc_min           ?? null}, item_cc_min),
        item_cc_max           = COALESCE(${item_cc_max           ?? null}, item_cc_max),
        loc_cc_min            = COALESCE(${loc_cc_min            ?? null}, loc_cc_min),
        loc_cc_max            = COALESCE(${loc_cc_max            ?? null}, loc_cc_max),
        stagnant_receive_days = COALESCE(${stagnant_receive_days ?? null}, stagnant_receive_days),
        stagnant_locate_days  = COALESCE(${stagnant_locate_days  ?? null}, stagnant_locate_days),
        loc_max_capacity      = COALESCE(${loc_max_capacity      ?? null}, loc_max_capacity),
        csv_product_mapping   = COALESCE(${csv_product_mapping   != null ? JSON.stringify(csv_product_mapping) : null}::jsonb, csv_product_mapping),
        wo_csv_mapping        = COALESCE(${wo_csv_mapping        != null ? JSON.stringify(wo_csv_mapping)        : null}::jsonb, wo_csv_mapping),
        updated_at            = NOW()
      WHERE id = 1
      RETURNING *
    `;

    return NextResponse.json({ success: true, settings: row });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
