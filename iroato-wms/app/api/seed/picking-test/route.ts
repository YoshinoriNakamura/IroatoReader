import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

const ORDER_NO = 'W00155128';

// 昨日の日付
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const YESTERDAY_DATE = yesterday.toISOString().slice(0, 10);
const YESTERDAY_TS   = `${YESTERDAY_DATE} 09:00:00+09`;

// ロケーション（循環割当）
const TEST_LOCS = [
  { code: 'ST-A1', name: '保管ゾーンA-1' },
  { code: 'ST-A2', name: '保管ゾーンA-2' },
  { code: 'ST-B1', name: '保管ゾーンB-1' },
  { code: 'ST-B2', name: '保管ゾーンB-2' },
];

export async function GET() {
  try {
    // 1. 作業指図書を取得（既存データを使用）
    const [order] = await sql`SELECT * FROM work_orders WHERE order_no = ${ORDER_NO}`;
    if (!order) {
      return NextResponse.json(
        { success: false, error: `作業指図書 ${ORDER_NO} が見つかりません。先にピッキングリスト取込でCSVを登録してください。` },
        { status: 404 }
      );
    }

    // 2. 明細を取得（実データ）
    const details = await sql`
      SELECT * FROM work_order_details
      WHERE work_order_id = ${order.id}
      ORDER BY line_no
    `;
    if (!details.length) {
      return NextResponse.json(
        { success: false, error: '明細が見つかりません' },
        { status: 404 }
      );
    }

    // 3. CCコード設定をシステム設定から取得
    let ccMin = 1;
    let ccMax = 89;
    try {
      const [sys] = await sql`SELECT item_cc_min, item_cc_max FROM system_master WHERE id = 1`;
      if (sys) {
        ccMin = Number(sys.item_cc_min);
        ccMax = Number(sys.item_cc_max);
      }
    } catch { /* system_master未整備でもデフォルト使用 */ }

    // 4. 既存テストアイテムを削除（再実行時のリセット）
    await sql`
      DELETE FROM items
      WHERE work_order_id = ${order.id} AND created_by = 'picking-test-seed'
    `;

    // 5. 削除後の使用済みCCコードを取得（重複チェック用）
    const usedCcRows = await sql`
      SELECT cc_code FROM items WHERE cc_code IS NOT NULL
    `;
    const usedCcSet = new Set(usedCcRows.map((r: Record<string, unknown>) => String(r.cc_code)));

    // 空きCCコードを順番に返す関数（ccMin〜ccMax の範囲内、使用済みはスキップ）
    let ccCursor = ccMin;
    const nextAvailableCc = (): string | null => {
      while (ccCursor <= ccMax) {
        const cc = String(ccCursor++);
        if (!usedCcSet.has(cc)) {
          usedCcSet.add(cc); // 割当済みとしてマーク
          return cc;
        }
      }
      return null; // 空きなし
    };

    // 6. アイテムを作成
    //    - required_qty >= 2 の明細は required_qty 個のアイテムを個別作成
    //    - required_qty == 1 の明細は 1 アイテム作成
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdItems: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summaryRows: any[] = [];
    let locIdx = 0;

    for (const detail of details) {
      const itemCount = Number(detail.required_qty) >= 2 ? Number(detail.required_qty) : 1;
      const loc = TEST_LOCS[locIdx % TEST_LOCS.length];
      locIdx++;

      const assignedCcs: string[] = [];

      for (let n = 0; n < itemCount; n++) {
        const cc = nextAvailableCc();
        if (cc === null) {
          return NextResponse.json(
            { success: false, error: `CCコードの空きが不足しています（範囲: ${ccMin}〜${ccMax}）` },
            { status: 409 }
          );
        }
        assignedCcs.push(cc);

        const [item] = await sql`
          INSERT INTO items (
            barcode, name, quantity, status,
            cc_code, location_code, location_name,
            received_at, work_order_id,
            created_by, updated_by, created_at, updated_at
          ) VALUES (
            ${detail.barcode}, ${detail.product_name}, 1, 'located',
            ${cc}, ${loc.code}, ${loc.name},
            ${YESTERDAY_DATE}::date, ${order.id},
            'picking-test-seed', 'picking-test-seed',
            ${YESTERDAY_TS}::timestamptz, ${YESTERDAY_TS}::timestamptz
          )
          RETURNING id, barcode, name, cc_code, location_code
        `;
        createdItems.push(item);
      }

      summaryRows.push({
        line_no:       detail.line_no,
        barcode:       detail.barcode,
        product_name:  detail.product_name,
        required_qty:  detail.required_qty,
        items_created: itemCount,
        cc_assigned:   assignedCcs.length === 1
          ? `CC: ${assignedCcs[0]}`
          : `CC: ${assignedCcs[0]}〜${assignedCcs[assignedCcs.length - 1]}`,
        location:      loc.code,
      });
    }

    return NextResponse.json({
      success:      true,
      message:      `テストデータを作成しました（入庫日: ${YESTERDAY_DATE}）`,
      order_no:     ORDER_NO,
      order_id:     order.id,
      detail_count: details.length,
      total_items:  createdItems.length,
      summary:      summaryRows,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// テストアイテム削除（作業指図書・明細は残す）
export async function DELETE() {
  try {
    const [order] = await sql`SELECT id FROM work_orders WHERE order_no = ${ORDER_NO}`;
    if (!order) {
      return NextResponse.json({ success: false, error: '作業指図書が見つかりません' }, { status: 404 });
    }
    const result = await sql`
      DELETE FROM items
      WHERE work_order_id = ${order.id} AND created_by = 'picking-test-seed'
      RETURNING id
    `;
    return NextResponse.json({
      success: true,
      message: `テストアイテムを ${result.length} 件削除しました（作業指図書・明細は保持）`,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
