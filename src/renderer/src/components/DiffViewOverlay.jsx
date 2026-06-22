import { useState, useEffect } from 'react'

export default function DiffViewOverlay({ fileParams, repoPath, onClose }) {
  const [diff, setDiff] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!fileParams || !repoPath) return
    setLoading(true)
    setError(null)
    setDiff(null)

    window.electronAPI.getFileDiff({
      folderPath: repoPath,
      file: fileParams.file,
      cached: fileParams.cached || false,
      commitHash: fileParams.commitHash || null
    })
    .then(res => {
      if (!res.ok) throw new Error(res.error || 'No diff available')
      setDiff(res.diff || '')
    })
    .catch(err => setError(err.message))
    .finally(() => setLoading(false))

  }, [fileParams, repoPath])

  return (
    <div className="absolute inset-0 z-[100] bg-surface-900 flex flex-col">
      {/* Header */}
      <div className="h-12 border-b border-surface-700/60 shrink-0 flex items-center justify-between px-4 bg-surface-850">
        <div className="flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" className="shrink-0">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-[13px] font-mono text-slate-200">{fileParams?.file}</span>
          {fileParams?.isWip && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400">WIP</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded hover:bg-surface-700 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-surface-900 p-4">
        {loading && (
          <div className="flex items-center justify-center h-full text-slate-500 gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            <span className="text-sm">Cargando diff...</span>
          </div>
        )}
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded text-[13px]">
              {error}
            </div>
          </div>
        )}
        {!loading && !error && diff !== null && (
          <DiffContent raw={diff} />
        )}
      </div>
    </div>
  )
}

function DiffContent({ raw }) {
  if (!raw) return <div className="text-slate-500 text-[12px] italic">No hay cambios o el archivo es binario.</div>
  
  const parsedLines = []
  let oldLine = 0
  let newLine = 0

  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- a/') || line.startsWith('+++ b/')) {
      continue
    }

    if (line.startsWith('@@ ')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (match) {
        oldLine = parseInt(match[1], 10)
        newLine = parseInt(match[2], 10)
      }
      parsedLines.push({ type: 'hunk-header', content: '' })
      continue
    }

    if (line.startsWith('-')) {
      parsedLines.push({ type: 'deleted', oldLine: oldLine++, newLine: null, content: line })
    } else if (line.startsWith('+')) {
      parsedLines.push({ type: 'added', oldLine: null, newLine: newLine++, content: line })
    } else if (line.startsWith('\\')) {
      // Ignore "\ No newline at end of file"
      continue
    } else {
      // Context or empty
      parsedLines.push({ type: 'context', oldLine: oldLine++, newLine: newLine++, content: line || ' ' })
    }
  }

  return (
    <div className="font-mono text-[12px] leading-snug">
      {parsedLines.map((item, i) => {
        if (item.type === 'hunk-header') {
          return (
            <div key={i} className="h-6 bg-surface-850/50 my-1 rounded flex items-center justify-center text-[10px] text-slate-600 border border-surface-700/30">
              ···
            </div>
          )
        }

        let cls = 'text-slate-400'
        let bg = 'hover:bg-surface-800'
        let numColor = 'text-slate-600/70'
        
        if (item.type === 'added') {
          cls = 'text-emerald-300'
          bg = 'bg-emerald-900/20'
          numColor = 'text-emerald-600/60'
        } else if (item.type === 'deleted') {
          cls = 'text-red-300'
          bg = 'bg-red-900/20'
          numColor = 'text-red-600/60'
        }

        return (
          <div key={i} className={`flex group ${bg}`}>
            <div className={`w-10 shrink-0 border-r border-surface-700/30 text-right pr-2 select-none ${numColor}`}>
              {item.oldLine || ''}
            </div>
            <div className={`w-10 shrink-0 border-r border-surface-700/30 text-right pr-2 select-none ${numColor}`}>
              {item.newLine || ''}
            </div>
            <div className={`flex-1 px-3 whitespace-pre-wrap break-all ${cls}`}>
              {item.content}
            </div>
          </div>
        )
      })}
    </div>
  )
}
