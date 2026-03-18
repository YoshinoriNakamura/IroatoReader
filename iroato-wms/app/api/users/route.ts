import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// ユーザー一覧取得
export async function GET() {
  try {
    const users = await sql`
      SELECT id, name, role, active, created_at, updated_at
      FROM users ORDER BY created_at ASC
    `;
    return NextResponse.json({ success: true, users });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ユーザー新規作成
export async function POST(req: NextRequest) {
  try {
    const { id, name, password, role = 'user' } = await req.json();
    if (!id || !name || !password) {
      return NextResponse.json({ success: false, error: 'id・名前・パスワードは必須です' }, { status: 400 });
    }
    const [user] = await sql`
      INSERT INTO users (id, name, password, role)
      VALUES (${id}, ${name}, ${password}, ${role})
      RETURNING id, name, role, active, created_at, updated_at
    `;
    return NextResponse.json({ success: true, user });
  } catch (error) {
    const msg = String(error);
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ success: false, error: 'このユーザーIDは既に使用されています' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ユーザー更新（名前・パスワード・ロール・有効フラグ）
export async function PATCH(req: NextRequest) {
  try {
    const { id, name, password, role, active } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'idは必須です' }, { status: 400 });

    const [user] = await sql`
      UPDATE users SET
        name       = COALESCE(${name       ?? null}, name),
        password   = COALESCE(${password   ?? null}, password),
        role       = COALESCE(${role       ?? null}, role),
        active     = COALESCE(${active     ?? null}, active),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, role, active, created_at, updated_at
    `;
    if (!user) return NextResponse.json({ success: false, error: 'ユーザーが見つかりません' }, { status: 404 });
    return NextResponse.json({ success: true, user });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

// ユーザー削除（adminは削除不可）
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (id === 'admin') {
      return NextResponse.json({ success: false, error: 'adminユーザーは削除できません' }, { status: 400 });
    }
    await sql`DELETE FROM users WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
