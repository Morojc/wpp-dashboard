import { EventEmitter } from 'events'

export interface WppMessage {
  id: string
  event: string
  session: string
  body: string
  from: string
  fromMe: boolean
  isGroupMsg: boolean
  type: string
  timestamp: number
}

class MessageStore extends EventEmitter {
  private messages: WppMessage[] = []

  constructor() {
    super()
    this.setMaxListeners(100)
  }

  add(raw: Record<string, any>): WppMessage {
    const msg: WppMessage = {
      id: raw.id?.toString() ?? `${Date.now()}-${Math.random()}`,
      event: raw.event ?? 'onmessage',
      session: raw.session ?? '',
      body: raw.body ?? '',
      from: raw.from ?? '',
      fromMe: Boolean(raw.fromMe),
      isGroupMsg: Boolean(raw.isGroupMsg),
      type: raw.type ?? 'chat',
      timestamp: Date.now(),
    }
    this.messages.push(msg)
    if (this.messages.length > 200) this.messages.shift()
    this.emit('message', msg)
    return msg
  }

  getAll(): WppMessage[] {
    return [...this.messages]
  }
}

// Global singleton — survives Next.js HMR in development
declare global {
  // eslint-disable-next-line no-var
  var __messageStore: MessageStore | undefined
}

if (!global.__messageStore) {
  global.__messageStore = new MessageStore()
}

export const messageStore = global.__messageStore
