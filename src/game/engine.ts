// ============================================================
// Plush Crush 核心三消引擎（Candy Crush 式完整机制）
// 纯函数 + 数据，不依赖 React
// ============================================================

export type Special = 'none' | 'h' | 'v' | 'wrap' | 'bomb'

export interface Cell {
  id: number
  row: number
  col: number
  /** 动物类型 0..NUM_TYPES-1；彩色炸弹 type = -1 */
  type: number
  special: Special
  /** 仅用于渲染：新下落块的初始行（负数），渲染一帧后清除 */
  renderRow?: number
}

export const ROWS = 8
export const COLS = 8
export const NUM_TYPES = 6

let nextId = 1

export function makeCell(row: number, col: number, type: number, special: Special = 'none'): Cell {
  return { id: nextId++, row, col, type, special }
}

const rndType = () => Math.floor(Math.random() * NUM_TYPES)

export function cellAt(cells: Cell[], row: number, col: number): Cell | undefined {
  return cells.find((c) => c.row === row && c.col === col)
}

/** 假设 (row,col) 放置 type，是否会形成 3 连 */
function createsMatch(cells: Cell[], row: number, col: number, type: number): boolean {
  const t = (r: number, c: number): number => {
    if (r === row && c === col) return type
    const cell = cellAt(cells, r, c)
    return cell ? cell.type : -99
  }
  let run = 1
  for (let c = col - 1; t(row, c) === type; c--) run++
  for (let c = col + 1; t(row, c) === type; c++) run++
  if (run >= 3) return true
  run = 1
  for (let r = row - 1; t(r, col) === type; r--) run++
  for (let r = row + 1; t(r, col) === type; r++) run++
  return run >= 3
}

/** 生成无初始消除、且保证有可行动作的棋盘 */
export function createBoard(): Cell[] {
  for (let attempt = 0; attempt < 200; attempt++) {
    const cells: Cell[] = []
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let type = rndType()
        let guard = 0
        while (createsMatch(cells, r, c, type) && guard++ < 30) type = rndType()
        cells.push(makeCell(r, c, type))
      }
    }
    if (findPossibleMove(cells)) return cells
  }
  // 兜底：极小概率到达
  const cells: Cell[] = []
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) cells.push(makeCell(r, c, (r + c) % NUM_TYPES))
  return cells
}

// ------------------------------------------------------------
// 匹配检测
// ------------------------------------------------------------

interface Run {
  cells: Cell[]
  dir: 'h' | 'v'
}

export interface MatchGroup {
  cells: Cell[]
  orientations: ('h' | 'v')[]
  maxRun: number
  runDir: 'h' | 'v' | null
  intersection: Cell | null
}

export function findMatches(cells: Cell[]): MatchGroup[] {
  const runs: Run[] = []

  for (let r = 0; r < ROWS; r++) {
    let c = 0
    while (c < COLS) {
      const start = cellAt(cells, r, c)
      if (!start || start.type < 0) {
        c++
        continue
      }
      let len = 1
      while (c + len < COLS && cellAt(cells, r, c + len)?.type === start.type) len++
      if (len >= 3) {
        const runCells: Cell[] = []
        for (let i = 0; i < len; i++) runCells.push(cellAt(cells, r, c + i)!)
        runs.push({ cells: runCells, dir: 'h' })
      }
      c += len
    }
  }

  for (let c = 0; c < COLS; c++) {
    let r = 0
    while (r < ROWS) {
      const start = cellAt(cells, r, c)
      if (!start || start.type < 0) {
        r++
        continue
      }
      let len = 1
      while (r + len < ROWS && cellAt(cells, r + len, c)?.type === start.type) len++
      if (len >= 3) {
        const runCells: Cell[] = []
        for (let i = 0; i < len; i++) runCells.push(cellAt(cells, r + i, c)!)
        runs.push({ cells: runCells, dir: 'v' })
      }
      r += len
    }
  }

  // 并查集：共享格子的 run 合并为一个 group（L/T 形）
  const parent = runs.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const ids = new Set(runs[i].cells.map((c) => c.id))
      if (runs[j].cells.some((c) => ids.has(c.id))) union(i, j)
    }
  }

  const groups = new Map<number, Run[]>()
  runs.forEach((run, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(run)
  })

  return [...groups.values()].map((gRuns) => {
    const cellMap = new Map<number, Cell>()
    const orientSet = new Set<'h' | 'v'>()
    let maxRun = 0
    let runDir: 'h' | 'v' | null = null
    for (const run of gRuns) {
      run.cells.forEach((c) => cellMap.set(c.id, c))
      orientSet.add(run.dir)
      if (run.cells.length > maxRun) {
        maxRun = run.cells.length
        runDir = run.dir
      }
    }
    let intersection: Cell | null = null
    if (orientSet.size === 2) {
      const hIds = new Set(gRuns.filter((r) => r.dir === 'h').flatMap((r) => r.cells.map((c) => c.id)))
      const vIds = new Set(gRuns.filter((r) => r.dir === 'v').flatMap((r) => r.cells.map((c) => c.id)))
      const inter = [...hIds].find((id) => vIds.has(id))
      if (inter !== undefined) intersection = cellMap.get(inter)!
    }
    return {
      cells: [...cellMap.values()],
      orientations: [...orientSet],
      maxRun,
      runDir,
      intersection,
    }
  })
}

/** 根据匹配形状决定生成的特殊块；preferred 为优先生成位置（交换入位的格子） */
export function planSpecial(
  group: MatchGroup,
  preferred: Cell | null,
): { cellId: number; special: Special } | null {
  const pick = (): Cell => {
    if (preferred && group.cells.some((c) => c.id === preferred.id)) return preferred
    return group.cells[Math.floor(group.cells.length / 2)]
  }
  if (group.maxRun >= 5) return { cellId: pick().id, special: 'bomb' }
  if (group.orientations.length === 2) return { cellId: (group.intersection ?? pick()).id, special: 'wrap' }
  if (group.maxRun === 4) return { cellId: pick().id, special: group.runDir === 'v' ? 'v' : 'h' }
  return null
}

// ------------------------------------------------------------
// 消除扩散（特殊块连锁）
// ------------------------------------------------------------

export function expandClear(cells: Cell[], initial: Set<number>): Set<number> {
  const cleared = new Set(initial)
  const queue = [...initial]
  while (queue.length) {
    const id = queue.shift()!
    const cell = cells.find((c) => c.id === id)
    if (!cell) continue
    const add = (list: (Cell | undefined)[]) => {
      for (const cc of list) {
        if (cc && !cleared.has(cc.id)) {
          cleared.add(cc.id)
          queue.push(cc.id)
        }
      }
    }
    if (cell.special === 'h') {
      add(cells.filter((c) => c.row === cell.row))
    } else if (cell.special === 'v') {
      add(cells.filter((c) => c.col === cell.col))
    } else if (cell.special === 'wrap') {
      add(cells.filter((c) => Math.abs(c.row - cell.row) <= 1 && Math.abs(c.col - cell.col) <= 1))
    } else if (cell.special === 'bomb') {
      const counts = new Map<number, number>()
      for (const c of cells) {
        if (c.type >= 0 && !cleared.has(c.id)) counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
      }
      let best = -1
      let bestN = -1
      counts.forEach((n, t) => {
        if (n > bestN) {
          bestN = n
          best = t
        }
      })
      if (best >= 0) add(cells.filter((c) => c.type === best))
    }
  }
  return cleared
}

// ------------------------------------------------------------
// 特殊块交换组合
// ------------------------------------------------------------

const isStriped = (s: Special) => s === 'h' || s === 'v'

export function specialSwapClear(cells: Cell[], a: Cell, b: Cell): Set<number> | null {
  const A = a.special
  const B = b.special
  if (A === 'none' && B === 'none') return null

  // 炸弹 + 炸弹：清全盘
  if (A === 'bomb' && B === 'bomb') {
    return new Set(cells.map((c) => c.id))
  }

  if (A === 'bomb' || B === 'bomb') {
    const bomb = A === 'bomb' ? a : b
    const other = A === 'bomb' ? b : a

    if (isStriped(other.special)) {
      // 该动物全部变成条纹并引爆：交替清行/列
      const init = new Set<number>([bomb.id])
      const targets = cells.filter((c) => c.type === other.type)
      targets.forEach((c, i) => {
        const line = i % 2 === 0 ? cells.filter((x) => x.row === c.row) : cells.filter((x) => x.col === c.col)
        line.forEach((x) => init.add(x.id))
      })
      return expandClear(cells, init)
    }

    if (other.special === 'wrap') {
      // 清两种颜色
      const t1 = other.type
      const counts = new Map<number, number>()
      for (const c of cells) {
        if (c.type >= 0 && c.type !== t1) counts.set(c.type, (counts.get(c.type) ?? 0) + 1)
      }
      let t2 = -1
      let bestN = -1
      counts.forEach((n, t) => {
        if (n > bestN) {
          bestN = n
          t2 = t
        }
      })
      const init = new Set<number>([bomb.id])
      cells.filter((c) => c.type === t1 || c.type === t2).forEach((c) => init.add(c.id))
      return expandClear(cells, init)
    }

    // 炸弹 + 普通动物：清该动物全部
    const init = new Set<number>([bomb.id])
    cells.filter((c) => c.type === other.type).forEach((c) => init.add(c.id))
    return expandClear(cells, init)
  }

  // 条纹 + 条纹：十字
  if (isStriped(A) && isStriped(B)) {
    const init = new Set<number>([a.id, b.id])
    cells.filter((c) => c.row === b.row || c.col === b.col).forEach((c) => init.add(c.id))
    return expandClear(cells, init)
  }

  // 条纹 + 包装：3 行 3 列
  if ((isStriped(A) && B === 'wrap') || (A === 'wrap' && isStriped(B))) {
    const init = new Set<number>([a.id, b.id])
    cells
      .filter((c) => Math.abs(c.row - b.row) <= 1 || Math.abs(c.col - b.col) <= 1)
      .forEach((c) => init.add(c.id))
    return expandClear(cells, init)
  }

  // 包装 + 包装：5x5 大爆炸
  if (A === 'wrap' && B === 'wrap') {
    const init = new Set<number>([a.id, b.id])
    cells
      .filter((c) => Math.abs(c.row - b.row) <= 2 && Math.abs(c.col - b.col) <= 2)
      .forEach((c) => init.add(c.id))
    return expandClear(cells, init)
  }

  // 条纹/包装与普通块交换：按普通交换处理
  return null
}

// ------------------------------------------------------------
// 重力与补充
// ------------------------------------------------------------

export function applyGravity(cells: Cell[], cleared: Set<number>): Cell[] {
  const remaining = cells.filter((c) => !cleared.has(c.id))
  const result: Cell[] = []
  for (let col = 0; col < COLS; col++) {
    const colCells = remaining.filter((c) => c.col === col).sort((a, b) => a.row - b.row)
    let writeRow = ROWS - 1
    for (let i = colCells.length - 1; i >= 0; i--) {
      result.push({ ...colCells[i], row: writeRow, renderRow: undefined })
      writeRow--
    }
    const missing = writeRow + 1
    for (let k = 0; k < missing; k++) {
      const finalRow = writeRow - k
      const cell = makeCell(finalRow, col, rndType())
      cell.renderRow = finalRow - missing // 从棋盘上方落入
      result.push(cell)
    }
  }
  return result
}

export function stripRenderRow(cells: Cell[]): Cell[] {
  return cells.map((c) => (c.renderRow !== undefined ? { ...c, renderRow: undefined } : c))
}

// ------------------------------------------------------------
// 可行动作检测 / 洗牌
// ------------------------------------------------------------

export function findPossibleMove(cells: Cell[]): [Cell, Cell] | null {
  const dirs: [number, number][] = [
    [0, 1],
    [1, 0],
  ]
  for (const cell of cells) {
    for (const [dr, dc] of dirs) {
      const other = cellAt(cells, cell.row + dr, cell.col + dc)
      if (!other) continue
      if (cell.special === 'bomb' || other.special === 'bomb') return [cell, other]
      // 假设交换 type
      const t1 = cell.type
      const t2 = other.type
      cell.type = t2
      other.type = t1
      const ok = createsMatch(cells, cell.row, cell.col, cell.type) || createsMatch(cells, other.row, other.col, other.type)
      cell.type = t1
      other.type = t2
      if (ok) return [cell, other]
    }
  }
  return null
}

export function shuffleBoard(cells: Cell[]): Cell[] {
  for (let attempt = 0; attempt < 100; attempt++) {
    const shuffled = cells.map((c) => ({ ...c, special: 'none' as Special, renderRow: undefined }))
    // 按位置重排类型，避免初始匹配
    const sorted = [...shuffled].sort((a, b) => a.row - b.row || a.col - b.col)
    for (const cell of sorted) {
      let type = rndType()
      let guard = 0
      while (createsMatch(shuffled, cell.row, cell.col, type) && guard++ < 30) type = rndType()
      cell.type = type
    }
    if (findMatches(shuffled).length === 0 && findPossibleMove(shuffled)) return shuffled
  }
  return cells.map((c) => ({ ...c, special: 'none' as Special, renderRow: undefined }))
}

export function areAdjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1
}
