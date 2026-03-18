import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// 作業指図書詳細取得（明細+在庫マッチ情報+ピッキング済み件数）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    const [order] = await sql`SELECT * FROM work_orders WHERE id = ${id}`;
    if (!order) return NextResponse.json({ success: false, error: '作業指図書が見つかりません' }, { status: 404 });

    const details = await sql`
      SELECT
        wod.*,
        COALESCE((
          SELECT COUNT(*)::int FROM items i
          WHERE i.barcode = wod.barcode AND i.status = 'located' AND i.active = true
        ), 0) AS stock_count,
        COALESCE((
          SELECT COUNT(*)::int FROM items i
          WHERE i.barcode = wod.barcode AND i.status = 'picked'
            AND (i.work_order_id = wod.work_order_id OR i.work_order_id IS NULL)
        ), 0) AS picked_item_count,
        COALESCE((
          SELECT JSON_AGG(
            JSONB_BUILD_OBJECT('code', loc_code, 'name', loc_name, 'count', cnt)
            ORDER BY loc_code
          )
          FROM (
            SELECT location_code AS loc_code, location_name AS loc_name, COUNT(*) AS cnt
            FROM items i
            WHERE i.barcode = wod.barcode AND i.status = 'located'
              AND i.active = true AND i.location_code IS NOT NULL
            GROUP BY location_code, location_name
          ) lc
        ), '[]'::json) AS locations,
        COALESCE((
          SELECT JSON_AGG(
            JSONB_BUILD_OBJECT('id', i.id, 'cc_code', i.cc_code)
            ORDER BY i.picked_at ASC, i.id ASC
          )
          FROM items i
          WHERE i.barcode = wod.barcode AND i.status = 'picked'
            AND (i.work_order_id = wod.work_order_id OR i.work_order_id IS NULL)
        ), '[]'::json) AS picked_items
      FROM work_order_details wod
      WHERE wod.work_order_id = ${id}
      ORDER BY wod.line_no ASC, wod.id ASC
    `;
    return NextResponse.json({ success: true, order, details });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// 作業指図書・明細の数量更新、ステータス更新
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    const body = await req.json();
    const { action, detail_id, qty_delta, pick_deltas, updated_by = 'system', status, ship_lines } = body;

    if (action === 'pick' && detail_id) {
      // picked_qty をインクリメント
      const delta = Number(qty_delta ?? 1);
      await sql`
        UPDATE work_order_details
        SET
          picked_qty = LEAST(picked_qty + ${delta}, required_qty),
          status     = CASE WHEN picked_qty + ${delta} >= required_qty THEN 'completed' ELSE 'in_progress' END,
          updated_at = NOW(),
          updated_by = ${updated_by}
        WHERE id = ${detail_id} AND work_order_id = ${id}
      `;
      await updateOrderStatus(id, updated_by);

    } else if (action === 'pick_batch' && Array.isArray(pick_deltas) && pick_deltas.length > 0) {
      // 複数明細を一括でpicked_qty更新: pick_deltas: [{ detail_id, qty_delta }]
      for (const pd of pick_deltas as { detail_id: number; qty_delta: number }[]) {
        const delta = Number(pd.qty_delta ?? 1);
        await sql`
          UPDATE work_order_details
          SET
            picked_qty = LEAST(picked_qty + ${delta}, required_qty),
            status     = CASE WHEN picked_qty + ${delta} >= required_qty THEN 'completed' ELSE 'in_progress' END,
            updated_at = NOW(),
            updated_by = ${updated_by}
          WHERE id = ${pd.detail_id} AND work_order_id = ${id}
        `;
      }
      await updateOrderStatus(id, updated_by);

    } else if (action === 'ship' && detail_id) {
      // 単件 shipped_qty インクリメント
      const delta = Number(qty_delta ?? 1);
      await sql`
        UPDATE work_order_details
        SET
          shipped_qty = LEAST(shipped_qty + ${delta}, required_qty),
          updated_at  = NOW(),
          updated_by  = ${updated_by}
        WHERE id = ${detail_id} AND work_order_id = ${id}
      `;
      await updateOrderStatus(id, updated_by);

    } else if (action === 'ship_confirm_all' && ship_lines) {
      // 出庫確定（一括）: picked → shipped, cc_code クリア, shipped_at セット
      const now = new Date().toISOString();
      const shippedBarcodes: string[] = [];

      for (const line of ship_lines as { detail_id: number; barcode: string; qty: number; scanned_ids?: number[] }[]) {
        if (line.qty <= 0) continue;

        let itemIds: number[];

        if (Array.isArray(line.scanned_ids) && line.scanned_ids.length > 0) {
          // CCスキャンで特定済みのアイテムIDを直接使用
          itemIds = line.scanned_ids.slice(0, line.qty);
        } else {
          // フォールバック: バーコード+statusでFIFO取得
          const toShip = await sql`
            SELECT id FROM items
            WHERE barcode = ${line.barcode}
              AND status  = 'picked'
              AND (work_order_id = ${id} OR work_order_id IS NULL)
            ORDER BY
              CASE WHEN work_order_id = ${id} THEN 0 ELSE 1 END,
              picked_at ASC, id ASC
            LIMIT ${line.qty}
          `;
          if (toShip.length === 0) continue;
          itemIds = toShip.map((r: any) => r.id);
        }

        // 出庫前にpickedステータスのアイテム数をバーコード別に集計（品目マスター更新用）
        const pickedBeforeShip = await sql`
          SELECT barcode, COUNT(*)::int AS cnt
          FROM items
          WHERE id = ANY(${itemIds}::int[]) AND status = 'picked'
          GROUP BY barcode
        `;

        // アイテム更新: shipped + CCクリア + shipped_at + work_order_id補完
        await sql`
          UPDATE items
          SET
            status        = 'shipped',
            cc_code       = NULL,
            shipped_at    = ${now},
            work_order_id = ${id},
            updated_by    = ${updated_by},
            updated_at    = NOW()
          WHERE id = ANY(${itemIds}::int[])
        `;

        // 品目マスターの出庫数・引当数を更新
        for (const row of pickedBeforeShip) {
          await sql`
            UPDATE products
            SET
              shipped_qty   = shipped_qty + ${row.cnt},
              allocated_qty = GREATEST(0, allocated_qty - ${row.cnt})
            WHERE barcode = ${row.barcode}
          `;
        }

        // 明細の shipped_qty 更新
        await sql`
          UPDATE work_order_details
          SET
            shipped_qty = LEAST(shipped_qty + ${itemIds.length}, required_qty),
            updated_at  = NOW(),
            updated_by  = ${updated_by}
          WHERE id = ${line.detail_id} AND work_order_id = ${id}
        `;

        shippedBarcodes.push(line.barcode);
      }

      await updateOrderStatus(id, updated_by);

      // 出庫後の各品目の残在庫数を返す（一部出庫済確認用）
      const remaining: Record<string, number> = {};
      for (const barcode of [...new Set(shippedBarcodes)]) {
        const [cnt] = await sql`
          SELECT COUNT(*)::int AS cnt FROM items
          WHERE barcode = ${barcode} AND status IN ('received','located','picked')
        `;
        remaining[barcode] = cnt?.cnt ?? 0;
      }

      const [order] = await sql`SELECT * FROM work_orders WHERE id = ${id}`;
      return NextResponse.json({ success: true, order, remaining });

    } else if (action === 'set_status') {
      await sql`
        UPDATE work_orders
        SET status = ${status}, updated_at = NOW(), updated_by = ${updated_by}
        WHERE id = ${id}
      `;
    } else {
      return NextResponse.json({ success: false, error: '不正なactionです' }, { status: 400 });
    }

    const [order] = await sql`SELECT * FROM work_orders WHERE id = ${id}`;
    return NextResponse.json({ success: true, order });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

async function updateOrderStatus(orderId: number, updatedBy: string) {
  const details = await sql`
    SELECT required_qty, picked_qty, shipped_qty FROM work_order_details WHERE work_order_id = ${orderId}
  `;
  if (details.length === 0) return;

  const allShipped = details.every((d: any) => Number(d.shipped_qty) >= Number(d.required_qty));
  const allPicked  = details.every((d: any) => Number(d.picked_qty)  >= Number(d.required_qty));
  const anyPicked  = details.some((d: any)  => Number(d.picked_qty)  >  0);

  const newStatus = allShipped ? 'shipped' : allPicked ? 'completed' : anyPicked ? 'in_progress' : 'open';

  await sql`
    UPDATE work_orders
    SET status = ${newStatus}, updated_at = NOW(), updated_by = ${updatedBy}
    WHERE id = ${orderId}
  `;
}
