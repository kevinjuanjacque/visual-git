import { useState, useEffect, useCallback } from 'react'
import { formatDate } from '../utils/time'

/**
 * Panel derecho dual-mode:
 *  - Modo A: Commit histórico → metadata + archivos modificados + diff
 *  - Modo B: Nodo WIP → Staged / Unstaged con staging granular + formulario de commit
 */
export default function CommitDetail({
  commit, repoPath,
  staged, unstaged, untracked,
  conflictedFiles = [],
  onStageFiles, onUnstageFiles, onCommit, onRefreshStatus,
  onFileClick
}) {

  // ── Modo WIP ──────────────────────────────────────────────────────────────
  if (commit?.isWip) {
    return (
      <WipPanel
        repoPath={repoPath}
        staged={staged}
        unstaged={unstaged}
        untracked={untracked}
        conflictedFiles={conflictedFiles}
        onStageFiles={onStageFiles}
        onUnstageFiles={onUnstageFiles}
        onCommit={onCommit}
        onRefreshStatus={onRefreshStatus}
        onFileClick={onFileClick}
      />
    )
  }

  // ── Placeholder ───────────────────────────────────────────────────────────
  if (!commit) {
    return (
      <div className="w-80 shrink-0 flex items-center justify-center h-full bg-surface-850 border-l border-surface-700/60 text-[11px] text-slate-600">
        Selecciona un commit
      </div>
    )
  }

  // ── Modo histórico ────────────────────────────────────────────────────────
  return <HistoricPanel commit={commit} repoPath={repoPath} onFileClick={onFileClick} />
}

// ── Historic Commit Panel ────────────────────────────────────────────────────

function HistoricPanel({ commit, repoPath, onFileClick }) {
  const [detail,  setDetail]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [tab,     setTab]     = useState('info')    // 'info' | 'diff'
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileDiff, setFileDiff] = useState(null)
  const [loadingDiff, setLoadingDiff] = useState(false)

  useEffect(() => {
    if (!commit || !repoPath) { setDetail(null); return }
    setLoading(true)
    setDetail(null)
    setSelectedFile(null)
    setFileDiff(null)
    window.electronAPI
      .getCommitDetail({ folderPath: repoPath, hash: commit.hash })
      .then(d => setDetail(d))
      .catch(e => setDetail({ error: e.message }))
      .finally(() => setLoading(false))
  }, [commit?.hash, repoPath])

  function handleFileClick(fileObj) {
    if (selectedFile === fileObj.file) { 
      setSelectedFile(null)
      onFileClick?.(null)
      return 
    }
    setSelectedFile(fileObj.file)
    onFileClick?.({ file: fileObj.file, commitHash: commit.hash })
  }

  return (
    <aside className="w-80 shrink-0 flex flex-col bg-surface-850 border-l border-surface-700/60 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-700/60 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <code className="text-brand-400 text-[11px] font-mono bg-surface-900 px-2 py-0.5 rounded">
            {commit.shortHash}
          </code>
          {commit.isHead && (
            <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded-sm font-medium ring-1 ring-emerald-500/25">
              HEAD
            </span>
          )}
        </div>
        <p className="text-[13px] text-white font-medium leading-snug break-words">{commit.subject}</p>
        <div className="flex items-center gap-2 mt-2">
          <div className="w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center text-[10px] text-brand-400 font-bold shrink-0">
            {commit.authorName?.[0]?.toUpperCase()}
          </div>
          <span className="text-[11px] text-slate-400">{commit.authorName}</span>
          <span className="text-[11px] text-slate-600 ml-auto">{formatDate(commit.date)}</span>
        </div>
      </div>

      {/* Branch/tag badges */}
      {(commit.branches?.length > 0 || commit.tags?.length > 0) && (
        <div className="px-4 py-2 border-b border-surface-700/60 flex flex-wrap gap-1.5 shrink-0">
          {commit.branches?.map(b => {
            const isHead   = commit.isHead && !b.startsWith('remotes/')
            const isRemote = b.startsWith('remotes/') || b.startsWith('origin/')
            const label    = b.replace('remotes/', '').replace('origin/', '')
            return (
              <span key={b} className={`inline-flex items-center gap-0.5 text-[10px] font-mono px-2 py-0.5 rounded-sm ${
                isHead ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25'
                : isRemote ? 'bg-surface-700 text-slate-500'
                : 'bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/25'
              }`}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                  <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/>
                </svg>
                {label}
              </span>
            )
          })}
          {commit.tags?.map(tag => (
            <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] font-mono px-2 py-0.5 rounded-sm bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Parents */}
      {commit.parents?.length > 0 && (
        <div className="px-4 py-2 border-b border-surface-700/60 shrink-0">
          <span className="text-[11px] text-slate-500">
            Padre{commit.parents.length > 1 ? 's' : ''}:{' '}
            {commit.parents.map(p => (
              <code key={p} className="font-mono text-slate-400 text-[11px] ml-1">{p.substring(0, 7)}</code>
            ))}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-surface-700/60 shrink-0">
        {['info', 'diff'].map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'info') { setSelectedFile(null); setFileDiff(null) } }}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
              tab === t ? 'text-brand-400 border-b-2 border-brand-500' : 'text-slate-500 hover:text-slate-300'
            }`}>
            {t === 'info' ? 'Archivos' : 'Diff'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto text-[11px] font-mono">
        {loading && (
          <div className="flex items-center justify-center h-16 text-slate-500 gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            Cargando...
          </div>
        )}
        {detail?.error && <p className="p-4 text-red-400">{detail.error}</p>}

        {detail && !detail.error && tab === 'info' && (
          <FileStatClickable files={detail.files} onFileClick={handleFileClick} selectedFile={selectedFile} />
        )}

        {detail && !detail.error && tab === 'diff' && (
          <DiffView raw={detail.diff} />
        )}
      </div>
    </aside>
  )
}

// ── WIP Staging Panel ────────────────────────────────────────────────────────

function WipPanel({ repoPath, staged, unstaged, untracked, conflictedFiles = [], onStageFiles, onUnstageFiles, onCommit, onRefreshStatus, onFileClick }) {
  const [commitType,    setCommitType]    = useState('feat')
  const [commitScope,   setCommitScope]   = useState('')
  const [commitSubject, setCommitSubject] = useState('')
  const [commitBody,    setCommitBody]    = useState('')
  const [isBreaking,    setIsBreaking]    = useState(false)
  const [committing,  setCommitting]  = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedFiles, setSelectedFiles] = useState(new Set()) // multi-select

  const allUnstaged = [...unstaged, ...untracked]

  async function loadFileDiff(file, isCached) {
    if (selectedFile?.path === file.path && selectedFile?.cached === isCached) {
      setSelectedFile(null)
      onFileClick?.(null)
      return
    }
    setSelectedFile({ ...file, cached: isCached })
    onFileClick?.({ file: file.path, isWip: true, cached: isCached })
  }

  function toggleFileSelect(path, e) {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        if (next.has(path)) next.delete(path)
        else next.add(path)
      } else {
        next.clear()
        if (!prev.has(path) || prev.size > 1) next.add(path)
      }
      return next
    })
  }

  async function handleCommit() {
    if (!commitSubject.trim() || staged.length === 0) return
    setCommitting(true)
    const summary = `${commitType}${commitScope.trim() ? `(${commitScope.trim()})` : ''}${isBreaking ? '!' : ''}: ${commitSubject.trim()}`
    const description = commitBody.trim()
    await onCommit?.(summary, description)
    setCommitSubject('')
    setCommitScope('')
    setCommitBody('')
    setIsBreaking(false)
    setCommitting(false)
  }

  return (
    <aside className="w-80 shrink-0 flex flex-col bg-surface-850 border-l border-surface-700/60 overflow-hidden">
      {/* WIP Header */}
      <div className="px-4 py-3 border-b border-surface-700/60 shrink-0 flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-slate-700/60 border border-slate-600 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </div>
        <div>
          <div className="text-[13px] text-white font-semibold">// WIP</div>
          <div className="text-[10px] text-slate-500">
            {staged.length} staged · {allUnstaged.length} sin stagear
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">

        {/* ── Conflicted Files (only shown when there's a merge/rebase conflict) ── */}
        {conflictedFiles.length > 0 && (
          <div className="shrink-0 border-b border-red-700/30 bg-red-950/20">
            <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
              <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Conflictos ({conflictedFiles.length})
              </span>
            </div>
            <ul className="px-1.5 pb-2 space-y-0.5">
              {conflictedFiles.map(f => (
                <li key={f} className="flex items-center gap-2 px-2 py-1 rounded text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/20">
                  <span className="font-bold text-[12px]">!</span>
                  <span className="truncate flex-1">{f}</span>
                  <span className="text-[9px] text-red-600 shrink-0">conflict</span>
                </li>
              ))}
            </ul>
            <p className="px-3 pb-2.5 text-[10px] text-red-600/80 italic">
              Resolvé los conflictos y luego stagea los archivos para continuar.
            </p>
          </div>
        )}

        {/* ── Unstaged Files ── */}
        <div className="shrink-0">
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Sin Stagear ({allUnstaged.length})
            </span>
            {allUnstaged.length > 0 && (
              <button
                onClick={() => onStageFiles?.(allUnstaged.map(f => f.path))}
                className="text-[10px] text-brand-400 hover:text-brand-300 font-medium transition-colors"
              >
                Stage All
              </button>
            )}
          </div>
          {allUnstaged.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-700">Sin cambios</p>
          ) : (
            <ul className="px-1.5 pb-1 space-y-0.5">
              {allUnstaged.map(file => (
                <FileRow
                  key={file.path}
                  file={file}
                  isSelected={selectedFiles.has(file.path)}
                  isExpanded={selectedFile?.path === file.path && !selectedFile?.cached}
                  onRowClick={(e) => { toggleFileSelect(file.path, e); loadFileDiff(file, false) }}
                  onStage={() => onStageFiles?.([file.path])}
                  onDiscard={() => handleDiscard(file.path)}
                  mode="unstaged"
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── Staged Files ── */}
        <div className="shrink-0 border-t border-surface-700/60">
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Staged ({staged.length})
            </span>
            {staged.length > 0 && (
              <button
                onClick={() => onUnstageFiles?.(staged.map(f => f.path))}
                className="text-[10px] text-slate-400 hover:text-slate-300 font-medium transition-colors"
              >
                Unstage All
              </button>
            )}
          </div>
          {staged.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-700">Nada staged aún</p>
          ) : (
            <ul className="px-1.5 pb-1 space-y-0.5">
              {staged.map(file => (
                <FileRow
                  key={file.path}
                  file={file}
                  isSelected={selectedFiles.has(file.path)}
                  isExpanded={selectedFile?.path === file.path && selectedFile?.cached}
                  onRowClick={(e) => { toggleFileSelect(file.path, e); loadFileDiff(file, true) }}
                  onUnstage={() => onUnstageFiles?.([file.path])}
                  mode="staged"
                />
              ))}
            </ul>
          )}
        </div>

        {/* ── Conventional Commit Form ── */}
        <div className="mt-auto border-t border-surface-700/60 p-3 shrink-0 bg-surface-850">
          <div className="flex items-center gap-2 mb-2">
            <select
              value={commitType}
              onChange={e => setCommitType(e.target.value)}
              className="bg-surface-900 border border-surface-600 rounded-md px-2 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-brand-500 transition-colors w-[90px] shrink-0"
            >
              <option value="feat">feat</option>
              <option value="fix">fix</option>
              <option value="docs">docs</option>
              <option value="style">style</option>
              <option value="refactor">refactor</option>
              <option value="perf">perf</option>
              <option value="test">test</option>
              <option value="build">build</option>
              <option value="ci">ci</option>
              <option value="chore">chore</option>
              <option value="revert">revert</option>
            </select>
            <input
              value={commitScope}
              onChange={e => setCommitScope(e.target.value)}
              placeholder="scope (opc)"
              className="flex-1 bg-surface-900 border border-surface-600 rounded-md px-2 py-1.5 text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <input
            value={commitSubject}
            onChange={e => setCommitSubject(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleCommit() }}
            placeholder="Sujeto del commit (requerido)"
            className="w-full bg-surface-900 border border-surface-600 rounded-md px-3 py-1.5 text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors mb-2"
          />
          <textarea
            value={commitBody}
            onChange={e => setCommitBody(e.target.value)}
            placeholder="Descripción extendida (opcional)"
            rows={2}
            className="w-full bg-surface-900 border border-surface-600 rounded-md px-3 py-1.5 text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-500 transition-colors mb-2 resize-none"
          />
          <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              id="breaking-change"
              checked={isBreaking}
              onChange={e => setIsBreaking(e.target.checked)}
              className="accent-brand-500 rounded cursor-pointer"
            />
            <label htmlFor="breaking-change" className="text-[11px] text-red-400 cursor-pointer select-none font-medium">
              ⚠️ Breaking Change
            </label>
          </div>

          <button
            onClick={handleCommit}
            disabled={!commitSubject.trim() || staged.length === 0 || committing || conflictedFiles.length > 0}
            className="w-full py-2 text-sm font-semibold rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed
              bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-900/30"
          >
            {committing
              ? <span className="flex items-center justify-center gap-2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                  Commiteando...
                </span>
              : `Commit (${staged.length} archivo${staged.length !== 1 ? 's' : ''})`
            }
          </button>
          {conflictedFiles.length > 0 && (
            <p className="text-[10px] text-red-500 text-center mt-1.5">⚠️ Resolvé los {conflictedFiles.length} conflicto{conflictedFiles.length !== 1 ? 's' : ''} antes de commitear</p>
          )}
          {staged.length === 0 && conflictedFiles.length === 0 && (
            <p className="text-[10px] text-slate-600 text-center mt-1.5">Stagea al menos un archivo para commitear</p>
          )}
        </div>
      </div>
    </aside>
  )

  async function handleDiscard(filePath) {
    if (!window.confirm(`¿Descarta los cambios en "${filePath}"? Esta acción no se puede deshacer.`)) return
    try {
      await window.electronAPI.checkout({ folderPath: repoPath, branch: `-- ${filePath}` })
      onRefreshStatus?.()
    } catch { /* ignore */ }
  }
}

// ── FileRow ──────────────────────────────────────────────────────────────────

function FileRow({ file, isSelected, isExpanded, onRowClick, onStage, onUnstage, onDiscard, mode }) {
  const kindColor = {
    modified:  'text-amber-400',
    added:     'text-emerald-400',
    deleted:   'text-red-400',
    untracked: 'text-blue-400',
  }[file.kind] || 'text-slate-400'

  const kindLetter = { modified: 'M', added: 'A', deleted: 'D', untracked: '?' }[file.kind] || '·'

  return (
    <li>
      <div
        onClick={onRowClick}
        className={`group flex items-center gap-2 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors select-none ${
          isSelected || isExpanded
            ? 'bg-brand-500/15 text-slate-200'
            : 'hover:bg-surface-700 text-slate-400'
        }`}
      >
        <span className={`shrink-0 font-bold font-mono text-[10px] w-3 ${kindColor}`}>{kindLetter}</span>
        <span className="truncate flex-1 font-mono">{file.path.split('/').pop()}</span>
        <span className="text-[9px] text-slate-700 truncate hidden group-hover:block max-w-[80px]">
          {file.path}
        </span>

        {/* Hover action buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {mode === 'unstaged' && (
            <>
              <button
                onClick={e => { e.stopPropagation(); onStage?.() }}
                title="Stage file"
                className="w-5 h-5 rounded bg-brand-500/25 text-brand-400 hover:bg-brand-500/50 flex items-center justify-center font-bold text-[10px]"
              >S</button>
              {onDiscard && (
                <button
                  onClick={e => { e.stopPropagation(); onDiscard?.() }}
                  title="Descartar cambios"
                  className="w-5 h-5 rounded bg-red-500/15 text-red-400 hover:bg-red-500/30 flex items-center justify-center"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                  </svg>
                </button>
              )}
            </>
          )}
          {mode === 'staged' && (
            <button
              onClick={e => { e.stopPropagation(); onUnstage?.() }}
              title="Unstage file"
              className="w-5 h-5 rounded bg-slate-500/25 text-slate-400 hover:bg-slate-500/50 flex items-center justify-center font-bold text-[10px]"
            >U</button>
          )}
        </div>
      </div>
    </li>
  )
}

// ── File Stats (clickable) ────────────────────────────────────────────────────

function FileStatClickable({ files, onFileClick, selectedFile }) {
  const [viewMode, setViewMode] = useState('path') // 'path' or 'tree'

  if (!files || files.length === 0) return null

  // A=Added, D=Deleted, M=Modified
  function getIcon(status) {
    if (status === 'A') return <span className="text-emerald-400 font-bold text-[14px] leading-none shrink-0">+</span>
    if (status === 'D') return <span className="text-red-400 font-bold text-[14px] leading-none shrink-0">-</span>
    return <span className="text-amber-400 text-[12px] leading-none shrink-0">✏️</span>
  }

  // Build tree data structure
  const treeRoot = { name: 'root', children: {}, isFile: false, path: '' }
  files.forEach(f => {
    const parts = f.file.split('/')
    let current = treeRoot
    let currentPath = ''
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]
      currentPath += (currentPath ? '/' : '') + p
      if (!current.children[p]) {
        current.children[p] = { name: p, children: {}, isFile: false, path: currentPath }
      }
      current = current.children[p]
    }
    const fileName = parts[parts.length - 1]
    current.children[fileName] = { ...f, name: fileName, isFile: true, path: f.file }
  })

  return (
    <div className="flex flex-col h-full">
      {/* Header controls */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-surface-700/60 bg-surface-850/50 sticky top-0 z-10">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
          {files.length} modificados
        </span>
        <div className="flex rounded overflow-hidden border border-surface-600 bg-surface-800">
          <button 
            onClick={() => setViewMode('path')}
            className={`px-2 py-1 text-[10px] font-medium flex items-center gap-1.5 transition-colors ${viewMode === 'path' ? 'bg-surface-600 text-slate-200' : 'text-slate-400 hover:bg-surface-700'}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            Path
          </button>
          <button 
            onClick={() => setViewMode('tree')}
            className={`px-2 py-1 text-[10px] font-medium flex items-center gap-1.5 border-l border-surface-600 transition-colors ${viewMode === 'tree' ? 'bg-surface-600 text-slate-200' : 'text-slate-400 hover:bg-surface-700'}`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Tree
          </button>
        </div>
      </div>

      <div className="p-2 space-y-0.5">
        {viewMode === 'path' && files.map((fileObj, i) => {
        const isSelected = selectedFile === fileObj.file
        return (
          <div
            key={i}
            onClick={() => onFileClick?.(fileObj)}
            className={`flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer transition-colors ${
              isSelected ? 'bg-brand-500/15' : 'hover:bg-surface-700/60'
            }`}
          >
            <div className="w-4 flex items-center justify-center">
              {getIcon(fileObj.status)}
            </div>
            <span className="text-slate-400 truncate flex-1">{fileObj.file}</span>
            {fileObj.adds > 0 && <span className="text-emerald-400 shrink-0">+{fileObj.adds}</span>}
            {fileObj.dels > 0 && <span className="text-red-400 shrink-0">-{fileObj.dels}</span>}
          </div>
        )
      })}
        
        {viewMode === 'tree' && (
          <div className="py-1">
            {Object.values(treeRoot.children)
              .sort((a, b) => a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1)
              .map(node => (
                <FileTreeNode 
                  key={node.path} 
                  node={node} 
                  level={0} 
                  selectedFile={selectedFile} 
                  onFileClick={onFileClick} 
                  getIcon={getIcon}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FileTreeNode({ node, level, selectedFile, onFileClick, getIcon }) {
  const [isOpen, setIsOpen] = useState(true)

  if (node.isFile) {
    const isSelected = selectedFile === node.file
    return (
      <div
        onClick={() => onFileClick?.(node)}
        className={`flex items-center gap-2 py-1 rounded cursor-pointer transition-colors ${isSelected ? 'bg-brand-500/15' : 'hover:bg-surface-700/60'}`}
        style={{ paddingLeft: `${(level * 12) + 8}px`, paddingRight: '8px' }}
      >
        <div className="w-4 flex items-center justify-center">
          {getIcon(node.status)}
        </div>
        <span className="text-slate-400 truncate flex-1">{node.name}</span>
        {node.adds > 0 && <span className="text-emerald-400 shrink-0">+{node.adds}</span>}
        {node.dels > 0 && <span className="text-red-400 shrink-0">-{node.dels}</span>}
      </div>
    )
  }

  // Folder
  return (
    <div>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer hover:bg-surface-700/40 text-slate-400 transition-colors"
        style={{ paddingLeft: `${(level * 12) + 8}px` }}
      >
        <svg 
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform shrink-0 ${isOpen ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-slate-500">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span className="truncate flex-1 font-medium">{node.name}</span>
      </div>
      
      {isOpen && (
        <div>
          {Object.values(node.children)
            .sort((a, b) => a.isFile === b.isFile ? a.name.localeCompare(b.name) : a.isFile ? 1 : -1)
            .map(child => (
              <FileTreeNode 
                key={child.path} 
                node={child} 
                level={level + 1} 
                selectedFile={selectedFile} 
                onFileClick={onFileClick} 
                getIcon={getIcon}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// ── Diff view ─────────────────────────────────────────────────────────────────

function DiffView({ raw, maxLines }) {
  if (!raw) return null
  let lines = raw.split('\n')
  const truncated = maxLines && lines.length > maxLines
  if (truncated) lines = lines.slice(0, maxLines)

  return (
    <div className="p-0 font-mono text-[11px]">
      {lines.map((line, i) => {
        let cls = 'text-slate-500'
        if (line.startsWith('+++') || line.startsWith('---')) cls = 'text-slate-400 font-medium'
        else if (line.startsWith('+')) cls = 'text-emerald-400 bg-emerald-900/15'
        else if (line.startsWith('-')) cls = 'text-red-400 bg-red-900/15'
        else if (line.startsWith('@@'))   cls = 'text-brand-400 bg-brand-500/5'
        else if (line.startsWith('diff ')) cls = 'text-brand-400 font-medium bg-surface-800 py-1'

        return (
          <div key={i} className={`px-3 py-0 leading-5 whitespace-pre-wrap break-all ${cls}`}>
            {line || ' '}
          </div>
        )
      })}
      {truncated && (
        <div className="px-3 py-2 text-[10px] text-slate-600 italic">
          … {raw.split('\n').length - maxLines} líneas más (abre la pestaña Diff para ver todo)
        </div>
      )}
    </div>
  )
}
