import { useEffect, useState } from 'react'

export default function Login() {
  const [deviceAuthorization, setDeviceAuthorization] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const offSuccess = window.electronAPI.onAuthSuccess(() => setDeviceAuthorization(null))
    const offError = window.electronAPI.onAuthError(message => {
      setError(message)
      setDeviceAuthorization(null)
    })

    return () => {
      offSuccess?.()
      offError?.()
    }
  }, [])

  async function handleLogin() {
    setError('')
    const result = await window.electronAPI.login()
    if (!result?.ok) {
      setError(result?.error || 'No se pudo iniciar la autorización con GitHub.')
      return
    }
    setDeviceAuthorization(result)
  }

  return (
    <div className="flex items-center justify-center h-screen bg-surface-900">
      <div className="w-full max-w-md px-8 py-10 bg-surface-800 rounded-2xl shadow-2xl border border-surface-700/60">
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

        {deviceAuthorization ? (
          <DeviceAuthorization authorization={deviceAuthorization} error={error} />
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-surface-900 rounded-lg border border-surface-700/60 text-[12px] text-slate-400 leading-relaxed">
              Inicia sesión con tu propia cuenta GitHub. Visual Git nunca solicita ni almacena tu contraseña o un Client Secret.
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

function DeviceAuthorization({ authorization, error }) {
  return (
    <div className="space-y-5 text-center">
      <div className="flex flex-col items-center gap-3 py-2">
        <div className="relative w-12 h-12">
          <svg className="animate-spin w-12 h-12 text-brand-500" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
            <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <p className="text-white font-medium">Autoriza Visual Git en GitHub</p>
        <p className="text-slate-500 text-[11px]">
          Se abrió GitHub en tu navegador. Escribe este código para continuar:
        </p>
      </div>

      <code className="block py-3 px-4 bg-surface-900 border border-brand-500/40 rounded-lg text-xl tracking-[0.22em] font-semibold text-brand-300">
        {authorization.userCode}
      </code>
      <p className="text-[11px] text-slate-600">El código vence en {Math.ceil(authorization.expiresIn / 60)} minutos.</p>

      {error && (
        <p className="text-red-400 text-[11px] bg-red-900/15 border border-red-700/25 rounded px-3 py-2">{error}</p>
      )}
    </div>
  )
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 1.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12c0-5.523-4.477-10-10-10z"/>
    </svg>
  )
}
