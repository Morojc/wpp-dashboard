import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL ?? 'https://nuvaxy.app.n8n.cloud/webhook-test/whatsapp'

export async function POST(req: NextRequest) {
  const payload = await req.json()

  try {
    const res = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return NextResponse.json({ ok: true, status: res.status })
  } catch (err) {
    console.error('[forward] n8n unreachable:', err)
    return NextResponse.json({ ok: false }, { status: 502 })
  }
}
