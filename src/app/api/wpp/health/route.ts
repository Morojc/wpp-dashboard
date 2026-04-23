import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const WPP = process.env.WPP_SERVER_URL ?? 'https://api.masksan.com'

export async function GET() {
  try {
    const res = await fetch(`${WPP}/healthz`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json({ healthy: res.ok, ...data })
  } catch (err: any) {
    return NextResponse.json(
      { healthy: false, message: err?.message ?? 'unreachable' },
      { status: 502 }
    )
  }
}
