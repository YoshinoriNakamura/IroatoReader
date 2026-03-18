import { sql } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { userId, password } = await req.json();
    if (!userId || !password) {
      return NextResponse.json({ success: false, message: 'IDとパスワードを入力してください' }, { status: 400 });
    }
    const [user] = await sql`
      SELECT id, name, password, role, active FROM users WHERE id = ${userId}
    `;
    if (!user)        return NextResponse.json({ success: false, message: 'ユーザーが見つかりません' });
    if (!user.active) return NextResponse.json({ success: false, message: 'このアカウントは無効です' });
    if (user.password !== password) return NextResponse.json({ success: false, message: 'パスワードが違います' });

    return NextResponse.json({
      success: true,
      session: { userId: user.id, userName: user.name, role: user.role, loginAt: Date.now() },
    });
  } catch (error) {
    // DBエラー時はlocalStorageフォールバック用にエラーを返す
    return NextResponse.json({ success: false, message: String(error), dbError: true }, { status: 500 });
  }
}
