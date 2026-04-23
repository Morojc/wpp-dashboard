import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WPP = process.env.WPP_SERVER_URL ?? 'https://api.masksan.com'

export async function POST(req: NextRequest) {
  const { token, session, webhookUrl, proxy } = await req.json()

  if (!token || !session || !webhookUrl)
    return NextResponse.json({ error: 'token, session and webhookUrl are required' }, { status: 400 })

  const body: Record<string, any> = { webhook: webhookUrl, waitQrCode: false }
  if (proxy?.url) body.proxy = proxy

  try {
    const res = await fetch(`${WPP}/api/${encodeURIComponent(session)}/start-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
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
