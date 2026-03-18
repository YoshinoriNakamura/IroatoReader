import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// 商品一覧取得
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status      = searchParams.get('status');
    const all         = searchParams.get('all') === 'true';
    const workOrderId = searchParams.get('work_order_id');
    const ccCode      = searchParams.get('cc_code');

    let items;
    if (ccCode && status) {
      // CCコード + ステータスで特定アイテムを検索（出庫スキャン照合用）
      items = await sql`SELECT * FROM items WHERE cc_code = ${ccCode} AND status = ${status} ORDER BY picked_at ASC, id ASC LIMIT 1`;
    } else if (ccCode) {
      items = await sql`SELECT * FROM items WHERE cc_code = ${ccCode} ORDER BY updated_at DESC LIMIT 1`;
    } else if (status && workOrderId) {
      items = await sql`SELECT * FROM items WHERE status = ${status} AND work_order_id = ${Number(workOrderId)} ORDER BY created_at DESC`;
    } else if (status) {
      items = await sql`SELECT * FROM items WHERE status = ${status} ORDER BY created_at DESC`;
    } else if (all) {
      items = await sql`SELECT * FROM items ORDER BY created_at DESC`;
    } else {
      items = await sql`SELECT * FROM items WHERE active = true ORDER BY created_at DESC`;
    }

    return NextResponse.json({ success: true, items });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// 商品登録（入庫）
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { barcode, cc_code = null, name, quantity = 1, notes = '', created_by = 'system' } = body;

    // まず全カラムありで試みる（マイグレーション済みDB用）
    try {
      const [item] = await sql`
        INSERT INTO items (barcode, cc_code, name, quantity, notes, received_at, created_by, updated_by)
        VALUES (${barcode}, ${cc_code}, ${name}, ${quantity}, ${notes}, NOW(), ${created_by}, ${created_by})
        RETURNING *
      `;
      return NextResponse.json({ success: true, item });
    } catch {
      // cc_code / received_at カラムが存在しない場合はフォールバック
      const [item] = await sql`
        INSERT INTO items (barcode, name, quantity, notes, created_by, updated_by)
        VALUES (${barcode}, ${name}, ${quantity}, ${notes}, ${created_by}, ${created_by})
        RETURNING *
      `;
      return NextResponse.json({ success: true, item });
    }
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// アイテム削除（picking_itemsに紐づきがない場合のみ物理削除）
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ success: false, error: 'idが必要です' }, { status: 400 });

    // picking_items に紐づきがあるか確認
    const [ref] = await sql`SELECT id FROM picking_items WHERE item_id = ${id} LIMIT 1`;
    if (ref) {
      return NextResponse.json({ success: false, error: 'ピッキング履歴があるため削除できません' }, { status: 409 });
    }

    const [deleted] = await sql`DELETE FROM items WHERE id = ${id} RETURNING id`;
    if (!deleted) return NextResponse.json({ success: false, error: 'アイテムが見つかりません' }, { status: 404 });

    return NextResponse.json({ success: true, id: deleted.id });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// 商品更新（ステータス・ロケーション変更・ピック完了・有効無効など）
// 単件: { id, status, ... } / バッチ: { ids: number[], status, ... }
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ids, cc_code, status, location_code, location_cc_code, location_name, picked_at, active, work_order_id, updated_by = 'system' } = body;

    // バッチ更新: ids配列が指定されている場合
    if (Array.isArray(ids) && ids.length > 0) {
      // ステータス変更前に品目マスターの引当数・出庫数を更新（picked/shipped 遷移のみ）
      if (status === 'picked' || status === 'shipped') {
        // 現在のステータスが変わる件数をバーコード別に集計
        const prevItems = await sql`
          SELECT barcode, COUNT(*)::int AS cnt
          FROM items
          WHERE id = ANY(${ids}::int[]) AND status != ${status}
          GROUP BY barcode
        `;
        for (const row of prevItems) {
          if (status === 'picked') {
            // ピッキング完了 → 引当数+
            await sql`
              UPDATE products SET allocated_qty = allocated_qty + ${row.cnt}
              WHERE barcode = ${row.barcode}
            `;
          } else if (status === 'shipped') {
            // 出庫処理 → 出庫数+、引当数-（既にpicked状態のものだけ引当数を減算）
            const pickedCount = await sql`
              SELECT COUNT(*)::int AS cnt FROM items
              WHERE id = ANY(${ids}::int[]) AND barcode = ${row.barcode} AND status = 'picked'
            `;
            const pickedCnt = pickedCount[0]?.cnt ?? 0;
            await sql`
              UPDATE products
              SET
                shipped_qty   = shipped_qty + ${row.cnt},
                allocated_qty = GREATEST(0, allocated_qty - ${pickedCnt})
              WHERE barcode = ${row.barcode}
            `;
          }
        }
      }
      await sql`
        UPDATE items
        SET
          status           = COALESCE(${status ?? null}, status),
          location_code    = COALESCE(${location_code ?? null}, location_code),
          location_cc_code = COALESCE(${location_cc_code ?? null}, location_cc_code),
          location_name    = COALESCE(${location_name ?? null}, location_name),
          cc_code          = COALESCE(${cc_code ?? null}, cc_code),
          picked_at        = COALESCE(${picked_at ?? null}, picked_at),
          active           = COALESCE(${active ?? null}, active),
          work_order_id    = CASE WHEN ${work_order_id ?? null} IS NOT NULL THEN ${work_order_id ?? null} ELSE work_order_id END,
          updated_by       = ${updated_by},
          updated_at       = NOW()
        WHERE id = ANY(${ids}::int[])
      `;
      return NextResponse.json({ success: true, updated: ids.length });
    }

    // 単件更新（picked/shipped 遷移時に品目マスターも更新）
    if (status === 'picked' || status === 'shipped') {
      const [current] = await sql`SELECT barcode, status FROM items WHERE id = ${id}`;
      if (current && current.status !== status) {
        if (status === 'picked') {
          await sql`UPDATE products SET allocated_qty = allocated_qty + 1 WHERE barcode = ${current.barcode}`;
        } else if (status === 'shipped') {
          const fromPicked = current.status === 'picked' ? 1 : 0;
          await sql`
            UPDATE products
            SET
              shipped_qty   = shipped_qty + 1,
              allocated_qty = GREATEST(0, allocated_qty - ${fromPicked})
            WHERE barcode = ${current.barcode}
          `;
        }
      }
    }
    const [item] = await sql`
      UPDATE items
      SET
        status             = COALESCE(${status ?? null}, status),
        location_code      = COALESCE(${location_code ?? null}, location_code),
        location_cc_code   = COALESCE(${location_cc_code ?? null}, location_cc_code),
        location_name      = COALESCE(${location_name ?? null}, location_name),
        cc_code            = COALESCE(${cc_code ?? null}, cc_code),
        picked_at          = COALESCE(${picked_at ?? null}, picked_at),
        active             = COALESCE(${active ?? null}, active),
        work_order_id      = CASE WHEN ${work_order_id ?? null} IS NOT NULL THEN ${work_order_id ?? null} ELSE work_order_id END,
        updated_by         = ${updated_by},
        updated_at         = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    return NextResponse.json({ success: true, item });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
