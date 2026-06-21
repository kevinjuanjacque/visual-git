import { useState, useEffect, useCallback, useRef } from 'react'

const POLL_MS = 2000

/**
 * Polls `git status`, `git stash list`, and `git tags` for the active repo.
 * Returns WIP state so the graph can show the // WIP node and the staging panel.
 */
export function useGitStatus(repoPath) {
  const [staged,    setStaged]    = useState([])
  const [unstaged,  setUnstaged]  = useState([])
  const [untracked, setUntracked] = useState([])
  const [hasWip,    setHasWip]    = useState(false)
  const [tags,      setTags]      = useState([])
  const [stashes,   setStashes]   = useState([])
  const intervalRef = useRef(null)

  const fetchStatus = useCallback(async (path) => {
    if (!path) return
    try {
      const res = await window.electronAPI.getStatus(path)
      if (!res.ok) return
      const s = res.status

      const stagedFiles = [
        ...s.staged.map(f => ({ path: f, mode: 'staged', kind: 'modified' })),
        ...s.created.map(f => ({ path: f, mode: 'staged', kind: 'added' })),
        ...s.deleted.filter(f => s.staged.includes(f)).map(f => ({ path: f, mode: 'staged', kind: 'deleted' })),
      ]
      const unstagedFiles = [
        ...s.modified.filter(f => !s.staged.includes(f)).map(f => ({ path: f, mode: 'unstaged', kind: 'modified' })),
        ...s.deleted.filter(f => !s.staged.includes(f)).map(f => ({ path: f, mode: 'unstaged', kind: 'deleted' })),
      ]
      const untrackedFiles = s.not_added.map(f => ({ path: f, mode: 'untracked', kind: 'untracked' }))

      setStaged(stagedFiles)
      setUnstaged(unstagedFiles)
      setUntracked(untrackedFiles)
      setHasWip(stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0)
    } catch { /* ignore */ }
  }, [])

  const fetchTags = useCallback(async (path) => {
    if (!path) return
    try {
      const res = await window.electronAPI.getTags(path)
      if (res.ok) setTags(res.tags)
    } catch { /* ignore */ }
  }, [])

  const fetchStashes = useCallback(async (path) => {
    if (!path) return
    try {
      const res = await window.electronAPI.getStashes(path)
      if (res.ok) setStashes(res.stashes)
    } catch { /* ignore */ }
  }, [])

  const refresh = useCallback((path) => {
    fetchStatus(path)
    fetchStashes(path)
  }, [fetchStatus, fetchStashes])

  useEffect(() => {
    if (!repoPath) {
      setStaged([])
      setUnstaged([])
      setUntracked([])
      setHasWip(false)
      setTags([])
      setStashes([])
      return
    }
    fetchStatus(repoPath)
    fetchTags(repoPath)
    fetchStashes(repoPath)
    intervalRef.current = setInterval(() => refresh(repoPath), POLL_MS)
    return () => clearInterval(intervalRef.current)
  }, [repoPath, fetchStatus, fetchTags, fetchStashes, refresh])

  return { staged, unstaged, untracked, hasWip, tags, stashes, refreshStatus: () => refresh(repoPath) }
}
