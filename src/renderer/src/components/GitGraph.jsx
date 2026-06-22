import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { LANE_COLORS } from '../utils/graphLayout'

const ROW_H = 32
const COL_W = 20
const DOT_R = 5
const PAD   = 16

export default function GitGraph({
  commits, selectedHash, onSelectCommit,
  loading, error, repoPath, onRefresh,
  scrollToHash, onScrollHandled,
  conflictedFiles = [], onGitAction,
  pinnedBranches = [], onTogglePin
}) {
  const listRef   = useRef(null)
  const [filter, setFilter] = useState('')

  // ── Column resize ─────────────────────────────────────────────────────────
  const [colWidths, setColWidths] = useState({ refs: 150, desc: 400, author: 120, stats: 100, date: 120 })
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

  const svgW = useMemo(() => {
    if (!filtered.length) return 100
    return PAD + (filtered[0].totalCols) * COL_W + 24
  }, [filtered])

  const totalH = filtered.length * ROW_H
  const totalWidth = colWidths.refs + svgW + colWidths.desc + colWidths.author + colWidths.stats + colWidths.date

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

  // Scroll to hash
  useEffect(() => {
    if (!scrollToHash || !listRef.current) return
    const idx = filtered.findIndex(c => c.hash === scrollToHash)
    if (idx !== -1) {
      listRef.current.scrollTop = Math.max(0, idx * ROW_H - listRef.current.clientHeight / 2)
      onScrollHandled?.()
    }
  }, [scrollToHash, onScrollHandled, filtered])

  // ── Virtualization ────────────────────────────────────────────────────────
  const [scrollTop, setScrollTop] = useState(0)
  const [clientHeight, setClientHeight] = useState(800)

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current
    const onScroll = () => setScrollTop(el.scrollTop)
    const onResize = () => setClientHeight(el.clientHeight)
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    onResize()
    return () => { el.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onResize) }
  }, [])

  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_H) - 10)
  const endIndex = Math.min(filtered.length, Math.ceil((scrollTop + clientHeight) / ROW_H) + 10)
  const visibleCommits = filtered.slice(startIndex, endIndex)

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleAction(action, commit, extra) {
    if (!repoPath) return
    if (onGitAction) {
      await onGitAction(action, commit, extra)
    } else {
      alert("Acción no implementada sin onGitAction")
    }
  }

  function handleRowClick(commit, e) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelectedHashes(prev => {
        const next = new Set(prev)
        if (e.shiftKey && selectedHash) {
          const a = filtered.findIndex(c => c.hash === selectedHash)
          const b = filtered.findIndex(c => c.hash === commit.hash)
          const [from, to] = a < b ? [a, b] : [b, a]
          filtered.slice(from, to + 1).forEach(c => next.add(c.hash))
        } else {
          if (next.has(commit.hash)) next.delete(commit.hash)
          else next.add(commit.hash)
        }
        const newSize = next.size
        if (newSize > 1) {
          const indices = Array.from(next).map(h => filtered.findIndex(c => c.hash === h)).filter(i => i >= 0).sort((a,b) => a - b)
          if (indices.length > 0) {
            const newest = filtered[indices[0]] // lower index = newer
            const oldest = filtered[indices[indices.length - 1]]
            // Use oldest.hash^..newest.hash to include oldest commit's changes
            const range = `${oldest.hash}^..${newest.hash}`
            
            // Defers the call to avoid state-update collision? It should be fine directly.
            setTimeout(() => {
              onSelectCommit({
                hash: range,
                shortHash: `${oldest.shortHash}..${newest.shortHash}`,
                subject: `Diff combinado (${newSize} commits)`,
                authorName: 'Multi-select',
                date: newest.date,
                isMulti: true
              })
            }, 0)
          }
        } else if (newSize === 1) {
          const singleHash = Array.from(next)[0]
          const c = filtered.find(c => c.hash === singleHash)
          if (c) setTimeout(() => onSelectCommit(c), 0)
        } else {
          setTimeout(() => onSelectCommit(null), 0)
        }

        return next
      })
    } else {
      setSelectedHashes(new Set())
      onSelectCommit(commit)
    }
  }

  // ── Hover Tooltip ─────────────────────────────────────────────────────────
  const [hoverInfo, setHoverInfo] = useState(null)
  const hoverTimeout = useRef(null)

  const handleMouseEnterRow = (e, commit) => {
    clearTimeout(hoverTimeout.current)
    if (commit.isWip || contextMenu) {
      setHoverInfo(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    hoverTimeout.current = setTimeout(async () => {
      try {
        const stats = await window.electronAPI.getCommitStats({ folderPath: repoPath, hash: commit.hash })
        setHoverInfo({
          commit,
          stats,
          y: rect.top + ROW_H + 5,
          x: Math.max(10, e.clientX - 100)
        })
      } catch {
        // ignore
      }
    }, 400) // 400ms delay for tooltip
  }

  const handleMouseLeaveRow = () => {
    clearTimeout(hoverTimeout.current)
    setHoverInfo(null)
  }

  const handleScroll = () => {
    // clear tooltip on scroll
    clearTimeout(hoverTimeout.current)
    setHoverInfo(null)
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
      </div>

      {/* Main scroll area */}
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-auto bg-surface-900">
        {loading && commits.length === 0 && (
          <div className="flex items-center justify-center h-32 gap-2 text-slate-500 text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            Cargando historial...
          </div>
        )}
        {error && <div className="mx-3 my-3 p-3 bg-red-900/30 border border-red-700/50 rounded-lg text-xs text-red-400">{error}</div>}

        {filtered.length > 0 && (
          <div className="relative" style={{ minWidth: totalWidth, width: 'max-content', minHeight: '100%' }}>

            {/* Sticky Header */}
            <div className="sticky top-0 z-20 flex items-center h-7 bg-surface-950/90 backdrop-blur border-b border-surface-700 text-[10px] text-slate-500 uppercase tracking-wider font-medium select-none shadow-sm" style={{ width: totalWidth }}>
              
              <div style={{ width: colWidths.refs }} className="relative shrink-0 px-2 border-r border-surface-700/50 flex items-center justify-end">
                Ramas / Tags
                <div
                  className="absolute right-[-2px] top-0 bottom-0 w-4 cursor-col-resize z-30 flex items-center justify-center group"
                  onMouseDown={e => handleMouseDown(e, 'refs')}
                >
                  <div className="w-px h-full bg-transparent group-hover:bg-brand-500 transition-colors" />
                </div>
              </div>

              <div style={{ width: svgW }} className="shrink-0 px-2 border-r border-surface-700/50">Graph</div>

              {[['desc', 'Descripción'], ['author', 'Autor'], ['stats', 'Líneas'], ['date', 'Fecha']].map(([key, label]) => (
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
              {visibleCommits.map((commit, i) => {
                const globalRowIdx = startIndex + i
                return (
                  <CommitRow
                    key={commit.hash}
                    commit={commit}
                    svgW={svgW}
                    colWidths={colWidths}
                    isSelected={commit.hash === selectedHash || selectedHashes.has(commit.hash)}
                    onClick={e => handleRowClick(commit, e)}
                    onContextMenu={e => handleContextMenu(e, commit)}
                    onMouseEnter={e => handleMouseEnterRow(e, commit)}
                    onMouseLeave={handleMouseLeaveRow}
                    onDoubleClickBranch={(b) => handleAction('checkout-branch', commit, b)}
                    style={{ position: 'absolute', top: globalRowIdx * ROW_H, height: ROW_H, width: '100%' }}
                  />
                )
              })}
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
          pinnedBranches={pinnedBranches}
          onTogglePin={onTogglePin}
          onClose={() => setContextMenu(null)}
          onAction={handleAction}
        />
      )}

      {hoverInfo && !contextMenu && (
        <CommitTooltip info={hoverInfo} />
      )}
    </div>
  )
}

// ── CommitRow ─────────────────────────────────────────────────────────────────

function CommitRow({ commit, svgW, colWidths, isSelected, onClick, onContextMenu, onMouseEnter, onMouseLeave, onDoubleClickBranch, style }) {
  const isWip = commit.isWip
  const [hoveredRefs, setHoveredRefs] = useState(false)

  const refsItems = useMemo(() => {
    if (isWip) return []
    const groups = new Map()
    commit.branches?.forEach(b => {
      if (b.includes('refs/stash')) {
        if (!groups.has('refs/stash')) groups.set('refs/stash', { name: 'refs/stash', isStash: true, isLocal: false, isRemote: false, isHead: false, originals: [b] })
        return
      }
      const isRemote = b.startsWith('remotes/') || b.startsWith('origin/')
      const name = b.replace(/^remotes\/[^/]+\//, '').replace(/^origin\//, '')
      if (!groups.has(name)) groups.set(name, { name, isLocal: false, isRemote: false, isHead: false, originals: [] })
      const g = groups.get(name)
      g.originals.push(b)
      if (isRemote) g.isRemote = true
      else {
        g.isLocal = true
        if (commit.headBranch) {
          if (name === commit.headBranch) g.isHead = true
        } else if (commit.isHead) {
          // Fallback if backend hasn't been restarted yet to provide headBranch
          const localBranches = commit.branches.filter(br => !br.startsWith('remotes/') && !br.startsWith('origin/'))
          if (b === localBranches[0] || localBranches.length === 0) g.isHead = true
        }
      }
    })
    const branchItems = Array.from(groups.values())
    branchItems.sort((a, b) => {
      if (a.isHead && !b.isHead) return -1
      if (!a.isHead && b.isHead) return 1
      return 0
    })
    const tagItems = (commit.tags || []).map(t => ({ name: t, isTag: true, originals: [t] }))
    return [...branchItems, ...tagItems]
  }, [commit.branches, commit.tags, commit.isHead, isWip])

  return (
    <div
      data-hash={commit.hash}
      onClick={onClick}
      onContextMenu={e => onContextMenu(e, commit)}
      className={`flex items-center cursor-pointer select-none transition-colors duration-100 group ${
        isSelected
          ? isWip ? 'bg-slate-700/30 border-l-2 border-slate-500' : 'bg-brand-500/10 border-l-2 border-brand-400'
          : 'hover:bg-surface-800/80 border-l-2 border-transparent'
      }`}
      style={{ ...style, zIndex: hoveredRefs ? 50 : 1 }}
    >
      {/* Refs (Branches/Tags) */}
      <div 
        style={{ width: colWidths.refs }} 
        className="shrink-0 px-2 flex items-center justify-end gap-1 overflow-visible h-full relative"
        onMouseEnter={() => setHoveredRefs(true)}
        onMouseLeave={() => setHoveredRefs(false)}
      >
        {!isWip && refsItems.length > 0 && (
          <div className="flex items-center justify-end gap-1 shrink-0 w-full">
            <RefPill item={refsItems[0]} onDoubleClickBranch={onDoubleClickBranch} />
            {refsItems.length > 1 && (
              <span className="inline-flex items-center text-[11px] font-medium px-2 py-1 rounded font-mono leading-none whitespace-nowrap bg-brand-600/90 text-white cursor-default">
                +{refsItems.length - 1}
              </span>
            )}
            
            {/* Hover Popover */}
            {hoveredRefs && refsItems.length > 1 && (
              <div className="absolute top-full right-2 pt-1 z-[100] cursor-default" onClick={e => e.stopPropagation()}>
                <div className="flex flex-col gap-1 bg-surface-800 border border-surface-600 rounded-lg shadow-2xl shadow-black/80 p-2 items-end">
                  {refsItems.map((item, i) => (
                    <RefPill key={i} item={item} onDoubleClickBranch={onDoubleClickBranch} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Graph segment */}
      <div style={{ width: svgW }} className="shrink-0 relative h-full">
        <GraphSegmentSvg commit={commit} svgW={svgW} onMouseEnterNode={onMouseEnter} onMouseLeaveNode={onMouseLeave} />
      </div>

      {/* Description */}
      <div style={{ width: colWidths.desc }} className="shrink-0 px-2 flex items-center gap-1.5 overflow-hidden">
        {isWip ? (
          <span className="text-[13px] text-slate-400 font-mono italic">// WIP — cambios sin commitear</span>
        ) : (
          <span className={`text-[13px] truncate transition-colors ${isSelected ? 'text-white font-medium' : 'text-slate-300 group-hover:text-white'}`}>
            {commit.subject || '(sin mensaje)'}
          </span>
        )}
      </div>

      {/* Author */}
      <div style={{ width: colWidths.author }} className="shrink-0 px-2 flex items-center justify-end gap-2 overflow-hidden">
        <span className="text-[11px] text-slate-500 truncate">{commit.authorName}</span>
        {!isWip && commit.authorAvatar && (
          <img src={commit.authorAvatar} alt="" className="w-5 h-5 rounded-full bg-surface-800 shrink-0 border border-surface-700" />
        )}
      </div>

      {/* Stats */}
      <div style={{ width: colWidths.stats }} className="shrink-0 px-2 flex items-center justify-end gap-1.5 overflow-hidden text-[10px]">
        {!isWip && commit.insertions > 0 && <span className="text-emerald-400 font-medium">+{commit.insertions}</span>}
        {!isWip && commit.deletions > 0 && <span className="text-red-400 font-medium">-{commit.deletions}</span>}
      </div>

      {/* Date */}
      <div style={{ width: colWidths.date }} className="shrink-0 px-2 text-[11px] text-slate-600 truncate text-right">
        {isWip ? 'ahora' : shortDate(commit.date)}
      </div>
    </div>
  )
}

// ── Segment SVG rendering ─────────────────────────────────────────────────────

function GraphSegmentSvg({ commit, svgW, onMouseEnterNode, onMouseLeaveNode }) {
  const { isWip, col, activeLanes, incomingConnections, outgoingConnections, color } = commit
  const cy = ROW_H / 2
  const cx = PAD + col * COL_W

  const elements = []
  const nodeRadius = commit.authorAvatar ? 8 : DOT_R

  // 1. Pass-throughs & incoming
  activeLanes?.forEach((lane, i) => {
    if (!lane) return
    const x = PAD + i * COL_W
    const strokeColor = LANE_COLORS[lane.colorIdx % LANE_COLORS.length]

    if (incomingConnections?.some(ic => ic.fromCol === i)) {
      // Incoming bend from parent lane to this node
      const sign = col > i ? 1 : -1
      const BEND = 12
      const absDist = Math.abs(col * COL_W - i * COL_W)
      const actualBend = Math.min(BEND, absDist / 2)
      const startX = x
      const endX = PAD + col * COL_W - sign * nodeRadius
      
      const d = `
        M ${startX} 0
        L ${startX} ${cy - actualBend}
        Q ${startX} ${cy} ${startX + sign * actualBend} ${cy}
        L ${endX} ${cy}
      `.trim().replace(/\s+/g, ' ')
      
      elements.push(<path key={`inc-${i}`} d={d} fill="none" stroke={strokeColor} strokeWidth="2" opacity="0.9" />)
    } else if (i === col) {
      // Straight incoming to this node
      elements.push(<line key={`pt-in-${i}`} x1={x} y1={0} x2={x} y2={cy} stroke={strokeColor} strokeWidth="2" />)
    } else {
      // Pass-through
      elements.push(<line key={`pt-out-${i}`} x1={x} y1={0} x2={x} y2={ROW_H} stroke={strokeColor} strokeWidth="2" opacity="0.6" />)
    }
  })

  // 2. Outgoing connections (branches/merges)
  // Main continuation down
  if (commit.parents?.length > 0) {
    elements.push(<line key="main-out" x1={cx} y1={cy} x2={cx} y2={ROW_H} stroke={color} strokeWidth="2" />)
  }

  outgoingConnections?.forEach((out, i) => {
    const tx = PAD + out.toCol * COL_W
    const strokeColor = LANE_COLORS[out.colorIdx % LANE_COLORS.length]
    const sign = out.toCol > col ? 1 : -1
    const startX = cx + sign * nodeRadius
    
    const BEND = 12
    const absDist = Math.abs(tx - startX)
    const actualBend = Math.min(BEND, absDist / 2)
    
    const d = `
      M ${startX} ${cy}
      L ${tx - sign * actualBend} ${cy}
      Q ${tx} ${cy} ${tx} ${cy + actualBend}
      L ${tx} ${ROW_H}
    `.trim().replace(/\s+/g, ' ')
    
    elements.push(<path key={`out-${i}`} d={d} fill="none" stroke={strokeColor} strokeWidth="2" opacity="0.9" />)
  })

  // 3. The node itself
  const isStashCommit = commit.branches?.some(b => b.includes('refs/stash'))

  if (isWip) {
    elements.push(
      <rect 
        key="wip-node" x={cx - 5} y={cy - 5} width="10" height="10" fill="#0f172a" stroke="#94a3b8" strokeWidth="2" strokeDasharray="2 1" rx="2" 
        className="pointer-events-auto"
        onMouseEnter={onMouseEnterNode}
        onMouseLeave={onMouseLeaveNode}
      />
    )
  } else if (isStashCommit) {
    elements.push(
      <g 
        key="stash-node"
        className="pointer-events-auto cursor-pointer transition-colors hover:opacity-80"
        onMouseEnter={onMouseEnterNode}
        onMouseLeave={onMouseLeaveNode}
      >
        <rect x={cx - 7} y={cy - 7} width="14" height="14" fill="#0f172a" stroke={color} strokeWidth="1.5" strokeDasharray="2 1.5" rx="2" />
        <svg x={cx - 5} y={cy - 5} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
          <path d="M4 8h16M4 8v12a2 2 0 002 2h12a2 2 0 002-2V8M4 8l1.6-4.8A2 2 0 017.5 2h9a2 2 0 011.9 1.2L20 8"/><path d="M10 12h4v2h-4z"/>
        </svg>
      </g>
    )
  } else {
    if (commit.isHead) {
      elements.push(<circle key="head-ring" cx={cx} cy={cy} r={10} fill="none" stroke={color} strokeWidth="2" opacity="0.5" />)
    }
    
    const isMerge = commit.parents?.length > 1
    
    if (commit.authorAvatar && !isMerge) {
      const imgSize = 20
      elements.push(
        <g 
          key="node-avatar"
          className="pointer-events-auto cursor-pointer hover:opacity-90"
          onMouseEnter={onMouseEnterNode}
          onMouseLeave={onMouseLeaveNode}
        >
          <circle cx={cx} cy={cy} r={imgSize / 2 + 1.5} fill="#0f172a" />
          <clipPath id={`clip-${commit.hash}`}>
            <circle cx={cx} cy={cy} r={imgSize / 2} />
          </clipPath>
          <image href={commit.authorAvatar} x={cx - imgSize / 2} y={cy - imgSize / 2} height={imgSize} width={imgSize} clipPath={`url(#clip-${commit.hash})`} />
          <circle cx={cx} cy={cy} r={imgSize / 2} fill="none" stroke={color} strokeWidth="1.5" />
        </g>
      )
    } else {
      elements.push(
        <circle 
          key="node" cx={cx} cy={cy} r={DOT_R} fill={color} stroke="#0f172a" strokeWidth="2" 
          className="pointer-events-auto cursor-pointer hover:stroke-white transition-colors"
          onMouseEnter={onMouseEnterNode}
          onMouseLeave={onMouseLeaveNode}
        />
      )
    }
  }

  return (
    <svg width={svgW} height={ROW_H} className="absolute inset-0 pointer-events-none">
      {elements}
    </svg>
  )
}

// ── ContextMenu ───────────────────────────────────────────────────────────────

function ContextMenu({ x, y, commit, multiCount, pinnedBranches, onTogglePin, onClose, onAction }) {
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

  // Get first local branch from commit for Pin action
  const localBranch = commit.branches?.find(b => !b.startsWith('remotes/') && !b.startsWith('origin/'))
  const isPinned = localBranch ? pinnedBranches.includes(localBranch) : false

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
          <MenuItem icon={<SquashIcon />} label={`Squash ${multiCount} commits`} onClick={() => { onAction('squash', commit); onClose() }} />
          <MenuItem icon={<CherryIcon />} label={`Cherry-pick ${multiCount} commits`} onClick={() => { onAction('cherry-pick-multi', commit); onClose() }} />
          <div className="h-px bg-surface-700/50 my-1" />
        </>
      )}

      {!isWip && (
        <>
          {commit.branches?.some(b => b.includes('refs/stash')) ? (
            <>
              <MenuItem icon={<StashDrawerIcon />} label="Apply Stash..." onClick={() => { onAction('stashApply', commit); onClose() }} />
              <MenuItem icon={<StashDrawerIcon />} label="Drop Stash..." onClick={() => { onAction('stashDrop', commit); onClose() }} danger />
              <MenuItem icon={<StashDrawerIcon />} label="Rename Stash..." onClick={() => { window.alert('Esta función aún no está implementada.'); onClose() }} />
              <MenuItem icon={<StashDrawerIcon />} label="Create Patch..." onClick={() => { window.alert('Esta función aún no está implementada.'); onClose() }} />
            </>
          ) : (
            <>
              <MenuItem icon={<CheckoutIcon />} label="Checkout este commit" onClick={() => { onAction('checkout', commit); onClose() }} />
              <MenuItem icon={<BranchIcon />} label="Crear rama aquí..." onClick={() => { onAction('branch', commit); onClose() }} />

              {localBranch && (
                <MenuItem 
                  icon={<PinIcon active={isPinned} />} 
                  label={isPinned ? `Unpin rama '${localBranch}'` : `Pin rama '${localBranch}' a la izquierda`} 
                  onClick={() => { onTogglePin(localBranch); onClose() }} 
                />
              )}

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
                    <MenuItem icon={<SoftIcon />} label="Soft — mantiene staging" onClick={() => { onAction('reset', commit, 'soft'); onClose() }} sub="mantiene los cambios en staging area" />
                    <MenuItem icon={<MixedIcon />} label="Mixed — mantiene archivos" onClick={() => { onAction('reset', commit, 'mixed'); onClose() }} sub="mantiene los cambios sin stagear" />
                    <MenuItem icon={<HardIcon />} label="Hard — descarta todo ⚠️" onClick={() => { onAction('reset', commit, 'hard'); onClose() }} danger sub="destruye todos los cambios" />
                  </div>
                )}
              </div>

              <div className="h-px bg-surface-700/50 my-1" />

              <MenuItem icon={<MergeIcon />} label={`Merge ${commit.shortHash} en actual`} onClick={() => { onAction('merge', commit); onClose() }} />
              <MenuItem icon={<RebaseIcon />} label={`Rebase actual sobre ${commit.shortHash}`} onClick={() => { onAction('rebase', commit); onClose() }} />
              <MenuItem icon={<CherryIcon />} label="Cherry-pick a rama actual" onClick={() => { onAction('cherry-pick', commit); onClose() }} />
              <MenuItem icon={<RevertIcon />} label="Revertir este commit" onClick={() => { onAction('revert', commit); onClose() }} />
            </>
          )}
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
const HardIcon    = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
const PinIcon     = ({ active }) => <svg width="14" height="14" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 00-1.11-1.79l-1.78-.9A2 2 0 0115 10.76V6h1a2 2 0 000-4H8a2 2 0 000 4h1v4.76a2 2 0 01-1.11 1.79l-1.78.9A2 2 0 005 15.24Z"/></svg>

const LaptopIcon  = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
const CloudIcon   = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0"><path d="M17.5 19H9a7 7 0 116.71-9h1.79a4.5 4.5 0 110 9Z"/></svg>
const StashDrawerIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8h16M4 8v12a2 2 0 002 2h12a2 2 0 002-2V8M4 8l1.6-4.8A2 2 0 017.5 2h9a2 2 0 011.9 1.2L20 8"/><path d="M10 12h4v2h-4z"/></svg>

function RefPill({ item, onDoubleClickBranch }) {
  if (item.isTag) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-sm font-mono leading-none whitespace-nowrap bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
        {item.name}
      </span>
    )
  }

  if (item.isStash) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded font-mono leading-none whitespace-nowrap bg-brand-600/90 text-white transition-colors cursor-default">
        <StashDrawerIcon />
        {item.name}
      </span>
    )
  }

  // Branch
  return (
    <span 
      onDoubleClick={(e) => { 
        e.stopPropagation()
        const localBranch = item.originals.find(r => !r.startsWith('remotes/') && !r.startsWith('origin/'))
        onDoubleClickBranch?.(localBranch || item.name)
      }} 
      className={`group relative inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded font-mono leading-none whitespace-nowrap cursor-pointer transition-colors ${
        item.isHead ? 'bg-brand-600 text-white shadow shadow-brand-500/30'
        : item.isLocal ? 'bg-brand-600/90 text-white hover:bg-brand-500'
        : 'bg-surface-700 text-slate-300 hover:bg-surface-600 hover:text-white'
      }`}
    >
      {item.isHead && <span className="font-bold text-[12px] leading-none">✔</span>}
      {item.isLocal && <LaptopIcon />}
      {item.isRemote && <CloudIcon />}
      {item.name}
    </span>
  )
}

// ── Hover Tooltip ─────────────────────────────────────────────────────────────


function CommitTooltip({ info }) {
  const { commit, stats, x, y } = info

  // Keep tooltip on screen
  const safeX = Math.min(x, window.innerWidth - 300)

  return (
    <div
      className="fixed z-50 w-72 bg-surface-800 border border-surface-600 rounded-lg shadow-xl shadow-black/80 py-3 px-4 text-slate-300 pointer-events-none"
      style={{ top: y, left: safeX }}
    >
      <div className="flex items-start gap-3 mb-3">
        {commit.authorAvatar ? (
          <img src={commit.authorAvatar} alt="" className="w-10 h-10 rounded-full border border-surface-600 shrink-0 bg-surface-900" />
        ) : (
          <div className="w-10 h-10 rounded-full border border-surface-600 shrink-0 bg-surface-700 flex items-center justify-center font-bold text-lg">
            {commit.authorName?.[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-white font-medium text-sm leading-tight break-words">{commit.subject}</div>
          <div className="text-xs text-brand-400 mt-1">{commit.shortHash}</div>
        </div>
      </div>

      <div className="text-xs space-y-1 mb-3">
        <div className="flex justify-between">
          <span className="text-slate-500">Autor</span>
          <span className="text-slate-300">{commit.authorName} &lt;{commit.authorEmail}&gt;</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Fecha</span>
          <span className="text-slate-300">{new Date(commit.date).toLocaleString()}</span>
        </div>
      </div>

      {stats ? (
        <div className="pt-2 border-t border-surface-700">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">{stats.files} archivos</span>
            <div className="flex gap-2">
              <span className="text-emerald-400">+{stats.insertions}</span>
              <span className="text-red-400">-{stats.deletions}</span>
            </div>
          </div>
          {/* Bar graphic */}
          <div className="h-1.5 w-full bg-surface-900 rounded-full mt-1.5 flex overflow-hidden">
            {stats.insertions > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${(stats.insertions / (stats.insertions + stats.deletions)) * 100}%` }} />}
            {stats.deletions > 0 && <div className="bg-red-500 h-full" style={{ width: `${(stats.deletions / (stats.insertions + stats.deletions)) * 100}%` }} />}
          </div>
        </div>
      ) : (
        <div className="pt-2 border-t border-surface-700 text-center text-xs text-slate-500 italic">
          Cargando detalles...
        </div>
      )}
    </div>
  )
}

function shortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`
}
