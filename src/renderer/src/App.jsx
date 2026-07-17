import { useState, useEffect, useCallback, useRef } from 'react'
import Login        from './components/Login'
import Header       from './components/Header'
import Sidebar      from './components/Sidebar'
import GitGraph     from './components/GitGraph'
import CommitDetail from './components/CommitDetail'
import DiffViewOverlay from './components/DiffViewOverlay'
import { GitErrorToast, ConflictBanner, DetachedHeadBanner } from './components/GitErrorToast'
import { useGitData }   from './hooks/useGitData'
import { useGitStatus } from './hooks/useGitStatus'
import { useGitErrors } from './hooks/useGitErrors'
import { classifyGitError } from './utils/gitErrors'

export default function App() {
  const [user,           setUser]           = useState(null)
  const [loadingAuth,    setLoadingAuth]     = useState(true)
  const [currentRepo,    setCurrentRepo]     = useState(null)
  const [repos,          setRepos]           = useState([])
  const [selectedCommit, setSelectedCommit] = useState(null)
  const [scrollToHash,   setScrollToHash]   = useState(null)
  const [pinnedBranches, setPinnedBranches] = useState([])
  const [promptConfig,   setPromptConfig]   = useState(null)
  const [selectedDiffFile, setSelectedDiffFile] = useState(null)

  const showPrompt = useCallback((title) => {
    return new Promise((resolve) => {
      setPromptConfig({ title, resolve })
    })
  }, [])

  // Load pinned branches for this repo when repo changes
  useEffect(() => {
    if (!currentRepo) {
      setPinnedBranches([])
      return
    }
    try {
      const stored = localStorage.getItem(`pinned:${currentRepo}`)
      setPinnedBranches(stored ? JSON.parse(stored) : [])
    } catch {
      setPinnedBranches([])
    }
  }, [currentRepo])

  const togglePin = useCallback((branchName) => {
    if (!currentRepo) return
    setPinnedBranches(prev => {
      const isPinned = prev.includes(branchName)
      const next = isPinned ? prev.filter(b => b !== branchName) : [...prev, branchName]
      localStorage.setItem(`pinned:${currentRepo}`, JSON.stringify(next))
      return next
    })
  }, [currentRepo])

  // Git log data
  const { commits, branches, currentBranch, loading, error, lastRefresh, nextRefresh, refresh, networkRefresh, hasMore, loadMoreCommits } =
    useGitData(currentRepo, pinnedBranches)

  // Git working-tree status (WIP, staging, tags, stashes)
  const { staged, unstaged, untracked, hasWip, tags, stashes, refreshStatus } =
    useGitStatus(currentRepo)

  // Ref for focusing the WIP panel from error actions
  const focusWipRef = useRef(null)
  const focusWip = useCallback(() => {
    // If we have a WIP commit, select it
    focusWipRef.current?.()
  }, [])

  // ── Error system ──────────────────────────────────────────────────────────
  const {
    errors, conflictState, isDetachedHead, detachedHash,
    runGit, dismissError, handleToastAction, setConflictState,
    checkDetachedHead, pushError
  } = useGitErrors({
    repoPath: currentRepo,
    onRefresh: refresh,
    onRefreshStatus: refreshStatus,
    onFocusWip: focusWip,
  })

  // Check detached HEAD status whenever status updates
  useEffect(() => {
    if (!currentRepo) return
    window.electronAPI.getStatus(currentRepo).then(res => {
      if (res?.ok) checkDetachedHead(res.status)
    }).catch(() => {})
  }, [currentRepo, commits, checkDetachedHead])

  // ── Bootstrap: check stored session ────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [storedUser, storedRepos] = await Promise.all([
        window.electronAPI.getUser(),
        window.electronAPI.getRepos()
      ])
      setUser(storedUser)
      setRepos(storedRepos)
      if (storedRepos.length > 0) setCurrentRepo(storedRepos[0])
      setLoadingAuth(false)
    }
    init()

    const offSuccess = window.electronAPI.onAuthSuccess(u => { setUser(u) })
    const offError   = window.electronAPI.onAuthError(e  => {
      pushError(classifyGitError(`authentication failed: ${e}`, 'auth'))
    })

    const pollId = setInterval(async () => {
      const u = await window.electronAPI.getUser()
      if (u) { setUser(u); clearInterval(pollId) }
    }, 2000)

    return () => { offSuccess?.(); offError?.(); clearInterval(pollId) }
  }, [pushError])

  // ── Git Actions (all wrapped in runGit) ─────────────────────────────────────

  const handleCheckout = useCallback(() => { refresh(); refreshStatus() }, [refresh, refreshStatus])

  async function handleOpenRepo() {
    const path = await window.electronAPI.openFolder()
    if (!path) return
    const isValid = await window.electronAPI.validateRepo(path)
    if (!isValid) {
      pushError(classifyGitError('not a git repository', 'open'))
      return
    }
    const updated = await window.electronAPI.addRepo(path)
    setRepos(updated)
    setCurrentRepo(path)
    setSelectedCommit(null)
  }

  async function handleSelectRepo(path) {
    setCurrentRepo(path)
    setSelectedCommit(null)
  }

  async function handleRemoveRepo(path) {
    const updated = await window.electronAPI.removeRepo(path)
    setRepos(updated)
    if (currentRepo === path) { setCurrentRepo(updated[0] ?? null); setSelectedCommit(null) }
  }

  async function handleLogout() { await window.electronAPI.logout(); setUser(null) }

  // ── Staging actions ─────────────────────────────────────────────────────────

  async function handleStageFiles(files) {
    await runGit(() => window.electronAPI.stage({ folderPath: currentRepo, files }), 'stage')
    refreshStatus()
  }

  async function handleUnstageFiles(files) {
    await runGit(() => window.electronAPI.unstage({ folderPath: currentRepo, files }), 'unstage')
    refreshStatus()
  }

  async function handleCommit(summary, description) {
    const res = await runGit(
      () => window.electronAPI.gitCommit({ folderPath: currentRepo, summary, description }),
      'commit'
    )
    if (res?.ok !== false) { refresh(); refreshStatus(); setSelectedCommit(null) }
  }

  // ── Toolbar actions ─────────────────────────────────────────────────────────

  async function handlePull() {
    await runGit(
      async () => {
        const res = await window.electronAPI.pull(currentRepo)
        if (!res?.ok) throw new Error(res?.error || 'Pull failed')
        return res
      },
      'pull',
      { branch: currentBranch }
    )
    refresh(); refreshStatus()
  }

  async function handlePush(force = false) {
    await runGit(
      async () => {
        const res = await window.electronAPI.push({ folderPath: currentRepo, force })
        if (!res?.ok) throw new Error(res?.error || 'Push failed')
        return res
      },
      'push'
    )
    refresh()
  }

  async function handleStash() {
    await runGit(
      async () => {
        const res = await window.electronAPI.stashSave({ folderPath: currentRepo })
        if (!res?.ok) throw new Error(res?.error || 'Stash failed')
        return res
      },
      'stash'
    )
    refresh(); refreshStatus()
  }

  async function handleStashPop(ref) {
    await runGit(
      async () => {
        const res = await window.electronAPI.stashPop({ folderPath: currentRepo, ref })
        if (!res?.ok) throw new Error(res?.error || 'Stash pop failed')
        return res
      },
      'stash pop'
    )
    refresh(); refreshStatus()
  }

  async function handleStashDrop(ref) {
    const res = await window.electronAPI.stashDrop({ folderPath: currentRepo, ref })
    if (res?.ok) refreshStatus()
  }

  async function handleCheckoutBranch(data) {
    await runGit(
      async () => {
        const res = await window.electronAPI.checkout(data)
        if (!res?.ok) throw new Error(res?.error || 'Checkout failed')
        return res
      },
      'checkout',
      { branch: data.branch }
    )
    refresh(); refreshStatus()
  }

  // ── Detached HEAD: create branch ────────────────────────────────────────────

  async function handleCreateBranchFromDetached() {
    const name = await showPrompt('Crear rama en el commit actual:\nIngresa el nombre:')
    if (!name) return
    await runGit(
      async () => {
        const res = await window.electronAPI.createBranch({ folderPath: currentRepo, branchName: name, hash: 'HEAD' })
        if (!res?.ok) throw new Error(res?.error || 'Branch creation failed')
        return res
      },
      'branch'
    )
    refresh()
  }

  // ── Conflict abort ──────────────────────────────────────────────────────────

  async function handleAbortConflict(type) {
    let res
    if (type === 'merge')       res = await window.electronAPI.abortMerge(currentRepo)
    else if (type === 'rebase') res = await window.electronAPI.abortRebase(currentRepo)
    else if (type === 'cherry_pick') res = await window.electronAPI.abortCherryPick(currentRepo)
    if (res?.ok !== false) { setConflictState(null); refresh(); refreshStatus() }
    else pushError(classifyGitError(res?.error || 'Abort failed', `${type} --abort`))
  }

  // ── Loading splash ──────────────────────────────────────────────────────────
  if (loadingAuth) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-900">
        <div className="flex items-center gap-3 text-slate-400 text-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" className="animate-spin">
            <path d="M21 12a9 9 0 11-6.219-8.56"/>
          </svg>
          Iniciando GitVisual...
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  // Build WIP commit synthetic node
  const wipCommit = hasWip ? {
    hash: 'WIP', shortHash: 'WIP', isWip: true, subject: '// WIP', col: 0,
    parents: commits.length ? [commits[0].hash] : [],
    branches: [], tags: [], isHead: false, authorName: '', date: new Date().toISOString(),
    connections: commits.length ? [{ fromCol: 0, toCol: 0, toHash: commits[0].hash, type: 'continue' }] : [],
    activeLanes: [], color: '#64748b', totalCols: 1
  } : null

  const graphCommits = wipCommit ? [wipCommit, ...commits] : commits

  // Register the WIP focus function
  focusWipRef.current = () => {
    if (wipCommit) setSelectedCommit(wipCommit)
  }

  return (
    <div className="flex flex-col h-screen bg-surface-900 text-slate-300 overflow-hidden">
      <Header
        user={user}
        repoPath={currentRepo}
        loading={loading}
        lastRefresh={lastRefresh}
        nextRefresh={nextRefresh}
        hasWip={hasWip}
        onRefresh={networkRefresh}
        onOpenRepo={handleOpenRepo}
        onLogout={handleLogout}
        onPull={handlePull}
        onPush={handlePush}
        onStash={handleStash}
        onNewBranch={async (name) => {
          await runGit(
            async () => {
              const res = await window.electronAPI.createBranch({ folderPath: currentRepo, branchName: name, hash: 'HEAD' })
              if (!res?.ok) throw new Error(res?.error || 'Branch creation failed')
              return res
            },
            'branch'
          )
          refresh()
        }}
        onOpenInVSCode={async () => {
          if (!currentRepo) return
          const res = await window.electronAPI.openInVSCode(currentRepo)
          if (!res?.ok) {
            setErrors(prev => [...prev, { id: Date.now(), msg: `Error abriendo VS Code: ${res?.error}` }])
          }
        }}
        onOpenInGitHub={async () => {
          if (!currentRepo) return
          const res = await window.electronAPI.openInGitHub(currentRepo)
          if (!res?.ok) {
            setErrors(prev => [...prev, { id: Date.now(), msg: `Error abriendo GitHub: ${res?.error}` }])
          }
        }}
      />

      {/* Banners: Conflict mode and Detached HEAD */}
      {conflictState && (
        <ConflictBanner
          type={conflictState.type}
          conflictedFiles={conflictState.files}
          onAbort={handleAbortConflict}
          onOpenConflicts={() => { if (wipCommit) setSelectedCommit(wipCommit) }}
        />
      )}

      {isDetachedHead && !conflictState && (
        <DetachedHeadBanner
          hash={detachedHash}
          onCreateBranch={handleCreateBranchFromDetached}
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          repos={repos}
          currentRepo={currentRepo}
          branches={branches}
          currentBranch={currentBranch}
          tags={tags}
          stashes={stashes}
          onSelectRepo={handleSelectRepo}
          onOpenNewRepo={handleOpenRepo}
          onRemoveRepo={handleRemoveRepo}
          onCheckout={handleCheckout}
          onTagClick={(tagHash) => setScrollToHash(tagHash)}
          onStashPop={handleStashPop}
          onStashDrop={handleStashDrop}
        />

        <main className="flex-1 overflow-hidden relative">
          <GitGraph
            commits={graphCommits}
            selectedHash={selectedCommit?.hash}
            hasMore={hasMore}
            onLoadMore={loadMoreCommits}
            onSelectCommit={(commit) => {
              setSelectedCommit(commit)
              setSelectedDiffFile(null) // clear diff view when changing commit
            }}
            loading={loading}
            error={error}
            repoPath={currentRepo}
            onRefresh={() => { networkRefresh(); refreshStatus() }}
            scrollToHash={scrollToHash}
            onScrollHandled={() => setScrollToHash(null)}
            conflictedFiles={conflictState?.files || []}
            pinnedBranches={pinnedBranches}
            onTogglePin={togglePin}
            onGitAction={async (action, commit, extra) => {
              // Route graph context menu actions through runGit
              await runGit(
                async () => {
                  let res
                  switch (action) {
                    case 'checkout':
                      res = await window.electronAPI.checkout({ folderPath: currentRepo, branch: commit.hash })
                      break
                    case 'checkout-branch':
                      res = await window.electronAPI.checkout({ folderPath: currentRepo, branch: extra })
                      break
                    case 'branch': {
                      const name = await showPrompt(`Crear rama en ${commit.shortHash}\nIngresa el nombre:`)
                      if (!name) return { ok: true }
                      res = await window.electronAPI.createBranch({ folderPath: currentRepo, branchName: name, hash: commit.hash })
                      break
                    }
                    case 'merge':
                      res = await window.electronAPI.merge({ folderPath: currentRepo, target: commit.hash })
                      break
                    case 'rebase':
                      res = await window.electronAPI.rebase({ folderPath: currentRepo, target: commit.hash })
                      break
                    case 'reset':
                      res = await window.electronAPI.reset({ folderPath: currentRepo, mode: extra, hash: commit.hash })
                      break
                    case 'cherry-pick':
                      res = await window.electronAPI.cherryPick({ folderPath: currentRepo, hash: commit.hash })
                      break
                    case 'revert':
                      res = await window.electronAPI.revert({ folderPath: currentRepo, hash: commit.hash })
                      break
                    default:
                      return { ok: true }
                  }
                  if (!res?.ok) throw new Error(res?.error || `${action} failed`)
                  return res
                },
                action,
                { hash: commit.hash, branch: commit.branches?.[0], retryFn: () => refresh() }
              )
              refresh(); refreshStatus()
            }}
          />
          {selectedDiffFile && (
            <DiffViewOverlay 
              fileParams={selectedDiffFile}
              repoPath={currentRepo}
              onClose={() => setSelectedDiffFile(null)}
            />
          )}
        </main>

        <CommitDetail
          commit={selectedCommit}
          repoPath={currentRepo}
          staged={staged}
          unstaged={unstaged}
          untracked={untracked}
          conflictedFiles={conflictState?.files || []}
          onStageFiles={handleStageFiles}
          onUnstageFiles={handleUnstageFiles}
          onCommit={handleCommit}
          onRefreshStatus={refreshStatus}
          onFileClick={setSelectedDiffFile}
        />
      </div>

      {/* Toast notifications — floating, top-right */}
      <GitErrorToast
        errors={errors}
        onDismiss={dismissError}
        onAction={handleToastAction}
      />

      {promptConfig && (
        <PromptModal 
          title={promptConfig.title} 
          onConfirm={(val) => { promptConfig.resolve(val); setPromptConfig(null) }} 
          onCancel={() => { promptConfig.resolve(null); setPromptConfig(null) }} 
        />
      )}
    </div>
  )
}

function PromptModal({ title, onConfirm, onCancel }) {
  const [value, setValue] = useState('')
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-80 bg-surface-800 border border-surface-600 rounded-lg shadow-2xl p-4">
        <h3 className="text-sm font-medium text-white mb-3 whitespace-pre-line">{title}</h3>
        <input 
          autoFocus 
          value={value} 
          onChange={e => setValue(e.target.value)} 
          onKeyDown={e => {
            if (e.key === 'Enter') onConfirm(value)
            if (e.key === 'Escape') onCancel()
          }}
          className="w-full bg-surface-900 border border-surface-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-brand-500 mb-4" 
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded text-xs font-medium bg-surface-700 hover:bg-surface-600 text-slate-300">Cancelar</button>
          <button onClick={() => onConfirm(value)} className="px-3 py-1.5 rounded text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white">Aceptar</button>
        </div>
      </div>
    </div>
  )
}
