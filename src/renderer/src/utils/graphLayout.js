/**
 * graphLayout.js
 * 
 * Implementación de grafo tipo GitKraken / GitLens.
 * Calcula el ruteo fila por fila, permitiendo renderizado segmentado (sin SVGs gigantes).
 */

const LANE_COLORS = [
  '#0ea5e9', // cian
  '#2dd4bf', // teal
  '#a78bfa', // violeta
  '#f472b6', // rosa
  '#fb923c', // naranja
  '#facc15', // amarillo
  '#34d399', // esmeralda
  '#f87171', // rojo
  '#60a5fa', // azul claro
  '#c084fc', // púrpura
  '#fbbf24', // ámbar
  '#4ade80', // lima
]

/**
 * Calcula el layout por segmentos.
 * @param {Array} commits - Lista de commits en orden topológico inverso (más nuevo primero).
 * @param {Array} pinnedBranches - Nombres de ramas a mantener fijas a la izquierda ['main', 'dev'].
 */
export function calculateLayout(commits, pinnedBranches = []) {
  if (!commits?.length) return []

  const pinnedSets = []
  for (const branch of pinnedBranches) {
    let head = commits.find(c => c.branches?.includes(branch))
    if (!head && branch.startsWith('origin/')) {
      head = commits.find(c => c.branches?.includes(branch.replace('origin/', 'remotes/origin/')))
    }
    if (head) {
      const set = new Set()
      let cur = head
      while (cur && !set.has(cur.hash)) {
        set.add(cur.hash)
        cur = cur.parents?.[0] ? commits.find(c => c.hash === cur.parents[0]) : null
      }
      pinnedSets.push({ branch, set, col: pinnedSets.length })
    }
  }

  function getPinnedCol(hash) {
    for (const p of pinnedSets) {
      if (p.set.has(hash)) return p.col
    }
    return -1
  }

  const lanes = [] // Array of { hash, colorIdx }
  const colorAssignment = new Map()
  let maxColsUsed = 0

  const result = []

  for (const commit of commits) {
    const isWip = commit.isWip

    // Snapshot of lanes entering this row from the top
    const activeLanes = lanes.map(lane => {
      if (!lane) return null
      return { hash: lane.hash, colorIdx: lane.colorIdx }
    })

    let col = -1
    const pinnedCol = getPinnedCol(commit.hash)

    // Find all incoming lanes that carry this commit
    const incomingCols = []
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i]?.hash === commit.hash) incomingCols.push(i)
    }

    if (pinnedCol !== -1) {
      col = pinnedCol
    } else if (incomingCols.length > 0) {
      col = incomingCols[0]
    } else {
      let free = -1
      for (let i = 0; i < lanes.length; i++) {
        if (!lanes[i] && !pinnedSets.some(p => p.col === i)) { free = i; break; }
      }
      if (free === -1) {
        free = lanes.length
        while (pinnedSets.some(p => p.col === free)) free++
      }
      col = free
    }
    while (lanes.length <= col) lanes.push(null)

    if (!colorAssignment.has(commit.hash)) {
      if (incomingCols.length > 0) colorAssignment.set(commit.hash, lanes[incomingCols[0]].colorIdx)
      else colorAssignment.set(commit.hash, col)
    }

    // Incoming connections (bend at Parent)
    const incomingConnections = incomingCols.filter(ic => ic !== col).map(ic => ({
      fromCol: ic,
      colorIdx: lanes[ic].colorIdx
    }))

    // Consume incoming lanes
    for (const ic of incomingCols) {
      lanes[ic] = null
    }

    const outgoingConnections = []

    if (commit.parents?.length > 0) {
      for (let i = 0; i < commit.parents.length; i++) {
        const pHash = commit.parents[i]

        let existingCol = -1
        for (let j = 0; j < lanes.length; j++) {
          if (lanes[j]?.hash === pHash) { existingCol = j; break; }
        }

        if (i === 0) {
          // First parent ALWAYS continues in same column, deferring bend to parent
          lanes[col] = { hash: pHash, colorIdx: colorAssignment.get(commit.hash) }
          if (!colorAssignment.has(pHash)) colorAssignment.set(pHash, colorAssignment.get(commit.hash))
        } else {
          if (existingCol !== -1) {
            // Merge parent is already active. Bend out from Child immediately.
            outgoingConnections.push({ toCol: existingCol, colorIdx: lanes[existingCol].colorIdx })
          } else {
            // Merge parent not active. Create new lane and bend out.
            let free = -1
            for (let j = 0; j < lanes.length; j++) {
              if (!lanes[j] && !pinnedSets.some(p => p.col === j)) { free = j; break; }
            }
            if (free === -1) {
              free = lanes.length
              while (pinnedSets.some(p => p.col === free)) free++
            }
            while (lanes.length <= free) lanes.push(null)

            if (!colorAssignment.has(pHash)) colorAssignment.set(pHash, free)
            lanes[free] = { hash: pHash, colorIdx: colorAssignment.get(pHash) }

            outgoingConnections.push({ toCol: free, colorIdx: colorAssignment.get(pHash) })
          }
        }
      }
    }

    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }

    maxColsUsed = Math.max(maxColsUsed, lanes.length, col + 1)

    result.push({
      ...commit,
      col,
      activeLanes,
      incomingConnections,
      outgoingConnections,
      color: isWip ? '#94a3b8' : LANE_COLORS[colorAssignment.get(commit.hash) % LANE_COLORS.length],
      totalCols: maxColsUsed
    })
  }

  for (const r of result) r.totalCols = maxColsUsed

  return result
}

export { LANE_COLORS }
