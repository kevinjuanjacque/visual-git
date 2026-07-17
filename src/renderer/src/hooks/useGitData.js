import { useState, useEffect, useCallback, useRef } from 'react'
import { calculateLayout } from '../utils/graphLayout'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutos

export function useGitData(repoPath, pinnedBranches = []) {
  const [commits, setCommits]               = useState([])
  const [rawCommits, setRawCommits]         = useState([])
  const [branches, setBranches]             = useState([])
  const [currentBranch, setCurrentBranch]   = useState('')
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState(null)
  const [lastRefresh, setLastRefresh]       = useState(null)
  const [nextRefresh, setNextRefresh]       = useState(null)
  const intervalRef = useRef(null)
  const countdownRef = useRef(null)
  const isRequestInFlightRef = useRef(false)

  const [hasMore, setHasMore]               = useState(false)
  const [skip, setSkip]                     = useState(0)
  const PAGE_SIZE = 200

  const fetchLog = useCallback(async (path, currentSkip = 0, append = false, fetchRemote = false) => {
    if (!path || isRequestInFlightRef.current) return
    isRequestInFlightRef.current = true
    setLoading(true)
    setError(null)
    try {
      const data = await window.electronAPI.getLog({ folderPath: path, maxCount: PAGE_SIZE, skip: currentSkip, fetchRemote })
      setRawCommits(previousCommits => {
        const nextCommits = append ? [...previousCommits, ...data.commits] : data.commits
        return Array.from(new Map(nextCommits.map(commit => [commit.hash, commit])).values())
      })
      setBranches(data.branches)
      setCurrentBranch(data.currentBranch)
      setHasMore(data.hasMore)
      setSkip(currentSkip)
      const now = new Date()
      setLastRefresh(now)
      setNextRefresh(new Date(now.getTime() + REFRESH_INTERVAL_MS))
    } catch (err) {
      setError(err.message || 'Error al leer el repositorio')
    } finally {
      isRequestInFlightRef.current = false
      setLoading(false)
    }
  }, [])

  const loadMoreCommits = useCallback(() => {
    if (!hasMore || loading) return
    fetchLog(repoPath, skip + PAGE_SIZE, true)
  }, [hasMore, loading, repoPath, skip, fetchLog])

  // Recalcular layout instantáneamente si cambian los commits crudos o las ramas pineadas
  useEffect(() => {
    if (rawCommits.length > 0) {
      setCommits(calculateLayout(rawCommits, pinnedBranches))
    } else {
      setCommits([])
    }
  }, [rawCommits, pinnedBranches])

  // Fetch inicial y cuando cambia el repo
  useEffect(() => {
    if (!repoPath) {
      setRawCommits([])
      setCommits([])
      setBranches([])
      setCurrentBranch('')
      setLastRefresh(null)
      setNextRefresh(null)
      return
    }

    fetchLog(repoPath, 0, false)

    // Auto-refresh cada 5 minutos
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      fetchLog(repoPath, 0, false)
    }, REFRESH_INTERVAL_MS)

    return () => {
      clearInterval(intervalRef.current)
      clearInterval(countdownRef.current)
    }
  }, [repoPath, fetchLog])

  const refresh = useCallback(() => {
    if (!repoPath) return
    clearInterval(intervalRef.current)
    fetchLog(repoPath)
    intervalRef.current = setInterval(() => {
      fetchLog(repoPath)
    }, REFRESH_INTERVAL_MS)
  }, [repoPath, fetchLog])

  return {
    commits,
    branches,
    currentBranch,
    loading,
    error,
    lastRefresh,
    nextRefresh,
    hasMore,
    loadMoreCommits,
    refresh: () => {
      if (repoPath) fetchLog(repoPath, 0, false)
    },
    networkRefresh: () => {
      if (repoPath) fetchLog(repoPath, 0, false, true)
    }
  }
}
