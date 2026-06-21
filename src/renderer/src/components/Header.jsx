import { useState, useEffect, useRef } from 'react'
import { formatDistanceToNow } from '../utils/time'

export default function Header({
  user, repoPath, loading, lastRefresh, nextRefresh,
  hasWip, onRefresh, onOpenRepo, onLogout,
  onPull, onPush, onStash, onNewBranch
}) {
  const [countdown,   setCountdown]   = useState('')
  const [busy,        setBusy]        = useState('')   // 'pull' | 'push' | 'stash' | ''
  const [showBranch,  setShowBranch]  = useState(false)
  const [branchName,  setBranchName]  = useState('')
  const branchInputRef = useRef(null)

  useEffect(() => {
    if (!nextRefresh) return
    const update = () => {
      const diff = nextRefresh - new Date()
      if (diff <= 0) { setCountdown('actualizando...'); return }
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setCountdown(`${m}:${s.toString().padStart(2, '0')}`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [nextRefresh])

  useEffect(() => {
    if (showBranch) setTimeout(() => branchInputRef.current?.focus(), 50)
  }, [showBranch])

  const repoName = repoPath ? repoPath.split('/').pop() : null

  async function handlePull() {
    setBusy('pull')
    await onPull?.()
    setBusy('')
  }

  async function handlePush() {
    setBusy('push')
    await onPush?.()
    setBusy('')
  }

  async function handleStash() {
    setBusy('stash')
    await onStash?.()
    setBusy('')
  }

  async function handleCreateBranch() {
    const name = branchName.trim()
    if (!name) return
    setBusy('branch')
    await onNewBranch?.(name)
    setBranchName('')
    setShowBranch(false)
    setBusy('')
  }

  return (
    <header className="drag-region h-11 flex items-center px-4 gap-2 bg-surface-950 border-b border-surface-700/60 shrink-0 select-none">
      {/* macOS traffic-light space */}
      <div className="w-16 shrink-0" />

      {/* App icon + name */}
      <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5">
          <circle cx="12" cy="5" r="3"/>
          <circle cx="4"  cy="19" r="3"/>
          <circle cx="20" cy="19" r="3"/>
          <line x1="12" y1="8" x2="4"  y2="16"/>
          <line x1="12" y1="8" x2="20" y2="16"/>
        </svg>
        GitVisual
      </div>

      {repoName && (
        <>
          <span className="text-surface-700/60">|</span>
          <span className="text-sm text-white font-medium truncate max-w-[180px]">{repoName}</span>
        </>
      )}

      {/* ── Toolbar actions (only when repo is open) ── */}
      {repoPath && (
        <div className="no-drag flex items-center gap-1 ml-2">

          {/* Pull */}
          <ToolBtn
            title="Pull"
            busy={busy === 'pull'}
            onClick={handlePull}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="8 17 12 21 16 17"/>
                <line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>
              </svg>
            }
          />

          {/* Push */}
          <ToolBtn
            title="Push"
            busy={busy === 'push'}
            onClick={handlePush}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 7 12 3 8 7"/>
                <line x1="12" y1="3" x2="12" y2="12"/>
                <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>
              </svg>
            }
          />

          <div className="w-px h-5 bg-surface-700/60 mx-1" />

          {/* New Branch — with inline input */}
          <div className="relative">
            <ToolBtn
              title="Nueva rama"
              busy={busy === 'branch'}
              active={showBranch}
              onClick={() => setShowBranch(v => !v)}
              icon={
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="6" y1="3" x2="6" y2="15"/>
                  <circle cx="18" cy="6" r="3"/>
                  <circle cx="6" cy="18" r="3"/>
                  <path d="M18 9a9 9 0 01-9 9"/>
                  <line x1="18" y1="3" x2="18" y2="6" />
                </svg>
              }
              label="Rama"
            />
            {showBranch && (
              <div className="absolute top-full left-0 mt-1 z-50 flex items-center gap-1 bg-surface-800 border border-surface-600 rounded-lg shadow-xl px-2 py-1.5">
                <input
                  ref={branchInputRef}
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateBranch(); if (e.key === 'Escape') setShowBranch(false) }}
                  placeholder="nombre-de-rama"
                  className="bg-surface-900 border border-surface-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 w-40"
                />
                <button
                  onClick={handleCreateBranch}
                  disabled={!branchName.trim()}
                  className="px-2 py-1 text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white rounded disabled:opacity-40 transition-colors"
                >
                  Crear
                </button>
              </div>
            )}
          </div>

          {/* Stash */}
          <ToolBtn
            title="Stash (guardar cambios)"
            busy={busy === 'stash'}
            onClick={handleStash}
            disabled={!hasWip}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8"/>
                <rect x="1" y="3" width="22" height="5"/>
                <line x1="10" y1="12" x2="14" y2="12"/>
              </svg>
            }
            label="Stash"
          />
        </div>
      )}

      <div className="flex-1" />

      {/* Right side controls */}
      <div className="no-drag flex items-center gap-2">
        {repoPath && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            {countdown && <span>próx. refresh {countdown}</span>}
            {lastRefresh && <span>· {formatDistanceToNow(lastRefresh)}</span>}
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Actualizar ahora"
              className="p-1.5 rounded hover:bg-surface-800 transition-colors disabled:opacity-40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={loading ? 'animate-spin text-brand-400' : 'text-slate-400'}>
                <polyline points="23 4 23 10 17 10"/>
                <polyline points="1 20 1 14 7 14"/>
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
              </svg>
            </button>
          </div>
        )}

        <button
          onClick={onOpenRepo}
          className="no-drag px-3 py-1.5 text-[11px] font-medium rounded-md bg-surface-800 hover:bg-surface-700 text-slate-300 transition-colors flex items-center gap-1.5 border border-surface-700/60"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          Abrir repo
        </button>

        {user && (
          <div className="flex items-center gap-2">
            <img src={user.avatar_url} alt={user.login} className="w-6 h-6 rounded-full ring-1 ring-surface-700" />
            <span className="text-[11px] text-slate-400">{user.login}</span>
            <button onClick={onLogout} className="text-[11px] text-slate-500 hover:text-red-400 transition-colors px-1" title="Cerrar sesión">×</button>
          </div>
        )}
      </div>
    </header>
  )
}

function ToolBtn({ title, icon, label, onClick, busy, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`no-drag flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
        active
          ? 'bg-brand-500/20 text-brand-300'
          : disabled
          ? 'text-slate-700 cursor-not-allowed'
          : 'text-slate-400 hover:bg-surface-800 hover:text-white'
      } disabled:opacity-50`}
    >
      {busy
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
        : icon
      }
      {label && <span>{label}</span>}
    </button>
  )
}
