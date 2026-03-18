import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// ロケーション一覧取得
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const all = searchParams.get('all') === 'true';
    const locations = all
      ? await sql`SELECT * FROM locations ORDER BY code`
      : await sql`SELECT * FROM locations WHERE active = true ORDER BY code`;
    return NextResponse.json({ success: true, locations });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ロケーション登録
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, name, zone = '', created_by = 'system' } = body;

    const [location] = await sql`
      INSERT INTO locations (code, name, zone, created_by, updated_by)
      VALUES (${code}, ${name}, ${zone}, ${created_by}, ${created_by})
      ON CONFLICT (code) DO UPDATE SET
        name       = ${name},
        zone       = ${zone},
        updated_at = NOW(),
        updated_by = ${created_by}
      RETURNING *
    `;

    return NextResponse.json({ success: true, location });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ロケーション更新
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, name, zone, cc_code, active, updated_by = 'system' } = body;
    if (!code) return NextResponse.json({ success: false, error: 'codeは必須です' }, { status: 400 });

    const [location] = await sql`
      UPDATE locations SET
        name       = COALESCE(${name       ?? null}, name),
        zone       = COALESCE(${zone       ?? null}, zone),
        cc_code    = COALESCE(${cc_code    ?? null}, cc_code),
        active     = COALESCE(${active     ?? null}, active),
        updated_at = NOW(),
        updated_by = ${updated_by}
      WHERE code = ${code}
      RETURNING *
    `;
    return NextResponse.json({ success: true, location });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ロケーション削除（在庫アイテムチェック付き物理削除）
export async function DELETE(req: NextRequest) {
  try {
    const { code } = await req.json();
    if (!code) return NextResponse.json({ success: false, error: 'codeは必須です' }, { status: 400 });

    // 出荷済以外のアイテムが存在する場合は削除不可
    const [check] = await sql`
      SELECT COUNT(*) AS cnt FROM items
      WHERE location_code = ${code} AND status NOT IN ('shipped')
    `;
    const cnt = Number(check.cnt);
    if (cnt > 0) {
      return NextResponse.json({
        success: false,
        error: `このロケーションには現在 ${cnt} 件のアイテムが在庫されています。先にアイテムを移動または出荷してから削除してください。`,
        blocking_count: cnt,
      }, { status: 409 });
    }

    await sql`DELETE FROM locations WHERE code = ${code}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
