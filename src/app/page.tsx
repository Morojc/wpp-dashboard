'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const WPP_SERVER = 'https://api.masksan.com'

type Step = 1 | 2 | 3 | 4

interface WppMessage {
  id: string
  from: string
  body: string
  session: string
  isGroupMsg: boolean
  type: string
  timestamp: number
}

const STEP_LABELS = ['Generate Token', 'Start Session', 'Scan QR Code', 'Connected']

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center w-full mb-8">
      {STEP_LABELS.map((label, i) => {
        const num = (i + 1) as Step
        const done = current > num
        const active = current === num
        return (
          <div key={num} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                  ${done ? 'bg-green-500 border-green-500 text-white' : ''}
                  ${active ? 'bg-white border-green-500 text-green-600' : ''}
                  ${!done && !active ? 'bg-white border-gray-200 text-gray-300' : ''}
                `}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : num}
              </div>
              <span
                className={`mt-1.5 text-xs font-medium whitespace-nowrap
                  ${active ? 'text-green-600' : done ? 'text-green-500' : 'text-gray-300'}
                `}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-2 mb-5 transition-all
                  ${current > num ? 'bg-green-400' : 'bg-gray-200'}
                `}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepCard({
  step,
  current,
  title,
  children,
}: {
  step: Step
  current: Step
  title: string
  children: React.ReactNode
}) {
  const done = current > step
  const active = current === step
  const pending = current < step

  return (
    <div
      className={`rounded-2xl border transition-all
        ${active ? 'border-green-300 bg-white shadow-sm' : ''}
        ${done ? 'border-gray-100 bg-gray-50' : ''}
        ${pending ? 'border-gray-100 bg-gray-50 opacity-50' : ''}
      `}
    >
      <div className="px-6 py-4 flex items-center gap-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
            ${active ? 'bg-green-500 text-white' : ''}
            ${done ? 'bg-green-100 text-green-600' : ''}
            ${pending ? 'bg-gray-200 text-gray-400' : ''}
          `}
        >
          {done ? (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : step}
        </div>
        <h3 className={`font-semibold text-sm ${active ? 'text-gray-800' : 'text-gray-400'}`}>
          {title}
        </h3>
      </div>
      {active && <div className="px-6 pb-6">{children}</div>}
    </div>
  )
}

const STORAGE_KEY = 'wpp_config'

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function clearSaved() {
  localStorage.removeItem(STORAGE_KEY)
}

export default function Page() {
  const [step, setStep] = useState<Step>(1)
  const [secretKey, setSecretKey] = useState('')
  const [session, setSession] = useState('NERDWHATS_AMERICA')
  const [token, setToken] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('https://nuvaxy.app.n8n.cloud/webhook/whatsapp')
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyUser, setProxyUser] = useState('')
  const [proxyPass, setProxyPass] = useState('')
  const [showProxy, setShowProxy] = useState(false)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrStatus, setQrStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<WppMessage[]>([])
  const [copied, setCopied] = useState(false)
  const [hasSaved, setHasSaved] = useState(false)
  const [serverHealth, setServerHealth] = useState<'checking' | 'healthy' | 'down'>('checking')
  const [serverUptime, setServerUptime] = useState<number | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const healthRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load persisted config on mount
  useEffect(() => {
    const saved = loadSaved()
    if (saved.token) { setToken(saved.token); setHasSaved(true) }
    if (saved.session) setSession(saved.session)
    if (saved.webhookUrl) setWebhookUrl(saved.webhookUrl)
  }, [])

  // Persist config whenever it changes
  useEffect(() => {
    if (!token && !session && !webhookUrl) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, session, webhookUrl }))
    if (token) setHasSaved(true)
  }, [token, session, webhookUrl])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Health check — runs immediately and every 30s
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/wpp/health')
        const data = await res.json()
        setServerHealth(data.healthy ? 'healthy' : 'down')
        if (data.uptime != null) setServerUptime(Math.floor(data.uptime))
      } catch {
        setServerHealth('down')
      }
    }
    check()
    healthRef.current = setInterval(check, 30_000)
    return () => { if (healthRef.current) clearInterval(healthRef.current) }
  }, [])

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  // Connect socket and register all real-time listeners.
  // Returns a Promise that resolves once the socket is connected (or times out),
  // so callers can await it before triggering server-side events they don't want to miss.
  const connectSocket = useCallback((sess: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      if (socketRef.current?.connected) {
        resolve()
        return
      }
      if (socketRef.current) socketRef.current.disconnect()

      const socket = io(WPP_SERVER, { transports: ['websocket', 'polling'] })
      socketRef.current = socket

      // Fired by server the instant the QR image is ready
      socket.on('qrCode', ({ data, session: s }: { data: string; session: string }) => {
        if (s && s !== sess) return
        setQrCode(data)
        setQrStatus('Waiting for QR scan...')
      })

      // Fired by server the instant the QR is scanned
      socket.on('session-logged', ({ session: s }: { status: boolean; session: string }) => {
        if (s && s !== sess) return
        setQrCode(null)
        setQrStatus('')
        setStep(4)
      })

      // Fired by server on Puppeteer/WhatsApp error
      socket.on('session-error', (s: string) => {
        if (s && s !== sess) return
        setError('Session initialization failed — please try again')
        setStep(2)
      })

      // Incoming WhatsApp messages (used once connected at step 4)
      socket.on('received-message', ({ response }: { response: any }) => {
        if (response?.fromMe) return
        const msg: WppMessage = {
          id: response.id?.toString() ?? `${Date.now()}`,
          from: response.from ?? '',
          body: response.body ?? '',
          session: response.session ?? sess,
          isGroupMsg: Boolean(response.isGroupMsg),
          type: response.type ?? 'chat',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, msg])
      })

      // Resolve as soon as the socket handshake completes (or give up after 4s)
      socket.once('connect', () => resolve())
      socket.once('connect_error', () => resolve())
      setTimeout(resolve, 4000)
    })
  }, [])

  const generateToken = async () => {
    if (!secretKey.trim() || !session.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/wpp/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, secretKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? data.message ?? 'Failed to generate token')
        return
      }
      setToken(data.token ?? '')
      setStep(2)
    } catch {
      setError('Network error — could not reach the server')
    } finally {
      setLoading(false)
    }
  }

  const startSession = async () => {
    if (!token.trim()) return
    setLoading(true)
    setError('')

    // Wait for the socket to be connected BEFORE calling start-session so we never
    // miss the qrCode event (which fires as soon as the server generates the QR).
    await connectSocket(session)

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          session,
          webhookUrl,
          ...(proxyUrl.trim() ? { proxy: { url: proxyUrl.trim(), username: proxyUser.trim(), password: proxyPass.trim() } } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? data.message ?? 'Failed to start session')
        socketRef.current?.disconnect()
        socketRef.current = null
        return
      }
      setStep(3)
      setQrStatus('Starting session...')

      // Fallback: if the session was already initialized (e.g. server restart restored it),
      // the qrCode socket event may never fire. Fetch once to show any existing QR.
      try {
        const qrRes = await fetch(
          `/api/wpp/qr?session=${encodeURIComponent(session)}&token=${encodeURIComponent(token)}`
        )
        const qrData = await qrRes.json()
        if (qrData.qrcode) {
          setQrCode(qrData.qrcode)
          setQrStatus('Waiting for QR scan...')
        }
        // Don't transition to step 4 here — the socket session-logged event handles that
      } catch {}
    } catch {
      setError('Network error — could not reach the server')
    } finally {
      setLoading(false)
    }
  }

  const closeSession = async () => {
    setLoading(true)
    setError('')
    socketRef.current?.disconnect()
    socketRef.current = null
    try {
      await fetch('/api/wpp/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, token }),
      })
    } catch {}
    setStep(2)
    setQrCode(null)
    setQrStatus('')
    setMessages([])
    setLoading(false)
  }

  const logout = async () => {
    setLoading(true)
    setError('')
    socketRef.current?.disconnect()
    socketRef.current = null
    try {
      await fetch('/api/wpp/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session, token }),
      })
    } catch {}
    clearSaved()
    setHasSaved(false)
    setStep(1)
    setToken('')
    setQrCode(null)
    setQrStatus('')
    setMessages([])
    setLoading(false)
  }

  const resetServer = async () => {
    if (!secretKey.trim()) {
      setError('Secret key is required to reset the server')
      return
    }
    if (!window.confirm('This will close ALL sessions and delete all tokens and cache on the server. Are you sure?')) return
    setLoading(true)
    setError('')
    socketRef.current?.disconnect()
    socketRef.current = null
    try {
      const res = await fetch('/api/wpp/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? data.message ?? 'Reset failed')
        return
      }
      clearSaved()
      setHasSaved(false)
      setToken('')
      setQrCode(null)
      setQrStatus('')
      setMessages([])
      setStep(1)
    } catch {
      setError('Network error — could not reach the server')
    } finally {
      setLoading(false)
    }
  }

  const resetSaved = () => {
    clearSaved()
    setHasSaved(false)
    setToken('')
    setSession('NERDWHATS_AMERICA')
    setWebhookUrl('https://nuvaxy.app.n8n.cloud/webhook/whatsapp')
    setStep(1)
    setError('')
  }

  const copyToken = () => {
    navigator.clipboard.writeText(token)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatPhone = (from: string) =>
    from.replace('@c.us', '').replace('@g.us', ' (group)')

  const formatUptime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold text-gray-800">WPPConnect Dashboard</h1>
            <p className="text-sm text-gray-400">WhatsApp session management</p>
          </div>
          <div className="flex items-center gap-2">
            {hasSaved && step < 4 && (
              <button
                onClick={resetSaved}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors underline underline-offset-2"
              >
                Reset saved data
              </button>
            )}
            {/* Server health badge */}
            {serverHealth === 'checking' && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-pulse" />
                Checking server…
              </span>
            )}
            {serverHealth === 'healthy' && (
              <span
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full"
                title={serverUptime != null ? `Uptime: ${formatUptime(serverUptime)}` : ''}
              >
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                Server healthy
                {serverUptime != null && (
                  <span className="text-emerald-500 opacity-70">· {formatUptime(serverUptime)}</span>
                )}
              </span>
            )}
            {serverHealth === 'down' && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                Server unreachable
              </span>
            )}
            {step === 4 && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Connected
              </span>
            )}
          </div>
        </div>

        {/* Step progress */}
        <StepIndicator current={step} />

        {/* Global error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Step 1 — Generate Token */}
        <StepCard step={1} current={step} title="Generate Token">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Session Name</label>
                <input
                  type="text"
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Secret Key</label>
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Your server secret key"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <button
              onClick={generateToken}
              disabled={loading || !secretKey.trim() || !session.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              {loading ? 'Generating…' : 'Generate Token'}
            </button>
            <button
              onClick={resetServer}
              disabled={loading || !secretKey.trim()}
              className="w-full bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-600 font-semibold py-2 rounded-xl text-sm transition-colors border border-red-200"
            >
              {loading ? 'Please wait…' : 'Reset Server — Close All Sessions & Clear Cache'}
            </button>
          </div>
        </StepCard>

        {/* Step 2 — Start Session */}
        <StepCard step={2} current={step} title="Start Session">
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-gray-500">Bearer Token</label>
                {hasSaved && token && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Restored from browser
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                />
                {token && (
                  <button
                    onClick={copyToken}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-lg transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">n8n Webhook URL</label>
              <input
                type="text"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Proxy section */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowProxy((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm"
              >
                <span className="flex items-center gap-2 font-medium text-gray-600">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
                  </svg>
                  Proxy
                  {proxyUrl && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md font-normal">
                      {proxyUrl}
                    </span>
                  )}
                </span>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${showProxy ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showProxy && (
                <div className="px-4 pb-4 pt-3 space-y-3 bg-white">
                  <p className="text-xs text-gray-400">
                    Overrides the server proxy pool for this session only. Leave blank to use the server default.
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Proxy URL
                      <span className="ml-1 font-normal text-gray-400">e.g. http://host:port or socks5://host:port</span>
                    </label>
                    <input
                      type="text"
                      value={proxyUrl}
                      onChange={(e) => setProxyUrl(e.target.value)}
                      placeholder="http://isp.decodo.com:10002"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Username</label>
                      <input
                        type="text"
                        value={proxyUser}
                        onChange={(e) => setProxyUser(e.target.value)}
                        placeholder="sp7qjn1c5o"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                      <input
                        type="password"
                        value={proxyPass}
                        onChange={(e) => setProxyPass(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>
                  {proxyUrl && (
                    <button
                      type="button"
                      onClick={() => { setProxyUrl(''); setProxyUser(''); setProxyPass('') }}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      Clear proxy
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={startSession}
              disabled={loading || !token.trim()}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
            >
              {loading ? 'Starting…' : 'Start Session'}
            </button>
          </div>
        </StepCard>

        {/* Step 3 — Scan QR Code */}
        <StepCard step={3} current={step} title="Scan QR Code">
          <div className="flex flex-col items-center gap-4">
            {qrCode ? (
              <div className="border border-gray-200 rounded-xl overflow-hidden p-3 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="WhatsApp QR Code" className="w-56 h-56" />
              </div>
            ) : (
              <div className="w-56 h-56 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Loading QR code…</p>
                </div>
              </div>
            )}
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">{qrStatus || 'Preparing…'}</p>
              <p className="text-xs text-gray-400 mt-0.5">Open WhatsApp → Linked Devices → Link a Device</p>
            </div>
            {qrCode && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                Live — updates instantly via Socket.IO
              </p>
            )}
          </div>
        </StepCard>

        {/* Step 4 — Connected */}
        <StepCard step={4} current={step} title="Connected">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              Session <span className="font-mono font-medium">{session}</span> is active
            </div>
            <div className="flex gap-3">
              <button
                onClick={closeSession}
                disabled={loading}
                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold py-2.5 rounded-xl text-sm transition-colors border border-amber-200"
              >
                {loading ? 'Please wait…' : 'Close Session'}
              </button>
              <button
                onClick={logout}
                disabled={loading}
                className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2.5 rounded-xl text-sm transition-colors border border-red-200"
              >
                {loading ? 'Please wait…' : 'Logout'}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              <strong className="text-gray-500">Close Session</strong> — stops the bot, keeps the pairing (can restart)
              <br />
              <strong className="text-gray-500">Logout</strong> — removes the device from WhatsApp, requires QR scan again
            </p>
            <div className="border-t border-gray-100 pt-4">
              <button
                onClick={resetServer}
                disabled={loading || !secretKey.trim()}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
              >
                {loading ? 'Please wait…' : 'Reset Server — Close All Sessions & Clear Cache'}
              </button>
              {!secretKey.trim() && (
                <p className="text-xs text-amber-600 mt-1.5 text-center">
                  Go back to Step 1 and enter your Secret Key to enable reset
                </p>
              )}
            </div>
          </div>
        </StepCard>

        {/* Messages — only shown when connected */}
        {step === 4 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                Incoming Messages
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 tabular-nums">{messages.length} received</span>
                {messages.length > 0 && (
                  <button
                    onClick={() => setMessages([])}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {messages.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-sm text-gray-400">No messages yet</p>
                  <p className="text-xs text-gray-300 mt-1">
                    Send a WhatsApp message to your connected number
                  </p>
                </div>
              ) : (
                [...messages].reverse().map((msg) => (
                  <div key={msg.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono font-medium text-gray-700">
                            {formatPhone(msg.from)}
                          </span>
                          {msg.isGroupMsg && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-md">
                              group
                            </span>
                          )}
                          <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-md">
                            {msg.session}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 break-words">
                          {msg.body || (
                            <span className="italic text-gray-400">[{msg.type} — no text]</span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 tabular-nums">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
              <div ref={bottomRef} />
            </div>
          </div>
        )}

        <p className="text-xs text-center text-gray-400 pb-4">
          Connects to <span className="font-mono">api.masksan.com</span> · Forwards to n8n
        </p>
      </div>
    </div>
  )
}
