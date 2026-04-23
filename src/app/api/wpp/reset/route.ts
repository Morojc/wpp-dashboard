import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WPP = process.env.WPP_SERVER_URL ?? 'https://api.masksan.com'

export async function POST(req: NextRequest) {
  const { secretKey } = await req.json()
  if (!secretKey)
    return NextResponse.json({ error: 'secretKey is required' }, { status: 400 })

  try {
    const res = await fetch(`${WPP}/api/${encodeURIComponent(secretKey)}/reset-all`, {
      method: 'POST',
      cache: 'no-store',
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    return NextResponse.json(
      { error: `Cannot reach server: ${err?.message ?? 'network error'}` },
      { status: 502 }
    )
  }
}
