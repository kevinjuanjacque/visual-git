import { useState, useCallback, useRef } from 'react'
import { classifyGitError, GIT_ERROR_TYPES } from '../utils/gitErrors'

let toastId = 0

/**
 * useGitErrors — Hook central para manejar errores de Git.
 *
 * Retorna:
 *  - errors: lista activa de toasts a mostrar
 *  - conflictState: { active, type, files } si hay un conflicto activo
 *  - isDetachedHead: boolean
 *  - detachedHash: hash del commit actual si estamos en detached HEAD
 *  - runGit(fn, operation): wrapper para ejecutar ops Git con manejo de errores
 *  - dismissError(id): cierra un toast
 *  - handleToastAction(actionKey, error): ejecuta acciones rápidas de un toast
 *  - setConflictState: para limpiar manualmente conflictos
 */
export function useGitErrors({ repoPath, onRefresh, onRefreshStatus, onFocusWip }) {
  const [errors,        setErrors]        = useState([])
  const [conflictState, setConflictState] = useState(null)  // { type, files }
  const [isDetachedHead, setIsDetachedHead] = useState(false)
  const [detachedHash,   setDetachedHash]   = useState(null)
  const pendingOpRef = useRef(null)  // almacena contexto para acciones como "stash & checkout"

  // ── Push a toast ──────────────────────────────────────────────────────────
  const pushError = useCallback((gitError) => {
    const id = ++toastId
    setErrors(prev => [...prev.slice(-3), { ...gitError, id }])  // máx 4 toasts
  }, [])

  const dismissError = useCallback((id) => {
    setErrors(prev => prev.filter(e => e.id !== id))
  }, [])

  // ── runGit: wrapper que intercepta errores ────────────────────────────────
  const runGit = useCallback(async (fn, operation = '', context = {}) => {
    try {
      const result = await fn()
      // Detectar detached HEAD en respuestas de checkout
      if (result?.detached || (typeof result?.branch === 'string' && result.branch === '')) {
        setIsDetachedHead(true)
      }
      return result
    } catch (err) {
      const msg = err?.message || String(err)
      const gitError = classifyGitError(msg, operation)
      pendingOpRef.current = context  // guardamos contexto para botones de acción

      // Para conflictos, activar modo conflicto global
      if (
        gitError.type === GIT_ERROR_TYPES.MERGE_CONFLICT ||
        gitError.type === GIT_ERROR_TYPES.REBASE_CONFLICT ||
        gitError.type === GIT_ERROR_TYPES.STASH_CONFLICT ||
        gitError.type === GIT_ERROR_TYPES.CHERRY_PICK_CONFLICT
      ) {
        const conflictType =
          gitError.type === GIT_ERROR_TYPES.REBASE_CONFLICT      ? 'rebase'
          : gitError.type === GIT_ERROR_TYPES.CHERRY_PICK_CONFLICT ? 'cherry_pick'
          : gitError.type === GIT_ERROR_TYPES.STASH_CONFLICT      ? 'stash'
          : 'merge'
        setConflictState({ type: conflictType, files: gitError.data?.files || [] })
        onRefreshStatus?.()
      }

      // Para detached HEAD
      if (gitError.type === GIT_ERROR_TYPES.DETACHED_HEAD) {
        setIsDetachedHead(true)
        setDetachedHash(context?.hash || null)
      }

      pushError(gitError)
      return null
    }
  }, [pushError, onRefreshStatus])

  // ── Detectar detached HEAD desde git status ───────────────────────────────
  const checkDetachedHead = useCallback((statusResult) => {
    if (!statusResult) return
    const isDetached = !statusResult.current || statusResult.current === 'HEAD'
    setIsDetachedHead(isDetached)
    if (isDetached) setDetachedHash(statusResult.detachedHead || null)
    else { setIsDetachedHead(false); setDetachedHash(null) }
  }, [])

  // ── handleToastAction: ejecuta las acciones rápidas de los toasts ─────────
  const handleToastAction = useCallback(async (actionKey, error) => {
    const ctx = pendingOpRef.current || {}

    switch (actionKey) {

      case 'stash_checkout': {
        // 1. Stash, 2. Checkout, 3. Stash pop
        await window.electronAPI.stashSave({ folderPath: repoPath, message: 'Auto-stash before checkout' })
        const res = await window.electronAPI.checkout({ folderPath: repoPath, branch: ctx.branch || ctx.hash || 'HEAD' })
        if (res?.ok) {
          await window.electronAPI.stashPop({ folderPath: repoPath, ref: 'stash@{0}' })
        }
        onRefresh?.(); onRefreshStatus?.()
        break
      }

      case 'discard_checkout': {
        await window.electronAPI.reset({ folderPath: repoPath, mode: 'hard', hash: 'HEAD' })
        await window.electronAPI.checkout({ folderPath: repoPath, branch: ctx.branch || ctx.hash || 'HEAD' })
        onRefresh?.(); onRefreshStatus?.()
        break
      }

      case 'pull_ff': {
        const res = await window.electronAPI.pull(repoPath)
        if (!res?.ok) pushError(classifyGitError(res?.error || 'Pull failed', 'pull'))
        else { onRefresh?.(); onRefreshStatus?.() }
        break
      }

      case 'pull_rebase': {
        try {
          const git = { folderPath: repoPath }
          const res = await window.electronAPI.pullRebase(repoPath)
          if (!res?.ok) pushError(classifyGitError(res?.error || 'Pull rebase failed', 'pull --rebase'))
          else { onRefresh?.(); onRefreshStatus?.() }
        } catch (err) {
          pushError(classifyGitError(err.message, 'pull --rebase'))
        }
        break
      }

      case 'force_push': {
        const res = await window.electronAPI.push({ folderPath: repoPath, force: true })
        if (!res?.ok) pushError(classifyGitError(res?.error || 'Force push failed', 'push --force'))
        else onRefresh?.()
        break
      }

      case 'autostash_pull': {
        await window.electronAPI.stashSave({ folderPath: repoPath, message: 'Auto-stash before pull' })
        const res = await window.electronAPI.pull(repoPath)
        await window.electronAPI.stashPop({ folderPath: repoPath, ref: 'stash@{0}' })
        if (!res?.ok) pushError(classifyGitError(res?.error || 'Pull failed', 'pull'))
        else { onRefresh?.(); onRefreshStatus?.() }
        break
      }

      case 'focus_commit': {
        onFocusWip?.()
        break
      }

      case 'open_conflicts': {
        onFocusWip?.()  // abre el panel WIP que mostrará los conflictos
        break
      }

      case 'abort_merge': {
        try {
          await window.electronAPI.abortMerge(repoPath)
          setConflictState(null)
          onRefresh?.(); onRefreshStatus?.()
        } catch (err) {
          pushError(classifyGitError(err.message, 'merge --abort'))
        }
        break
      }

      case 'abort_rebase': {
        try {
          await window.electronAPI.abortRebase(repoPath)
          setConflictState(null)
          onRefresh?.(); onRefreshStatus?.()
        } catch (err) {
          pushError(classifyGitError(err.message, 'rebase --abort'))
        }
        break
      }

      case 'abort_cherry_pick': {
        try {
          await window.electronAPI.abortCherryPick(repoPath)
          setConflictState(null)
          onRefresh?.(); onRefreshStatus?.()
        } catch (err) {
          pushError(classifyGitError(err.message, 'cherry-pick --abort'))
        }
        break
      }

      case 'create_branch': {
        const name = window.prompt('Crear rama en el commit actual:\nIngresa el nombre de la rama:')
        if (!name) break
        const res = await window.electronAPI.createBranch({
          folderPath: repoPath, branchName: name, hash: detachedHash || 'HEAD'
        })
        if (res?.ok) { setIsDetachedHead(false); setDetachedHash(null); onRefresh?.() }
        else pushError(classifyGitError(res?.error || 'Could not create branch', 'branch'))
        break
      }

      case 'retry': {
        if (ctx.retryFn) await ctx.retryFn()
        else { onRefresh?.(); onRefreshStatus?.() }
        break
      }

      default:
        break
    }
  }, [repoPath, onRefresh, onRefreshStatus, onFocusWip, pushError, detachedHash])

  return {
    errors,
    conflictState,
    isDetachedHead,
    detachedHash,
    runGit,
    dismissError,
    handleToastAction,
    setConflictState,
    checkDetachedHead,
    pushError,
  }
}
