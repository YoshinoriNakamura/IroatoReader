import { sql } from '@/lib/db';
import { NextResponse } from 'next/server';

const SAMPLE_LOCATIONS = [
  { code: 'IN-01',  name: '受入ドック',    zone: '入荷', cc_code: '90' },
  { code: 'ST-A1',  name: '保管ゾーンA-1', zone: 'A',    cc_code: '91' },
  { code: 'ST-A2',  name: '保管ゾーンA-2', zone: 'A',    cc_code: '92' },
  { code: 'ST-B1',  name: '保管ゾーンB-1', zone: 'B',    cc_code: '93' },
  { code: 'ST-B2',  name: '保管ゾーンB-2', zone: 'B',    cc_code: '94' },
  { code: 'OUT-01', name: '出荷ドック',     zone: '出荷', cc_code: '95' },
];

export async function GET() {
  try {
    const results = [];

    for (const loc of SAMPLE_LOCATIONS) {
      const [row] = await sql`
        INSERT INTO locations (code, name, zone, cc_code)
        VALUES (${loc.code}, ${loc.name}, ${loc.zone}, ${loc.cc_code})
        ON CONFLICT (code) DO UPDATE
          SET name     = ${loc.name},
              zone     = ${loc.zone},
              cc_code  = ${loc.cc_code},
              updated_at = NOW()
        RETURNING *
      `;
      results.push(row);
    }

    return NextResponse.json({
      success: true,
      message: `サンプルロケーション ${results.length} 件を登録しました`,
      locations: results,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
