import { useState, useEffect, useCallback, useRef } from 'react'
import { calculateLayout } from '../utils/graphLayout'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000 // 5 minutos

export function useGitData(repoPath) {
  const [commits, setCommits]               = useState([])
  const [branches, setBranches]             = useState([])
  const [currentBranch, setCurrentBranch]   = useState('')
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState(null)
  const [lastRefresh, setLastRefresh]       = useState(null)
  const [nextRefresh, setNextRefresh]       = useState(null)
  const intervalRef = useRef(null)
  const countdownRef = useRef(null)

  const fetchLog = useCallback(async (path) => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      const data = await window.electronAPI.getLog(path)
      const layoutCommits = calculateLayout(data.commits)
      setCommits(layoutCommits)
      setBranches(data.branches)
      setCurrentBranch(data.currentBranch)
      const now = new Date()
      setLastRefresh(now)
      setNextRefresh(new Date(now.getTime() + REFRESH_INTERVAL_MS))
    } catch (err) {
      setError(err.message || 'Error al leer el repositorio')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch inicial y cuando cambia el repo
  useEffect(() => {
    if (!repoPath) {
      setCommits([])
      setBranches([])
      setCurrentBranch('')
      setLastRefresh(null)
      setNextRefresh(null)
      return
    }

    fetchLog(repoPath)

    // Auto-refresh cada 5 minutos
    intervalRef.current = setInterval(() => {
      fetchLog(repoPath)
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
    refresh
  }
}
