/**
 * Paleta de colores estilo GitKraken para los lanes del grafo.
 * Col 0 = rama principal (cian), el resto rota entre colores vibrantes.
 */
const LANE_COLORS = [
  '#0ea5e9', // col 0 — cian (main)
  '#2dd4bf', // teal/verde
  '#a78bfa', // violeta
  '#f472b6', // rosa/magenta
  '#fb923c', // naranja
  '#facc15', // amarillo
  '#34d399', // esmeralda
  '#f87171', // rojo coral
  '#60a5fa', // azul claro
  '#c084fc', // púrpura
  '#fbbf24', // ámbar
  '#4ade80', // verde lima
]

/**
 * Calcula el layout del git graph garantizando:
 *  - Col 0 SIEMPRE es la rama principal (main/master/HEAD)
 *  - Las demás ramas ocupan col 1, 2, 3… en el orden en que aparecen
 *    en el log topológico: commits más recientes → columnas más bajas.
 *  - Asignación inteligente de lanes para minimizar cruces.
 *
 * Algoritmo:
 *  1. Identifica el "main line": cadena first-parent desde HEAD.
 *  2. Pre-reserva col 0 para el primer commit main-line del array.
 *  3. Loop por cada commit:
 *     - Main-line  → forzado a col 0.
 *     - No-main    → primer slot libre en col ≥ 1, preferentemente
 *       adyacente al padre para reducir cruces.
 *  4. Genera `activeLanes` (snapshot antes de modificar) para las
 *     pass-through lines del SVG.
 */
export function calculateLayout(commits) {
  if (!commits?.length) return []

  const commitMap = new Map(commits.map(c => [c.hash, c]))

  // ── 1. Identifica la línea principal (first-parent desde HEAD) ──────────
  const mainSet = buildMainLine(commits, commitMap)

  // ── 2. Pre-seed: reserva col 0 para el primer commit main del array ─────
  const firstMain = commits.find(c => mainSet.has(c.hash))
  const lanes = firstMain ? [firstMain.hash] : [null]

  const result = []

  for (const commit of commits) {
    // ── Libera lanes reservados para este commit ──────────────────────────
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === 'reserved:' + commit.hash) {
        lanes[i] = null
      }
    }

    // Snapshot ANTES de modificar lanes → para pass-through lines en el SVG
    const activeLanes = [...lanes]
    const isMain = mainSet.has(commit.hash)
    let col

    // ── Asigna columna ────────────────────────────────────────────────────
    if (isMain) {
      col = 0
      if (!lanes[0] || lanes[0] !== commit.hash) lanes[0] = commit.hash
    } else {
      col = -1
      // Busca si este commit ya tiene un lane reservado
      for (let i = 1; i < lanes.length; i++) {
        if (lanes[i] === commit.hash) { col = i; break }
      }
      if (col === -1) {
        // Busca el slot libre más cercano a col 1 (preferir columnas bajas)
        let free = -1
        for (let i = 1; i < lanes.length; i++) {
          if (!lanes[i]) { free = i; break }
        }
        col = free !== -1 ? free : Math.max(1, lanes.length)
        while (lanes.length <= col) lanes.push(null)
        lanes[col] = commit.hash
      }
    }

    // ── Procesa padres ────────────────────────────────────────────────────
    const connections = []

    if (commit.parents.length === 0) {
      lanes[col] = null
    } else {
      const [p0hash, ...extraParents] = commit.parents
      const p0IsMain    = mainSet.has(p0hash)
      const p0ExistCol  = lanes.indexOf(p0hash)

      // — Primer padre ────────────────────────────────────────────────────
      if (isMain && p0IsMain) {
        // main → main: permanece en col 0
        lanes[0] = p0hash
        connections.push({ fromCol: 0, toCol: 0, toHash: p0hash, type: 'continue' })

      } else if (!isMain && p0IsMain) {
        // Rama lateral cuyo padre es main (divergencia o fin de rama)
        lanes[col] = 'reserved:' + p0hash
        connections.push({ fromCol: col, toCol: 0, toHash: p0hash, type: 'merge-to' })

      } else if (p0ExistCol !== -1) {
        if (p0ExistCol === col) {
          connections.push({ fromCol: col, toCol: col, toHash: p0hash, type: 'continue' })
        } else {
          lanes[col] = 'reserved:' + p0hash
          connections.push({ fromCol: col, toCol: p0ExistCol, toHash: p0hash, type: 'merge-to' })
        }
      } else {
        lanes[col] = p0hash
        connections.push({ fromCol: col, toCol: col, toHash: p0hash, type: 'continue' })
      }

      // — Padres adicionales (merge commits) ──────────────────────────────
      for (const ph of extraParents) {
        const phIsMain   = mainSet.has(ph)
        const phExistCol = lanes.indexOf(ph)

        if (phExistCol !== -1) {
          connections.push({ fromCol: col, toCol: phExistCol, toHash: ph, type: 'merge-from' })
        } else if (phIsMain) {
          if (!lanes[0]) lanes[0] = ph
          connections.push({ fromCol: col, toCol: 0, toHash: ph, type: 'merge-from' })
        } else {
          // Buscar slot libre adyacente al commit actual para reducir cruces
          let free = findBestFreeSlot(lanes, col)
          const newCol = free !== -1 ? free : Math.max(1, lanes.length)
          while (lanes.length <= newCol) lanes.push(null)
          lanes[newCol] = ph
          connections.push({ fromCol: col, toCol: newCol, toHash: ph, type: 'branch-from' })
        }
      }
    }

    // Limpia nulls al final (mantiene mínimo col 0)
    while (lanes.length > 1 && lanes[lanes.length - 1] === null) lanes.pop()

    result.push({
      ...commit,
      col,
      connections,
      activeLanes,
      color:     LANE_COLORS[col % LANE_COLORS.length],
      totalCols: Math.max(lanes.length, col + 1)
    })
  }

  return result
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MAIN_NAMES = new Set(['main', 'master', 'trunk', 'develop'])

/**
 * Construye el Set de hashes que forman la "main line":
 * cadena first-parent desde el commit HEAD (o main/master).
 */
function buildMainLine(commits, commitMap) {
  const set = new Set()

  let head = commits.find(c => c.isHead)
  if (!head) head = commits.find(c => c.branches?.some(b => MAIN_NAMES.has(b)))
  if (!head) head = commits[0]
  if (!head) return set

  let cur = head
  const visited = new Set()
  while (cur && !visited.has(cur.hash)) {
    visited.add(cur.hash)
    set.add(cur.hash)
    cur = cur.parents[0] ? commitMap.get(cur.parents[0]) : null
  }

  return set
}

/**
 * Busca el slot libre más cercano a `targetCol` para minimizar cruces.
 * Prioriza slots adyacentes (targetCol+1, targetCol-1, etc.)
 */
function findBestFreeSlot(lanes, targetCol) {
  // Primero intenta slots cercanos al target
  for (let dist = 1; dist < lanes.length + 2; dist++) {
    const right = targetCol + dist
    if (right >= 1 && right < lanes.length && !lanes[right]) return right
    const left = targetCol - dist
    if (left >= 1 && left < lanes.length && !lanes[left]) return left
  }
  return -1
}

export { LANE_COLORS }
