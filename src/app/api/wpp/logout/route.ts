import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WPP = process.env.WPP_SERVER_URL ?? 'https://api.masksan.com'

export async function POST(req: NextRequest) {
  const { session, token } = await req.json()
  if (!session || !token)
    return NextResponse.json({ error: 'session and token are required' }, { status: 400 })

  try {
    const res = await fetch(`${WPP}/api/${encodeURIComponent(session)}/logout-session`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
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
