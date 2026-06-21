import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { LANE_COLORS } from '../utils/graphLayout'

const ROW_H = 32
const COL_W = 24
const DOT_R = 5
const PAD   = 16

export default function GitGraph({
  commits, selectedHash, onSelectCommit,
  loading, error, repoPath, onRefresh,
  scrollToHash, onScrollHandled,
  conflictedFiles = [], onGitAction
}) {
  const listRef   = useRef(null)
  const [filter, setFilter] = useState('')

  // ── Column resize ─────────────────────────────────────────────────────────
  const [colWidths, setColWidths] = useState({ desc: 400, author: 120, hash: 100, date: 120 })
  const draggingRef = useRef(null)

  const handleMouseDown = (e, col) => {
    e.preventDefault(); e.stopPropagation()
    draggingRef.current = { col, startX: e.clientX, startW: colWidths[col] }
  }

  useEffect(() => {
    const onMove = e => {
      if (!draggingRef.current) return
      const { col, startX, startW } = draggingRef.current
      setColWidths(prev => ({ ...prev, [col]: Math.max(50, startW + e.clientX - startX) }))
    }
    const onUp = () => { draggingRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Multi-select ──────────────────────────────────────────────────────────
  const [selectedHashes, setSelectedHashes] = useState(new Set())

  // ── Context menu ──────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState(null)

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!filter) return commits
    const q = filter.toLowerCase()
    return commits.filter(c =>
      c.subject?.toLowerCase().includes(q) ||
      c.authorName?.toLowerCase().includes(q) ||
      c.shortHash?.includes(q) ||
      c.branches?.some(b => b.toLowerCase().includes(q)) ||
      c.tags?.some(t => t.toLowerCase().includes(q))
    )
  }, [commits, filter])

  const rowMap = useMemo(() => new Map(filtered.map((c, i) => [c.hash, i])), [filtered])

  const svgW = useMemo(() => {
    const maxCol = filtered.reduce((m, c) => {
      if (c.isWip) return Math.max(m, 0)
      const connMax = c.connections?.reduce((cm, cn) => Math.max(cm, cn.fromCol, cn.toCol), 0) ?? 0
      return Math.max(m, c.col ?? 0, connMax)
    }, 0)
    return PAD + (maxCol + 1) * COL_W + 12
  }, [filtered])

  const totalH = filtered.length * ROW_H
  const totalWidth = svgW + colWidths.desc + colWidths.author + colWidths.hash + colWidths.date

  // ── Keyboard nav ──────────────────────────────────────────────────────────
  const handleKey = useCallback(e => {
    if (!filtered.length) return
    const idx = filtered.findIndex(c => c.hash === selectedHash)
    if (e.key === 'ArrowDown') onSelectCommit(filtered[Math.min(idx + 1, filtered.length - 1)])
    else if (e.key === 'ArrowUp') onSelectCommit(filtered[Math.max(idx - 1, 0)])
  }, [filtered, selectedHash, onSelectCommit])

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  // Auto-scroll on selection
  useEffect(() => {
    if (!selectedHash || !listRef.current) return
    listRef.current.querySelector(`[data-hash="${selectedHash}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedHash])

  // Scroll to hash from sidebar tag click
  useEffect(() => {
    if (!scrollToHash || !listRef.current) return
    const el = listRef.current.querySelector(`[data-hash="${scrollToHash}"]`)
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); onScrollHandled?.() }
  }, [scrollToHash, onScrollHandled])

  // ── SVG Elements ──────────────────────────────────────────────────────────
  const { passLines, connLines, dots } = useMemo(() => {
    const passLines = [], connLines = [], dots = []

    filtered.forEach((commit, rowIdx) => {
      if (commit.isWip) return // WIP rendered separately

      const cx = PAD + commit.col * COL_W
      const cy = rowIdx * ROW_H + ROW_H / 2

      commit.activeLanes?.forEach((hash, laneIdx) => {
        if (!hash) return
        if (laneIdx === commit.col) return
        if (typeof hash === 'string' && hash.startsWith('reserved:')) return
        const x = PAD + laneIdx * COL_W
        const color = LANE_COLORS[laneIdx % LANE_COLORS.length]
        passLines.push(
          <line key={`pt-${rowIdx}-${laneIdx}`} x1={x} y1={rowIdx * ROW_H} x2={x} y2={(rowIdx + 1) * ROW_H}
            stroke={color} strokeWidth="2" strokeOpacity="0.35" strokeLinecap="round" />
        )
      })

      commit.connections?.forEach((conn, i) => {
        const targetRow = rowMap.get(conn.toHash)
        if (targetRow === undefined) return
        const tx    = PAD + conn.toCol * COL_W
        const ty    = targetRow * ROW_H + ROW_H / 2
        const color = LANE_COLORS[conn.fromCol % LANE_COLORS.length]
        connLines.push(
          <path key={`conn-${rowIdx}-${i}`} d={buildPath(cx, cy, tx, ty, conn.type)}
            fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.85" strokeLinecap="round" strokeLinejoin="round" />
        )
      })

      const isSelected = commit.hash === selectedHash || selectedHashes.has(commit.hash)
      const dotColor   = commit.color

      if (isSelected) dots.push(<circle key={`glow-${commit.hash}`} cx={cx} cy={cy} r={DOT_R + 6} fill="none" stroke={dotColor} strokeWidth="1.5" strokeOpacity="0.3" />)
      if (commit.isHead) dots.push(<circle key={`ring-${commit.hash}`} cx={cx} cy={cy} r={DOT_R + 4} fill="none" stroke={commit.color} strokeWidth="1.5" strokeOpacity="0.5" />)
      dots.push(
        <circle key={`dot-${commit.hash}`} cx={cx} cy={cy}
          r={commit.isHead ? DOT_R + 1 : DOT_R}
          fill={isSelected ? '#fff' : dotColor}
          stroke={isSelected ? dotColor : 'transparent'}
          strokeWidth={isSelected ? 2 : 0} />
      )
    })

    // WIP connecting line to first real commit
    const wipCommit = filtered[0]
    if (wipCommit?.isWip && filtered[1]) {
      const y1 = ROW_H / 2
      const y2 = ROW_H + ROW_H / 2
      passLines.unshift(
        <line key="wip-line" x1={PAD} y1={y1} x2={PAD} y2={y2}
          stroke="#475569" strokeWidth="2" strokeOpacity="0.5" strokeDasharray="4 3" strokeLinecap="round" />
      )
    }

    return { passLines, connLines, dots }
  }, [filtered, rowMap, selectedHash, selectedHashes])

  // ── Context menu actions — delegated to App for centralized error handling ──
  async function handleAction(action, commit, extra) {
    if (!repoPath) return
    if (onGitAction) {
      await onGitAction(action, commit, extra)
    } else {
      // Fallback (no error system): raw calls with simple alert
      try {
        let res
        if (action === 'checkout') res = await window.electronAPI.checkout({ folderPath: repoPath, branch: commit.hash })
        else if (action === 'branch') {
          const name = window.prompt(`Crear rama en ${commit.shortHash}\nIngresa el nombre:`)
          if (name) res = await window.electronAPI.createBranch({ folderPath: repoPath, branchName: name, hash: commit.hash })
        }
        else if (action === 'merge')       res = await window.electronAPI.merge({ folderPath: repoPath, target: commit.hash })
        else if (action === 'rebase')      res = await window.electronAPI.rebase({ folderPath: repoPath, target: commit.hash })
        else if (action === 'reset')       res = await window.electronAPI.reset({ folderPath: repoPath, mode: extra, hash: commit.hash })
        else if (action === 'cherry-pick') res = await window.electronAPI.cherryPick({ folderPath: repoPath, hash: commit.hash })
        if (res && !res.ok) alert(`Error: ${res.error}`)
        else onRefresh?.()
      } catch (err) { alert(`Error: ${err.message || err}`) }
    }
  }

  // ── Row click handler ─────────────────────────────────────────────────────
  function handleRowClick(commit, e) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      // Multi-select
      setSelectedHashes(prev => {
        const next = new Set(prev)
        if (e.shiftKey && selectedHash) {
          // Select range
          const a = filtered.findIndex(c => c.hash === selectedHash)
          const b = filtered.findIndex(c => c.hash === commit.hash)
          const [from, to] = a < b ? [a, b] : [b, a]
          filtered.slice(from, to + 1).forEach(c => next.add(c.hash))
        } else {
          if (next.has(commit.hash)) next.delete(commit.hash)
          else next.add(commit.hash)
        }
        return next
      })
    } else {
      setSelectedHashes(new Set())
      onSelectCommit(commit)
    }
  }

  function handleContextMenu(e, commit) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, commit })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-surface-900 overflow-hidden relative">
      {/* Search Bar */}
      <div className="shrink-0 px-3 py-2 border-b border-surface-700 flex items-center gap-2 bg-surface-950/50 z-30">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text" value={filter} onChange={e => setFilter(e.target.value)}
          placeholder="Filtrar commits, ramas, autores, tags..."
          className="flex-1 bg-transparent text-sm text-slate-300 placeholder-slate-600 focus:outline-none"
        />
        {filter && <button onClick={() => setFilter('')} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>}
        {selectedHashes.size > 1 && (
          <span className="text-[10px] text-brand-400 font-medium">{selectedHashes.size} seleccionados</span>
        )}
        <span className="text-[10px] text-slate-600 font-mono">{filtered.length}/{commits.length}</span>
      </div>

      {/* Main scroll area */}
      <div ref={listRef} className="flex-1 overflow-auto bg-surface-900">
        {loading && commits.length === 0 && (
          <div className="flex items-center justify-center h-32 gap-2 text-slate-500 text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            Cargando historial...
          </div>
        )}
        {error && <div className="mx-3 my-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-xs text-red-400">{error}</div>}
        {!loading && !error && commits.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-600 text-sm gap-2">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Abre un repositorio Git para ver el historial
          </div>
        )}

        {filtered.length > 0 && (
          <div className="relative" style={{ minWidth: totalWidth, width: 'max-content', minHeight: '100%' }}>

            {/* Sticky Header */}
            <div className="sticky top-0 z-20 flex items-center h-7 bg-surface-950/90 backdrop-blur border-b border-surface-700 text-[10px] text-slate-500 uppercase tracking-wider font-medium select-none shadow-sm" style={{ width: totalWidth }}>
              <div style={{ width: svgW }} className="shrink-0 px-2 border-r border-surface-700/50">Graph</div>

              {[['desc', 'Descripción'], ['author', 'Autor'], ['hash', 'Hash'], ['date', 'Fecha']].map(([key, label]) => (
                <div key={key} style={{ width: colWidths[key] }} className="relative shrink-0 px-2 border-r border-surface-700/50 flex items-center">
                  {label}
                  <div
                    className="absolute right-[-2px] top-0 bottom-0 w-4 cursor-col-resize z-30 flex items-center justify-center group"
                    onMouseDown={e => handleMouseDown(e, key)}
                  >
                    <div className="w-px h-full bg-transparent group-hover:bg-brand-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>

            {/* Content area */}
            <div className="relative" style={{ height: totalH, width: totalWidth }}>
              <svg width={svgW} height={totalH} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                {passLines}{connLines}{dots}
              </svg>

              {filtered.map((commit, rowIdx) => (
                <CommitRow
                  key={commit.hash}
                  commit={commit}
                  rowIdx={rowIdx}
                  svgW={svgW}
                  colWidths={colWidths}
                  isSelected={commit.hash === selectedHash || selectedHashes.has(commit.hash)}
                  onClick={e => handleRowClick(commit, e)}
                  onContextMenu={e => handleContextMenu(e, commit)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          commit={contextMenu.commit}
          multiCount={selectedHashes.size}
          onClose={() => setContextMenu(null)}
          onAction={handleAction}
        />
      )}
    </div>
  )
}

// ── CommitRow ─────────────────────────────────────────────────────────────────

function CommitRow({ commit, rowIdx, svgW, colWidths, isSelected, onClick, onContextMenu }) {
  const isWip = commit.isWip

  return (
    <div
      data-hash={commit.hash}
      onClick={onClick}
      onContextMenu={e => onContextMenu(e, commit)}
      className={`absolute w-full flex items-center cursor-pointer select-none transition-colors duration-100 group ${
        isSelected
          ? isWip ? 'bg-slate-700/30 border-l-2 border-slate-500' : 'bg-brand-500/10 border-l-2 border-brand-400'
          : 'hover:bg-surface-800/80 border-l-2 border-transparent'
      }`}
      style={{ top: rowIdx * ROW_H, height: ROW_H, zIndex: 2 }}
    >
      {/* Graph spacer */}
      <div style={{ width: svgW }} className="shrink-0 relative">
        {/* WIP ghost node rendered in SVG space */}
        {isWip && (
          <div className="absolute inset-0 flex items-center" style={{ left: PAD - 7 }}>
            <div className="w-3.5 h-3.5 rounded-sm border-2 border-dashed border-slate-500 bg-surface-900 flex items-center justify-center">
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="3">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <div style={{ width: colWidths.desc }} className="shrink-0 px-2 flex items-center gap-1.5 overflow-hidden">
        {isWip ? (
          <span className="text-[13px] text-slate-400 font-mono italic">// WIP — cambios sin commitear</span>
        ) : (
          <>
            {(commit.branches?.length > 0 || commit.tags?.length > 0) && (
              <div className="flex items-center gap-1 shrink-0">
                {commit.branches?.slice(0, 3).map(b => {
                  const isRemote = b.startsWith('remotes/') || b.startsWith('origin/')
                  const label    = b.replace('remotes/', '').replace('origin/', '')
                  const isHead   = commit.isHead && !isRemote
                  return (
                    <span key={b} className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-sm font-mono leading-none whitespace-nowrap ${
                      isHead ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30'
                      : isRemote ? 'bg-surface-700/80 text-slate-500'
                      : 'bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/25'
                    }`}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                        <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>
                        <path d="M18 9a9 9 0 01-9 9"/>
                      </svg>
                      {isHead ? '● ' : ''}{label}
                    </span>
                  )
                })}
                {commit.tags?.slice(0, 2).map(tag => (
                  <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-sm font-mono leading-none whitespace-nowrap bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                      <line x1="7" y1="7" x2="7.01" y2="7"/>
                    </svg>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <span className={`text-[13px] truncate transition-colors ${isSelected ? 'text-white font-medium' : 'text-slate-300 group-hover:text-white'}`}>
              {commit.subject || '(sin mensaje)'}
            </span>
          </>
        )}
      </div>

      {/* Author */}
      <div style={{ width: colWidths.author }} className="shrink-0 px-2 text-[11px] text-slate-500 truncate text-right">
        {commit.authorName}
      </div>

      {/* Hash */}
      <div style={{ width: colWidths.hash }} className="shrink-0 px-2 text-[11px] font-mono truncate text-right text-slate-600">
        {isWip ? '———' : commit.shortHash}
      </div>

      {/* Date */}
      <div style={{ width: colWidths.date }} className="shrink-0 px-2 text-[11px] text-slate-600 truncate text-right">
        {isWip ? 'ahora' : shortDate(commit.date)}
      </div>
    </div>
  )
}

// ── ContextMenu ───────────────────────────────────────────────────────────────

function ContextMenu({ x, y, commit, multiCount, onClose, onAction }) {
  const menuRef = useRef(null)
  const [pos, setPos] = useState({ x, y })
  const [resetOpen, setResetOpen] = useState(false)
  const isWip = commit.isWip

  useEffect(() => {
    if (!menuRef.current) return
    const r = menuRef.current.getBoundingClientRect()
    setPos({
      x: x + r.width  > window.innerWidth  ? window.innerWidth  - r.width  - 5 : x,
      y: y + r.height > window.innerHeight ? window.innerHeight - r.height - 5 : y,
    })
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-64 bg-surface-800 border border-surface-700/60 rounded-lg shadow-xl shadow-black/60 py-1 text-sm text-slate-300"
      style={{ top: pos.y, left: pos.x }}
      onClick={e => e.stopPropagation()}
    >
      {/* Commit header */}
      <div className="px-3 py-2 border-b border-surface-700/60 mb-1 flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-surface-900 border border-surface-700 flex items-center justify-center font-mono text-[10px] text-slate-400 shrink-0">
          {isWip ? '~' : commit.shortHash?.substring(0, 4)}
        </div>
        <div className="min-w-0">
          <div className="text-white font-medium truncate text-xs">{commit.subject}</div>
          <div className="text-[10px] text-slate-500">{commit.authorName}</div>
        </div>
      </div>

      {multiCount > 1 && (
        <>
          <MenuItem icon={<SquashIcon />} label={`Squash ${multiCount} commits`}
            onClick={() => { onAction('squash', commit); onClose() }} />
          <MenuItem icon={<CherryIcon />} label={`Cherry-pick ${multiCount} commits`}
            onClick={() => { onAction('cherry-pick-multi', commit); onClose() }} />
          <div className="h-px bg-surface-700/50 my-1" />
        </>
      )}

      {!isWip && (
        <>
          <MenuItem icon={<CheckoutIcon />} label="Checkout este commit"
            onClick={() => { onAction('checkout', commit); onClose() }} />
          <MenuItem icon={<BranchIcon />} label="Crear rama aquí..."
            onClick={() => { onAction('branch', commit); onClose() }} />

          <div className="h-px bg-surface-700/50 my-1" />

          {/* Reset con submenú */}
          <div className="relative">
            <button
              onMouseEnter={() => setResetOpen(true)}
              onMouseLeave={() => setResetOpen(false)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-surface-700 transition-colors text-left"
            >
              <span className="shrink-0 opacity-70"><ResetIcon /></span>
              <span className="truncate text-xs flex-1">Reset rama actual a este commit</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
            {resetOpen && (
              <div
                className="absolute left-full top-0 ml-1 w-52 bg-surface-800 border border-surface-700/60 rounded-lg shadow-xl py-1"
                onMouseEnter={() => setResetOpen(true)}
                onMouseLeave={() => setResetOpen(false)}
              >
                <div className="px-3 py-1 text-[10px] text-slate-600 uppercase tracking-wider font-semibold">Tipo de Reset</div>
                <MenuItem icon={<SoftIcon />} label="Soft — mantiene staging"
                  onClick={() => { onAction('reset', commit, 'soft'); onClose() }}
                  sub="mantiene los cambios en staging area" />
                <MenuItem icon={<MixedIcon />} label="Mixed — mantiene archivos"
                  onClick={() => { onAction('reset', commit, 'mixed'); onClose() }}
                  sub="mantiene los cambios sin stagear" />
                <MenuItem icon={<HardIcon />} label="Hard — descarta todo ⚠️"
                  onClick={() => { onAction('reset', commit, 'hard'); onClose() }}
                  danger sub="destruye todos los cambios" />
              </div>
            )}
          </div>

          <div className="h-px bg-surface-700/50 my-1" />

          <MenuItem icon={<MergeIcon />} label={`Merge ${commit.shortHash} en actual`}
            onClick={() => { onAction('merge', commit); onClose() }} />
          <MenuItem icon={<RebaseIcon />} label={`Rebase actual sobre ${commit.shortHash}`}
            onClick={() => { onAction('rebase', commit); onClose() }} />
          <MenuItem icon={<CherryIcon />} label="Cherry-pick a rama actual"
            onClick={() => { onAction('cherry-pick', commit); onClose() }} />
          <MenuItem icon={<RevertIcon />} label="Revertir este commit"
            onClick={() => { onAction('revert', commit); onClose() }} />
        </>
      )}
    </div>
  )
}

function MenuItem({ icon, label, sub, onClick, danger }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-start gap-2.5 px-3 py-1.5 transition-colors text-left ${
        danger ? 'hover:bg-red-600 hover:text-white' : 'hover:bg-brand-500 hover:text-white'
      }`}
    >
      <span className="shrink-0 opacity-70 mt-0.5">{icon}</span>
      <span className="flex flex-col min-w-0">
        <span className="truncate text-xs">{label}</span>
        {sub && <span className="text-[10px] opacity-60 truncate">{sub}</span>}
      </span>
    </button>
  )
}

// Icons
const CheckoutIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 16 16 12 12 8"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
const BranchIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>
const MergeIcon   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 12v-2a4 4 0 00-4-4H4"/><polyline points="12 2 16 6 12 10"/></svg>
const RebaseIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v2a4 4 0 004 4h12"/><polyline points="16 14 20 18 16 22"/></svg>
const CherryIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="16" r="4"/><circle cx="16" cy="16" r="4"/><path d="M12 12V4l4 2"/></svg>
const RevertIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
const ResetIcon   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 2v6h6M21.5 22v-6h-6"/><path d="M22 11.5A10 10 0 003.2 7.2M2 12.5a10 10 0 0018.8 4.2"/></svg>
const SquashIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="M5 6h14"/><path d="M5 18h14"/></svg>
const SoftIcon    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
const MixedIcon   = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
const HardIcon    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>

// ── Path builder ──────────────────────────────────────────────────────────────

function buildPath(x1, y1, x2, y2, type) {
  if (x1 === x2) return `M ${x1} ${y1} L ${x2} ${y2}`
  const dy = y2 - y1
  const absDy = Math.abs(dy)
  const BEND = ROW_H * 1.5
  if (absDy <= ROW_H * 3) {
    const half = dy * 0.5
    return `M ${x1} ${y1} C ${x1} ${y1 + half}, ${x2} ${y2 - half}, ${x2} ${y2}`
  }
  if (type === 'branch-from' || type === 'merge-from') {
    const curveEndY = y1 + BEND
    return [`M ${x1} ${y1}`, `C ${x1} ${y1 + BEND * 0.4}, ${x2} ${curveEndY - BEND * 0.4}, ${x2} ${curveEndY}`, `L ${x2} ${y2}`].join(' ')
  }
  const curveStartY = y2 - BEND
  return [`M ${x1} ${y1}`, `L ${x1} ${curveStartY}`, `C ${x1} ${curveStartY + BEND * 0.4}, ${x2} ${y2 - BEND * 0.4}, ${x2} ${y2}`].join(' ')
}

function shortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}
