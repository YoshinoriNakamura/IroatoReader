import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // ユーザーテーブル
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        password    TEXT NOT NULL,
        role        TEXT NOT NULL DEFAULT 'user',
        active      BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by  TEXT NOT NULL DEFAULT 'system',
        updated_by  TEXT NOT NULL DEFAULT 'system'
      )
    `;

    // デフォルト管理者を挿入（存在しない場合のみ）
    await sql`
      INSERT INTO users (id, name, password, role)
      VALUES ('admin', '管理者', 'admin1234', 'admin')
      ON CONFLICT (id) DO NOTHING
    `;

    // 商品（在庫）テーブル（新規作成時は全カラム含む）
    await sql`
      CREATE TABLE IF NOT EXISTS items (
        id               SERIAL PRIMARY KEY,
        barcode          TEXT NOT NULL,
        name             TEXT NOT NULL,
        quantity         INTEGER NOT NULL DEFAULT 1,
        status           TEXT NOT NULL DEFAULT 'received',
        location_code    TEXT,
        location_cc_code TEXT,
        location_name    TEXT,
        cc_code          TEXT,
        received_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        received_at      TIMESTAMPTZ DEFAULT NOW(),
        picked_at        TIMESTAMPTZ,
        notes            TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by       TEXT NOT NULL DEFAULT 'system',
        updated_by       TEXT NOT NULL DEFAULT 'system'
      )
    `;

    // ロケーションテーブル
    await sql`
      CREATE TABLE IF NOT EXISTS locations (
        code        TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        zone        TEXT,
        capacity    INTEGER DEFAULT 100,
        active      BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by  TEXT NOT NULL DEFAULT 'system',
        updated_by  TEXT NOT NULL DEFAULT 'system'
      )
    `;

    // ピッキングリストテーブル
    await sql`
      CREATE TABLE IF NOT EXISTS picking_lists (
        id          SERIAL PRIMARY KEY,
        list_no     TEXT NOT NULL UNIQUE,
        status      TEXT NOT NULL DEFAULT 'open',
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by  TEXT NOT NULL DEFAULT 'system',
        updated_by  TEXT NOT NULL DEFAULT 'system'
      )
    `;

    // ピッキング明細テーブル
    await sql`
      CREATE TABLE IF NOT EXISTS picking_items (
        id              SERIAL PRIMARY KEY,
        picking_list_id INTEGER NOT NULL REFERENCES picking_lists(id),
        item_id         INTEGER NOT NULL REFERENCES items(id),
        quantity        INTEGER NOT NULL DEFAULT 1,
        picked          BOOLEAN NOT NULL DEFAULT false,
        picked_at       TIMESTAMPTZ,
        picked_by       TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by      TEXT NOT NULL DEFAULT 'system',
        updated_by      TEXT NOT NULL DEFAULT 'system'
      )
    `;

    // 出荷テーブル
    await sql`
      CREATE TABLE IF NOT EXISTS shipments (
        id              SERIAL PRIMARY KEY,
        shipment_no     TEXT NOT NULL UNIQUE,
        status          TEXT NOT NULL DEFAULT 'pending',
        destination     TEXT,
        shipped_at      TIMESTAMPTZ,
        notes           TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by      TEXT NOT NULL DEFAULT 'system',
        updated_by      TEXT NOT NULL DEFAULT 'system'
      )
    `;

    // システムマスタテーブル（1レコードのみ保持する設定テーブル）
    await sql`
      CREATE TABLE IF NOT EXISTS system_master (
        id                      INTEGER  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        company_name            TEXT     NOT NULL DEFAULT 'InfoFarm',
        warehouse_name          TEXT     NOT NULL DEFAULT 'メイン倉庫',
        item_cc_min             BIGINT   NOT NULL DEFAULT 1,
        item_cc_max             BIGINT   NOT NULL DEFAULT 89,
        loc_cc_min              BIGINT   NOT NULL DEFAULT 90,
        loc_cc_max              BIGINT   NOT NULL DEFAULT 255,
        stagnant_receive_days   BIGINT   NOT NULL DEFAULT 2,
        stagnant_locate_days    BIGINT   NOT NULL DEFAULT 5,
        loc_max_capacity        BIGINT   NOT NULL DEFAULT 100,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by              TEXT     NOT NULL DEFAULT 'system',
        updated_by              TEXT     NOT NULL DEFAULT 'system',
        csv_product_mapping     JSONB
      )
    `;
    // 既存テーブルのカラム型をBIGINTへ変更（既にINTEGERで作成済みの場合）
    await sql`ALTER TABLE system_master ALTER COLUMN item_cc_min           TYPE BIGINT`;
    await sql`ALTER TABLE system_master ALTER COLUMN item_cc_max           TYPE BIGINT`;
    await sql`ALTER TABLE system_master ALTER COLUMN loc_cc_min            TYPE BIGINT`;
    await sql`ALTER TABLE system_master ALTER COLUMN loc_cc_max            TYPE BIGINT`;
    await sql`ALTER TABLE system_master ALTER COLUMN stagnant_receive_days TYPE BIGINT`;
    await sql`ALTER TABLE system_master ALTER COLUMN stagnant_locate_days  TYPE BIGINT`;
    await sql`ALTER TABLE system_master ALTER COLUMN loc_max_capacity      TYPE BIGINT`;

    // デフォルトレコード挿入（存在しない場合のみ）
    await sql`
      INSERT INTO system_master (id) VALUES (1)
      ON CONFLICT (id) DO NOTHING
    `;

    // 品目マスタテーブル
    await sql`
      CREATE TABLE IF NOT EXISTS products (
        id          SERIAL PRIMARY KEY,
        barcode     TEXT NOT NULL UNIQUE,
        cc_code     TEXT,
        name        TEXT NOT NULL,
        spec        TEXT,
        unit        TEXT NOT NULL DEFAULT '個',
        notes       TEXT,
        active      BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by  TEXT NOT NULL DEFAULT 'system',
        updated_by  TEXT NOT NULL DEFAULT 'system'
      )
    `;
    // spec カラム追加（既存DBへのマイグレーション）
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS spec TEXT`;

    // 追加カラム（既存DBへのマイグレーション）
    await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS cc_code TEXT`;
    await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS location_cc_code TEXT`;
    await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS location_name TEXT`;
    await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ DEFAULT NOW()`;
    await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS picked_at TIMESTAMPTZ`;
    await sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS cc_code TEXT`;

    // 登録日時・変更日時・登録者・変更者（既存DBへのマイグレーション）
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'system'`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT 'system'`;
    await sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'system'`;
    await sql`ALTER TABLE locations ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT 'system'`;
    await sql`ALTER TABLE picking_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
    await sql`ALTER TABLE picking_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
    await sql`ALTER TABLE picking_items ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'system'`;
    await sql`ALTER TABLE picking_items ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT 'system'`;
    await sql`ALTER TABLE system_master ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'system'`;
    await sql`ALTER TABLE system_master ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT 'system'`;
    await sql`ALTER TABLE system_master ADD COLUMN IF NOT EXISTS csv_product_mapping JSONB`;
    await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true`;

    // 作業指図書（ピッキングリスト）テーブル
    await sql`
      CREATE TABLE IF NOT EXISTS work_orders (
        id           SERIAL PRIMARY KEY,
        order_no     TEXT NOT NULL UNIQUE,
        order_name   TEXT NOT NULL DEFAULT '',
        planned_date DATE,
        item_count   INT NOT NULL DEFAULT 0,
        status       TEXT NOT NULL DEFAULT 'open',
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by   TEXT NOT NULL DEFAULT 'system',
        updated_by   TEXT NOT NULL DEFAULT 'system'
      )
    `;

    // 作業指図書明細テーブル
    await sql`
      CREATE TABLE IF NOT EXISTS work_order_details (
        id              SERIAL PRIMARY KEY,
        work_order_id   INT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
        line_no         INT NOT NULL DEFAULT 0,
        barcode         TEXT NOT NULL,
        product_name    TEXT NOT NULL DEFAULT '',
        spec            TEXT NOT NULL DEFAULT '',
        required_qty    INT NOT NULL DEFAULT 1,
        picked_qty      INT NOT NULL DEFAULT 0,
        shipped_qty     INT NOT NULL DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'open',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by      TEXT NOT NULL DEFAULT 'system',
        updated_by      TEXT NOT NULL DEFAULT 'system'
      )
    `;

    // items テーブルに work_order_id カラム追加
    await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS work_order_id INT REFERENCES work_orders(id) ON DELETE SET NULL`;

    // system_master に wo_csv_mapping カラム追加
    await sql`ALTER TABLE system_master ADD COLUMN IF NOT EXISTS wo_csv_mapping JSONB`;

    // items に shipped_at カラム追加（出庫処理用）
    await sql`ALTER TABLE items ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ`;

    // products に引当数・出庫数カラム追加
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS allocated_qty INT NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS shipped_qty   INT NOT NULL DEFAULT 0`;

    // 既存データから引当数・出庫数を初期化
    await sql`
      UPDATE products p
      SET
        allocated_qty = COALESCE((
          SELECT COUNT(*)::int FROM items i WHERE i.barcode = p.barcode AND i.status = 'picked'
        ), 0),
        shipped_qty   = COALESCE((
          SELECT COUNT(*)::int FROM items i WHERE i.barcode = p.barcode AND i.status = 'shipped'
        ), 0)
    `;

    // 既存のpicked/shippedアイテムで work_order_id が NULL のものを補完
    // work_order_details の barcode で一致する作業指図書を紐付ける（1件のみ存在する場合）
    await sql`
      UPDATE items i
      SET work_order_id = subq.wo_id
      FROM (
        SELECT i2.id AS item_id, MAX(wod.work_order_id) AS wo_id
        FROM items i2
        JOIN work_order_details wod ON wod.barcode = i2.barcode
        WHERE i2.status IN ('picked', 'shipped')
          AND i2.work_order_id IS NULL
        GROUP BY i2.id
        HAVING COUNT(DISTINCT wod.work_order_id) = 1
      ) subq
      WHERE i.id = subq.item_id
    `;

    return NextResponse.json({ success: true, message: 'テーブル作成完了' });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
