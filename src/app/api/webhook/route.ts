import { messageStore } from '@/lib/messageStore'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const N8N_WEBHOOK = process.env.N8N_WEBHOOK_URL ?? 'https://nuvaxy.app.n8n.cloud/webhook-test/whatsapp'

export async function POST(req: NextRequest) {
  let payload: Record<string, any>
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Store locally and broadcast to SSE listeners
  messageStore.add(payload)

  // Forward to n8n (fire and forget — don't block the webhook response)
  fetch(N8N_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => console.error('[webhook] n8n forward failed:', err))

  return NextResponse.json({ ok: true })
}
