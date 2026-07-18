import { useState, useEffect, useRef } from 'react'

export default function Login() {
  const [clientId,     setClientId]     = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [fromEnv,      setFromEnv]      = useState(false)
  const [waiting,      setWaiting]      = useState(false)   // esperando callback
  const [error,        setError]        = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    window.electronAPI.getCredentials().then(creds => {
      if (creds.fromEnv) {
        setFromEnv(true)
        setClientId(creds.clientId)
      } else {
        setClientId(creds.clientId || '')
        setClientSecret(creds.clientSecret || '')
      }
    })

    // Escucha el evento directo de auth:success
    const off = window.electronAPI.onAuthSuccess(() => {
      clearInterval(pollRef.current)
      // App.jsx se enterará via onAuthSuccess también; aquí solo limpiamos
    })

    return () => {
      off?.()
      clearInterval(pollRef.current)
    }
  }, [])

  async function handleLogin() {
    if (!fromEnv && (!clientId.trim() || !clientSecret.trim())) {
      setError('Ingresa Client ID y Client Secret')
      return
    }
    setError('')

    if (!fromEnv) {
      await window.electronAPI.setCredentials({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim()
      })
    }

    await window.electronAPI.login()
    setWaiting(true)

    // Polling de respaldo: revisa cada 2 s si ya hay sesión guardada
    pollRef.current = setInterval(async () => {
      const user = await window.electronAPI.getUser()
      if (user) {
        clearInterval(pollRef.current)
        // Disparamos onAuthSuccess manualmente para que App.jsx reaccione
        window.electronAPI.onAuthSuccess?._trigger?.(user)
        // Forzamos reload como última alternativa
        window.location.reload()
      }
    }, 2000)
  }

  async function handleCheckManually() {
    const user = await window.electronAPI.getUser()
    if (user) {
      clearInterval(pollRef.current)
      window.location.reload()
    } else {
      setError('Aún no se completó la autorización en GitHub. Intenta de nuevo.')
    }
  }

  function handleCancel() {
    setWaiting(false)
    clearInterval(pollRef.current)
    setError('')
  }

  return (
    <div className="flex items-center justify-center h-screen bg-surface-900">
      <div className="w-full max-w-md px-8 py-10 bg-surface-800 rounded-2xl shadow-2xl border border-surface-700/60">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-500/20">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="5" r="3"/>
              <circle cx="4" cy="19" r="3"/>
              <circle cx="20" cy="19" r="3"/>
              <line x1="12" y1="8" x2="4" y2="16"/>
              <line x1="12" y1="8" x2="20" y2="16"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Visual Git</h1>
          <p className="text-slate-500 text-sm mt-1">Cliente Git visual con integración GitHub</p>
        </div>

        {/* ── Estado: esperando callback ── */}
        {waiting ? (
          <WaitingState
            onCheckManually={handleCheckManually}
            onCancel={handleCancel}
            error={error}
          />
        ) : fromEnv ? (
          /* Credentials pre-configured via .env */
          <div className="space-y-4">
            <div className="p-3 bg-emerald-900/15 border border-emerald-700/30 rounded-lg text-[11px] text-emerald-400 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Credenciales configuradas via .env
              <code className="ml-1 text-emerald-300 font-mono">{clientId}</code>
            </div>
            {error && <p className="text-red-400 text-[11px]">{error}</p>}
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#24292e] hover:bg-[#2f363d] text-white rounded-lg font-medium transition-colors"
            >
              <GitHubIcon />
              Iniciar sesión con GitHub
            </button>
          </div>
        ) : (
          /* Manual credential entry */
          <div className="space-y-4">
            <div className="p-4 bg-surface-900 rounded-lg border border-surface-700/60 text-[11px] text-slate-400 space-y-1">
              <p className="text-slate-300 font-medium mb-2">Configuración OAuth de GitHub</p>
              <p>1. Ve a <span className="text-brand-400">github.com → Settings → Developer settings → OAuth Apps</span></p>
              <p>2. Authorization callback URL: <code className="bg-surface-700 px-1 rounded text-emerald-400">http://localhost:42420/callback</code></p>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-300 mb-1">Client ID</label>
              <input
                type="text"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                placeholder="Iv23liXXXXXXXXXXXXXX"
                className="w-full px-3 py-2 bg-surface-900 border border-surface-700/60 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-300 mb-1">Client Secret</label>
              <input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••••••••••"
                className="w-full px-3 py-2 bg-surface-900 border border-surface-700/60 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>
            {error && <p className="text-red-400 text-[11px] px-1">{error}</p>}
            <button
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#24292e] hover:bg-[#2f363d] text-white rounded-lg font-medium transition-colors"
            >
              <GitHubIcon />
              Iniciar sesión con GitHub
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function WaitingState({ onCheckManually, onCancel, error }) {
  const [dots, setDots]       = useState('.')
  const [diag, setDiag]       = useState(null)
  const [showDiag, setShowDiag] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 600)
    return () => clearInterval(id)
  }, [])

  async function loadDiag() {
    const d = await window.electronAPI.diagnose()
    setDiag(d)
    setShowDiag(true)
  }

  return (
    <div className="space-y-5 text-center">
      {/* Spinner */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="relative w-12 h-12">
          <svg className="animate-spin w-12 h-12 text-brand-500" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
            <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-white font-medium">Esperando autorización en GitHub{dots}</p>
        <p className="text-slate-500 text-[11px]">
          Autoriza la app en el browser que se abrió.<br/>
          La app detectará el callback automáticamente.
        </p>
      </div>

      {error && (
        <p className="text-red-400 text-[11px] bg-red-900/15 border border-red-700/25 rounded px-3 py-2">{error}</p>
      )}

      {/* Botón manual */}
      <button
        onClick={onCheckManually}
        className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        Ya autoricé — verificar sesión
      </button>

      {/* Diagnóstico */}
      <button
        onClick={loadDiag}
        className="w-full py-2 text-slate-500 hover:text-slate-300 text-[11px] transition-colors flex items-center justify-center gap-1"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        Ver diagnóstico
      </button>

      {showDiag && diag && (
        <div className="text-left text-[11px] font-mono bg-surface-900 border border-surface-700/60 rounded-lg p-3 space-y-1">
          <DiagRow label="Client ID"     ok={diag.hasClientId}     />
          <DiagRow label="Client Secret" ok={diag.hasClientSecret && !diag.clientSecretIsPlaceholder}
            warn={diag.clientSecretIsPlaceholder ? '⚠ es el placeholder, actualiza .env' : null} />
          <DiagRow label="Servidor OAuth activo" ok={diag.serverActive} />
          <DiagRow label="Token guardado" ok={diag.hasToken} />
          <DiagRow label="Usuario guardado" ok={diag.hasUser} />
          <p className="text-slate-600 pt-1">Puerto: {diag.oauthPort} · Redirect: {diag.redirectUri}</p>
        </div>
      )}

      <button
        onClick={onCancel}
        className="w-full py-2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
      >
        Cancelar
      </button>
    </div>
  )
}

function DiagRow({ label, ok, warn }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? 'text-emerald-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
      <span className={ok ? 'text-slate-300' : 'text-red-300'}>{label}</span>
      {warn && <span className="text-amber-400 ml-1">{warn}</span>}
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z"/>
    </svg>
  )
}
