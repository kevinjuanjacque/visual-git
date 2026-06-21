import { useEffect, useState, useRef } from 'react'
import { GIT_ERROR_TYPES } from '../utils/gitErrors'

/**
 * GitErrorToast — Sistema de notificaciones de error Git con acciones rápidas.
 *
 * Props:
 *  - errors: array de GitError activos
 *  - onDismiss(id): cierra una notificación
 *  - onAction(actionKey, error): ejecuta una acción
 */
export function GitErrorToast({ errors, onDismiss, onAction }) {
  if (!errors?.length) return null

  return (
    <div className="fixed top-14 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ maxWidth: 420 }}>
      {errors.map(err => (
        <ToastCard key={err.id} error={err} onDismiss={onDismiss} onAction={onAction} />
      ))}
    </div>
  )
}

function ToastCard({ error, onDismiss, onAction }) {
  const [visible, setVisible] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  function dismiss() {
    setLeaving(true)
    setTimeout(() => onDismiss(error.id), 250)
  }

  const { title, description, severity, actions, data, rawMessage } = error
  const [showRaw, setShowRaw] = useState(false)

  const severityConfig = {
    warning:  { border: 'border-amber-500/40',  icon: <WarnIcon />,     bg: 'bg-amber-500/5',    badge: 'bg-amber-500/20 text-amber-400' },
    conflict: { border: 'border-red-500/40',     icon: <ConflictIcon />, bg: 'bg-red-500/5',      badge: 'bg-red-500/20 text-red-400' },
    error:    { border: 'border-red-600/50',     icon: <ErrorIcon />,    bg: 'bg-red-600/8',      badge: 'bg-red-600/20 text-red-400' },
    info:     { border: 'border-blue-500/40',    icon: <InfoIcon />,     bg: 'bg-blue-500/5',     badge: 'bg-blue-500/20 text-blue-400' },
  }[severity] || { border: 'border-surface-600', icon: <ErrorIcon />, bg: 'bg-surface-800', badge: 'bg-surface-700 text-slate-400' }

  return (
    <div
      className={`pointer-events-auto rounded-xl border ${severityConfig.border} ${severityConfig.bg}
        bg-surface-850 shadow-2xl shadow-black/50 backdrop-blur-sm transition-all duration-250
        ${visible && !leaving ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-3.5 pb-2">
        <span className="shrink-0 mt-0.5">{severityConfig.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-white leading-tight">{title}</div>
          <div className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{description}</div>

          {/* Conflicted files list */}
          {data?.files?.length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {data.files.slice(0, 5).map(f => (
                <div key={f} className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
                  <span className="text-red-400">✕</span> {f}
                </div>
              ))}
              {data.files.length > 5 && (
                <div className="text-[10px] text-slate-600">… y {data.files.length - 5} más</div>
              )}
            </div>
          )}

          {/* Locked file */}
          {data?.file && (
            <div className="mt-1.5 text-[11px] font-mono text-amber-400 bg-amber-500/10 rounded px-2 py-1">
              {data.file}
            </div>
          )}
        </div>
        <button onClick={dismiss} className="shrink-0 text-slate-600 hover:text-slate-300 transition-colors text-lg leading-none mt-0.5">×</button>
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-3.5 flex flex-wrap gap-2">
        {actions.map(actionKey => (
          <ActionButton
            key={actionKey}
            actionKey={actionKey}
            error={error}
            onAction={onAction}
            onDismiss={dismiss}
          />
        ))}
        <button
          onClick={() => setShowRaw(v => !v)}
          className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors underline underline-offset-2 self-center ml-auto"
        >
          {showRaw ? 'ocultar detalle' : 'ver error completo'}
        </button>
      </div>

      {/* Raw error message (collapsible) */}
      {showRaw && (
        <div className="px-4 pb-3.5">
          <pre className="text-[10px] font-mono text-slate-500 bg-surface-900 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-32 border border-surface-700/50">
            {rawMessage}
          </pre>
        </div>
      )}
    </div>
  )
}

// ── Action button definitions ─────────────────────────────────────────────────

const ACTION_CONFIG = {
  stash_checkout:   { label: '✨ Stash & Checkout', variant: 'primary', confirm: false },
  discard_checkout: { label: '⚠️ Descartar & Checkout', variant: 'danger', confirm: true,  confirmMsg: '¿Descartás todos los cambios locales? Esta acción no se puede deshacer.' },
  pull_ff:          { label: '⬇️ Pull (fast-forward)', variant: 'primary', confirm: false },
  pull_rebase:      { label: '🔁 Pull (rebase)', variant: 'secondary', confirm: false },
  force_push:       { label: '⚡ Force Push', variant: 'danger', confirm: true, confirmMsg: '¿Forzás el push? Esto sobrescribirá trabajo de otras personas en el remoto.' },
  autostash_pull:   { label: '✨ Autostash & Pull', variant: 'primary', confirm: false },
  focus_commit:     { label: '📝 Ir a Commit', variant: 'secondary', confirm: false },
  open_conflicts:   { label: '🔍 Ver Conflictos', variant: 'primary', confirm: false },
  abort_merge:      { label: 'Abortar Merge', variant: 'danger', confirm: true, confirmMsg: '¿Abortás el merge? Se perderán los cambios de resolución.' },
  abort_rebase:     { label: 'Abortar Rebase', variant: 'danger', confirm: true, confirmMsg: '¿Abortás el rebase?' },
  abort_cherry_pick:{ label: 'Abortar Cherry-pick', variant: 'danger', confirm: true, confirmMsg: '¿Abortás el cherry-pick?' },
  create_branch:    { label: '🌿 Crear Rama Aquí', variant: 'primary', confirm: false },
  retry:            { label: '🔄 Reintentar', variant: 'secondary', confirm: false },
  cancel:           { label: 'Cancelar', variant: 'ghost', confirm: false },
}

function ActionButton({ actionKey, error, onAction, onDismiss }) {
  const cfg = ACTION_CONFIG[actionKey]
  if (!cfg) return null

  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (cfg.confirm && !window.confirm(cfg.confirmMsg)) return
    if (actionKey === 'cancel') { onDismiss(); return }
    setBusy(true)
    await onAction(actionKey, error)
    setBusy(false)
    onDismiss()
  }

  const variantClass = {
    primary:   'bg-brand-600 hover:bg-brand-500 text-white',
    secondary: 'bg-surface-700 hover:bg-surface-600 text-slate-200',
    danger:    'bg-red-700/80 hover:bg-red-600 text-white',
    ghost:     'text-slate-500 hover:text-slate-300',
  }[cfg.variant]

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5 ${variantClass}`}
    >
      {busy && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin shrink-0">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
      )}
      {cfg.label}
    </button>
  )
}

// ── Conflict Mode Banner ──────────────────────────────────────────────────────

export function ConflictBanner({ type, conflictedFiles, onAbort, onOpenConflicts }) {
  if (!type) return null

  const labels = {
    merge:       { verb: 'Merge', abort: 'git merge --abort' },
    rebase:      { verb: 'Rebase', abort: 'git rebase --abort' },
    cherry_pick: { verb: 'Cherry-pick', abort: 'git cherry-pick --abort' },
    stash:       { verb: 'Stash pop', abort: null },
  }
  const cfg = labels[type] || labels.merge

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-amber-950/80 to-orange-950/60 border-b border-amber-600/40 text-amber-300">
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" className="shrink-0 animate-pulse">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="text-[12px] font-semibold text-amber-300">
          {cfg.verb} en progreso
        </span>
        <span className="text-[11px] text-amber-500">
          — {conflictedFiles?.length || 0} archivo{conflictedFiles?.length !== 1 ? 's' : ''} con conflicto
        </span>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onOpenConflicts}
          className="px-3 py-1 text-[11px] font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 transition-colors border border-amber-500/30"
        >
          Ver conflictos →
        </button>
        {cfg.abort && (
          <button
            onClick={() => {
              if (window.confirm(`¿Abortás el ${cfg.verb.toLowerCase()}? Se revertirá al estado anterior.`))
                onAbort(type)
            }}
            className="px-3 py-1 text-[11px] font-medium rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-400 transition-colors border border-red-500/20"
          >
            Abortar {cfg.verb}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Detached HEAD Banner ──────────────────────────────────────────────────────

export function DetachedHeadBanner({ hash, onCreateBranch }) {
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-blue-950/60 border-b border-blue-600/30 text-blue-300">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" className="shrink-0">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <span className="text-[11px] text-blue-300">
        <span className="font-semibold">Detached HEAD</span>
        {hash && <span className="font-mono text-blue-500 ml-1">({hash.substring(0, 7)})</span>}
        {' '}— Los commits nuevos podrían perderse al cambiar de rama.
      </span>
      <button
        onClick={onCreateBranch}
        className="ml-auto px-3 py-1 text-[11px] font-medium rounded-lg bg-blue-500/20 hover:bg-blue-500/35 text-blue-300 transition-colors border border-blue-500/30 shrink-0"
      >
        🌿 Crear Rama Aquí
      </button>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function WarnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  )
}

function ConflictIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
      <path d="M16 16v-3a3 3 0 10-6 0v3M3 12l4-4 4 4M17 8l4 4-4 4"/>
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}
