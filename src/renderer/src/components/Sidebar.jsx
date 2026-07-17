import { useState } from 'react'

export default function Sidebar({
  repos, currentRepo, branches, currentBranch,
  tags, stashes,
  onSelectRepo, onOpenNewRepo, onRemoveRepo, onCheckout,
  onTagClick, onStashPop, onStashDrop
}) {
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [repoFilter, setRepoFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')

  function handleRemove(e, path) {
    e.stopPropagation()
    if (confirmRemove === path) {
      onRemoveRepo(path)
      setConfirmRemove(null)
    } else {
      setConfirmRemove(path)
      setTimeout(() => setConfirmRemove(null), 2500)
    }
  }

  const normalizedRepoFilter = repoFilter.trim().toLocaleLowerCase()
  const normalizedBranchFilter = branchFilter.trim().toLocaleLowerCase()
  const filteredRepos = repos.filter(repo => repo.toLocaleLowerCase().includes(normalizedRepoFilter))
  const localBranches = branches.filter(branch => !branch.startsWith('remotes/'))
  const remoteBranches = branches.filter(branch => branch.startsWith('remotes/'))
  const filteredLocalBranches = localBranches.filter(branch => branch.toLocaleLowerCase().includes(normalizedBranchFilter))
  const filteredRemoteBranches = remoteBranches.filter(branch => branch.toLocaleLowerCase().includes(normalizedBranchFilter))

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-surface-850 border-r border-surface-700/60 overflow-hidden">

      {/* Repo list */}
      <section className="shrink-0">
        <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Repositorios</span>
          <button onClick={onOpenNewRepo} title="Abrir repositorio" className="p-0.5 text-slate-500 hover:text-brand-400 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        {repos.length > 0 && (
          <FilterInput
            ariaLabel="Filtrar repositorios abiertos"
            value={repoFilter}
            onChange={setRepoFilter}
            placeholder="Filtrar repositorios..."
          />
        )}
        <ul className="px-1.5 pb-2 space-y-0.5 max-h-48 overflow-y-auto">
          {repos.length === 0 && (
            <li className="px-2 py-4 text-[11px] text-slate-600 text-center">Abre un repositorio con el botón +</li>
          )}
          {repos.length > 0 && filteredRepos.length === 0 && (
            <li className="px-2 py-4 text-[11px] text-slate-600 text-center">No hay repositorios que coincidan</li>
          )}
          {filteredRepos.map(repo => {
            const name     = repo.split('/').pop()
            const isActive = repo === currentRepo
            return (
              <li key={repo}>
                <button
                  onClick={() => onSelectRepo(repo)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors group ${
                    isActive ? 'bg-brand-500/15 text-brand-400' : 'text-slate-400 hover:bg-surface-700 hover:text-white'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                  <span className="truncate flex-1 text-left">{name}</span>
                  <button
                    onClick={e => handleRemove(e, repo)}
                    title={confirmRemove === repo ? 'Confirmar' : 'Eliminar'}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1 rounded ${
                      confirmRemove === repo ? 'text-red-400' : 'text-slate-600 hover:text-red-400'
                    }`}
                  >
                    {confirmRemove === repo ? '✓' : '×'}
                  </button>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="border-t border-surface-700/60" />

      {/* Scrollable reference list */}
      <section className="flex-1 overflow-y-auto">
        {currentRepo ? (
          <>
            <FilterInput
              ariaLabel="Filtrar ramas"
              value={branchFilter}
              onChange={setBranchFilter}
              placeholder="Filtrar ramas..."
            />
            <BranchGroup
              title="Local"
              branches={filteredLocalBranches}
              current={currentBranch}
              repoPath={currentRepo}
              onCheckout={onCheckout}
              emptyMessage={normalizedBranchFilter ? 'No hay ramas locales que coincidan' : 'No hay ramas locales'}
            />
            {(remoteBranches.length > 0 || normalizedBranchFilter) && (
              <BranchGroup
                title="Remoto"
                branches={filteredRemoteBranches}
                current=""
                repoPath={currentRepo}
                onCheckout={onCheckout}
                dimmed
                emptyMessage={normalizedBranchFilter ? 'No hay ramas remotas que coincidan' : 'No hay ramas remotas'}
              />
            )}
            {tags?.length > 0 && (
              <TagGroup tags={tags} onTagClick={onTagClick} />
            )}
            {stashes?.length > 0 && (
              <StashGroup stashes={stashes} onPop={onStashPop} onDrop={onStashDrop} />
            )}
            <p className="px-3 pb-2 text-[9px] text-slate-700 mt-1">
              Doble click en rama para hacer checkout
            </p>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-[11px] text-slate-600">
            Sin repositorio
          </div>
        )}
      </section>
    </aside>
  )
}

// ── BranchGroup ──────────────────────────────────────────────────────────────

function FilterInput({ ariaLabel, value, onChange, placeholder }) {
  return (
    <div className="px-2 pb-2 relative">
      <input
        aria-label={ariaLabel}
        type="search"
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full bg-surface-900 border border-surface-700/60 rounded px-2 py-1 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-brand-500"
      />
      {value && (
        <button
          type="button"
          aria-label={`Limpiar ${ariaLabel.toLocaleLowerCase()}`}
          onClick={() => onChange('')}
          className="absolute right-3 top-0.5 text-slate-500 hover:text-slate-300 text-base leading-none"
        >
          ×
        </button>
      )}
    </div>
  )
}

function BranchGroup({ title, branches, current, repoPath, onCheckout, dimmed = false, emptyMessage }) {
  const [open,           setOpen]           = useState(true)
  const [checking,       setChecking]       = useState(null)
  const [lastError,      setLastError]      = useState(null)
  const [justCheckedOut, setJustCheckedOut] = useState(null)

  async function handleDoubleClick(branch) {
    const localName = branch.replace(/^remotes\/[^/]+\//, '')
    if (localName === current) return
    setChecking(branch)
    setLastError(null)
    const result = await window.electronAPI.checkout({ folderPath: repoPath, branch })
    setChecking(null)
    if (result.ok) {
      setJustCheckedOut(branch)
      setTimeout(() => setJustCheckedOut(null), 2000)
      onCheckout?.(result.branch)
    } else {
      setLastError({ branch, msg: result.error })
      setTimeout(() => setLastError(null), 4000)
    }
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1 px-3 pt-3 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-400 transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        {title} ({branches.length})
      </button>

      {lastError && (
        <div className="mx-2 mb-1 px-2 py-1 bg-red-900/30 border border-red-700/40 rounded text-[10px] text-red-400 break-words">
          {lastError.msg}
        </div>
      )}

      {open && (
        <ul className="px-1.5 pb-2 space-y-0.5">
          {branches.length === 0 && (
            <li className="px-2 py-2 text-[11px] text-slate-600">{emptyMessage}</li>
          )}
          {branches.map(b => {
            const name       = b.replace(/^remotes\/[^/]+\//, '')
            const isCurrent  = b === current || name === current
            const isChecking = checking === b
            const isDone     = justCheckedOut === b
            return (
              <li key={b}>
                <div
                  onDoubleClick={() => handleDoubleClick(b)}
                  title={isCurrent ? 'Rama actual' : 'Doble click para checkout'}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors select-none ${
                    isCurrent  ? 'text-emerald-400 font-medium bg-emerald-500/10'
                    : isDone   ? 'text-emerald-400 bg-emerald-500/10'
                    : isChecking ? 'text-brand-400 bg-brand-500/10'
                    : dimmed   ? 'text-slate-600 hover:text-slate-400 hover:bg-surface-700'
                    : 'text-slate-400 hover:text-white hover:bg-surface-700'
                  }`}
                >
                  {isChecking ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                  ) : isDone ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" className="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                      <line x1="6" y1="3" x2="6" y2="15"/>
                      <circle cx="18" cy="6" r="3"/>
                      <circle cx="6" cy="18" r="3"/>
                      <path d="M18 9a9 9 0 01-9 9"/>
                    </svg>
                  )}
                  <span className="truncate flex-1">{name}</span>
                  {isCurrent && <svg width="8" height="8" viewBox="0 0 24 24" fill="#34d399" className="shrink-0 ml-auto"><circle cx="12" cy="12" r="8"/></svg>}
                  {isChecking && <span className="text-[9px] text-brand-400 ml-auto shrink-0">checkout...</span>}
                  {isDone && !isCurrent && <span className="text-[9px] text-emerald-400 ml-auto shrink-0">✓ listo</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── TagGroup ─────────────────────────────────────────────────────────────────

function TagGroup({ tags, onTagClick }) {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1 px-3 pt-3 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-400 transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        Tags ({tags.length})
      </button>
      {open && (
        <ul className="px-1.5 pb-2 space-y-0.5">
          {tags.map(tag => (
            <li key={tag}>
              <button
                onClick={() => onTagClick?.(tag)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] cursor-pointer transition-colors text-amber-500/80 hover:text-amber-400 hover:bg-surface-700 text-left"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
                <span className="truncate flex-1">{tag}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── StashGroup ───────────────────────────────────────────────────────────────

function StashGroup({ stashes, onPop, onDrop }) {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1 px-3 pt-3 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider hover:text-slate-400 transition-colors"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        Stashes ({stashes.length})
      </button>
      {open && (
        <ul className="px-1.5 pb-2 space-y-0.5">
          {stashes.map(s => (
            <li key={s.ref} className="group">
              <div className="flex items-start gap-1 px-2 py-1.5 rounded hover:bg-surface-700 transition-colors">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="shrink-0 mt-0.5">
                  <polyline points="21 8 21 21 3 21 3 8"/>
                  <rect x="1" y="3" width="22" height="5"/>
                  <line x1="10" y1="12" x2="14" y2="12"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-slate-500 font-mono">{s.ref}</div>
                  <div className="text-[11px] text-slate-400 truncate">{s.message || '(sin mensaje)'}</div>
                </div>
                <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onPop?.(s.ref)}
                    title="Pop stash"
                    className="text-[9px] px-1 py-0.5 rounded bg-brand-500/20 text-brand-400 hover:bg-brand-500/40 font-medium"
                  >
                    Pop
                  </button>
                  <button
                    onClick={() => onDrop?.(s.ref)}
                    title="Drop stash"
                    className="text-[9px] px-1 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/30 font-medium"
                  >
                    Drop
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
