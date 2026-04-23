import { messageStore, WppMessage } from '@/lib/messageStore'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      // Send all existing messages immediately on connect
      send({ type: 'init', messages: messageStore.getAll() })

      // Push new messages in real time
      const onMessage = (msg: WppMessage) => send({ type: 'message', message: msg })
      messageStore.on('message', onMessage)

      req.signal.addEventListener('abort', () => {
        messageStore.off('message', onMessage)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
