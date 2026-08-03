// 引擎冒烟测试（Node 24 原生类型剥离）
import {
  createBoard, findMatches, findPossibleMove, applyGravity,
  specialSwapClear, expandClear, shuffleBoard, makeCell, ROWS, COLS,
} from './src/game/engine.ts'

let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) { pass++ } else { fail++; console.log('FAIL:', name) } }

// 1. 初始棋盘无匹配、有可行步
for (let i = 0; i < 50; i++) {
  const b = createBoard()
  ok(b.length === ROWS * COLS, 'board size')
  ok(findMatches(b).length === 0, 'no initial matches')
  ok(findPossibleMove(b) !== null, 'has possible move')
}

// 2. 构造 4 连检测 + 特殊块计划
{
  const cells = []
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push(makeCell(r, c, (r * 3 + c * 7) % 6))
  // 手动造一个行 4 连
  cells.find(c => c.row === 0 && c.col === 0).type = 2
  cells.find(c => c.row === 0 && c.col === 1).type = 2
  cells.find(c => c.row === 0 && c.col === 2).type = 2
  cells.find(c => c.row === 0 && c.col === 3).type = 2
  const groups = findMatches(cells)
  ok(groups.some(g => g.maxRun >= 4), 'detect 4-run')
}

// 3. 重力：清一列后补充
{
  const b = createBoard()
  const cleared = new Set(b.filter(c => c.col === 0 && c.row >= 5).map(c => c.id))
  const next = applyGravity(b, cleared)
  ok(next.length === ROWS * COLS, 'gravity refills to full board')
  const col0 = next.filter(c => c.col === 0).sort((a, b) => a.row - b.row)
  ok(col0.length === ROWS && col0[0].row === 0 && col0[7].row === 7, 'column rows contiguous')
}

// 4. 条纹+条纹交换 → 十字消除
{
  const b = createBoard()
  const a = b.find(c => c.row === 3 && c.col === 3)
  const d = b.find(c => c.row === 3 && c.col === 4)
  a.special = 'h'; d.special = 'v'
  const clear = specialSwapClear(b, a, d)
  ok(clear !== null && clear.size >= ROWS + COLS - 1, 'striped+striped cross clears row+col')
}

// 5. 炸弹+普通 → 清同色
{
  const b = createBoard()
  const bomb = b.find(c => c.row === 0 && c.col === 0)
  bomb.special = 'bomb'; bomb.type = -1
  const other = b.find(c => c.row === 0 && c.col === 1)
  const targetType = other.type
  const expected = b.filter(c => c.type === targetType).length
  const clear = specialSwapClear(b, bomb, other)
  ok(clear !== null && clear.size >= expected, 'bomb clears all of one type')
}

// 6. 洗牌后仍有可行步
for (let i = 0; i < 20; i++) {
  const b = createBoard()
  const s = shuffleBoard(b)
  ok(findMatches(s).length === 0, 'shuffle no matches')
  ok(findPossibleMove(s) !== null, 'shuffle has move')
}

// 7. 包装块 3x3 连锁
{
  const b = createBoard()
  const w = b.find(c => c.row === 4 && c.col === 4)
  w.special = 'wrap'
  const clear = expandClear(b, new Set([w.id]))
  ok(clear.size === 9, 'wrap clears 3x3')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
