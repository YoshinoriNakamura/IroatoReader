import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// flat CSV（order_noでグループ化）を作業指図書にUPSERT
// rows: [{ order_no, order_name, planned_date, barcode, product_name, spec, required_qty }, ...]
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rows, created_by = 'system' } = body as {
      rows: {
        order_no: string;
        order_name?: string;
        planned_date?: string;
        barcode: string;
        product_name?: string;
        spec?: string;
        required_qty?: string | number;
      }[];
      created_by?: string;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'データが空です' }, { status: 400 });
    }

    // order_no でグループ化
    const orderMap = new Map<string, {
      order_name: string;
      planned_date: string | null;
      details: { barcode: string; product_name: string; spec: string; required_qty: number }[];
    }>();

    for (const row of rows) {
      const orderNo = String(row.order_no ?? '').trim();
      if (!orderNo) continue;
      const barcode = String(row.barcode ?? '').trim();
      if (!barcode) continue;

      if (!orderMap.has(orderNo)) {
        orderMap.set(orderNo, {
          order_name: String(row.order_name ?? '').trim(),
          planned_date: row.planned_date ? String(row.planned_date).trim() : null,
          details: [],
        });
      }
      const entry = orderMap.get(orderNo)!;
      // 先頭行のヘッダー情報を優先（後続行でも上書きしない）
      if (!entry.order_name && row.order_name) entry.order_name = String(row.order_name).trim();
      if (!entry.planned_date && row.planned_date) entry.planned_date = String(row.planned_date).trim();

      const reqQty = Number(row.required_qty ?? 1);
      entry.details.push({
        barcode,
        product_name: String(row.product_name ?? '').trim(),
        spec: String(row.spec ?? '').trim(),
        required_qty: isNaN(reqQty) || reqQty < 1 ? 1 : reqQty,
      });
    }

    if (orderMap.size === 0) {
      return NextResponse.json({ success: false, error: '有効な行がありません（作業指図書番号と品目番号は必須）' }, { status: 400 });
    }

    // 品目名称・規格が空の明細を製品マスターから補完
    // バーコード一覧を収集してまとめてクエリ
    const allBarcodes = new Set<string>();
    for (const data of orderMap.values()) {
      for (const d of data.details) {
        if (!d.product_name || !d.spec) allBarcodes.add(d.barcode);
      }
    }
    const productCache = new Map<string, { name: string; spec: string }>();
    if (allBarcodes.size > 0) {
      const barcodeList = [...allBarcodes];
      const products = await sql`
        SELECT barcode, name, spec FROM products
        WHERE barcode = ANY(${barcodeList}::text[]) AND active = true
      `;
      for (const p of products as { barcode: string; name: string; spec: string | null }[]) {
        productCache.set(p.barcode, { name: p.name || '', spec: p.spec || '' });
      }
    }
    // 各明細に補完適用
    for (const data of orderMap.values()) {
      for (const d of data.details) {
        const master = productCache.get(d.barcode);
        if (master) {
          if (!d.product_name) d.product_name = master.name;
          if (!d.spec) d.spec = master.spec;
        }
      }
    }

    let insertedOrders = 0;
    let updatedOrders = 0;
    let insertedDetails = 0;

    for (const [orderNo, data] of orderMap.entries()) {
      // 作業指図書ヘッダーをUPSERT
      const plannedDate = data.planned_date && data.planned_date !== '' ? data.planned_date : null;
      const [row] = await sql`
        INSERT INTO work_orders (order_no, order_name, planned_date, item_count, created_by, updated_by)
        VALUES (
          ${orderNo},
          ${data.order_name},
          ${plannedDate},
          ${data.details.length},
          ${created_by},
          ${created_by}
        )
        ON CONFLICT (order_no) DO UPDATE SET
          order_name   = EXCLUDED.order_name,
          planned_date = EXCLUDED.planned_date,
          item_count   = EXCLUDED.item_count,
          updated_at   = NOW(),
          updated_by   = EXCLUDED.updated_by
        RETURNING id, (xmax = 0) AS is_insert
      `;
      const workOrderId = row.id;
      if (row.is_insert) insertedOrders++;
      else {
        updatedOrders++;
        // 既存明細を一旦削除して再挿入（洗い替え）
        await sql`DELETE FROM work_order_details WHERE work_order_id = ${workOrderId}`;
      }

      // 明細を挿入
      for (let i = 0; i < data.details.length; i++) {
        const d = data.details[i];
        await sql`
          INSERT INTO work_order_details
            (work_order_id, line_no, barcode, product_name, spec, required_qty, created_by, updated_by)
          VALUES
            (${workOrderId}, ${i + 1}, ${d.barcode}, ${d.product_name}, ${d.spec}, ${d.required_qty}, ${created_by}, ${created_by})
        `;
        insertedDetails++;
      }
    }

    return NextResponse.json({
      success: true,
      inserted_orders: insertedOrders,
      updated_orders: updatedOrders,
      inserted_details: insertedDetails,
      total_orders: orderMap.size,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
