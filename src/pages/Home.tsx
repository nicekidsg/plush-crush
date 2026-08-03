import { useCallback, useEffect, useRef, useState } from 'react'
import {
  areAdjacent,
  applyGravity,
  cellAt,
  createBoard,
  expandClear,
  findMatches,
  findPossibleMove,
  planSpecial,
  shuffleBoard,
  specialSwapClear,
  stripRenderRow,
} from '../game/engine'
import type { Cell } from '../game/engine'
import { LEVELS, starThresholds, starsFor } from '../game/levels'
import type { Level } from '../game/levels'
import { ANIMALS } from '../game/animals'
import { sfx } from '../game/sound'
import Tile from '../components/Tile'
import type { HintDir } from '../components/Tile'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Popup {
  id: number
  col: number
  row: number
  text: string
  big: boolean
}

interface Fx {
  id: number
  kind: 'beam-h' | 'beam-v' | 'ring' | 'flash'
  row: number
  col: number
}

interface Particle {
  id: number
  col: number
  row: number
  dx: number
  dy: number
  color: string
  char: string
  size: number
}

let popupId = 1
let fxId = 1
let particleId = 1

const LS_PROGRESS = 'plushcrush-unlocked'
const LS_STARS = 'plushcrush-stars'

function loadUnlocked(): number {
  try {
    return Math.max(1, Math.min(LEVELS.length, Number(localStorage.getItem(LS_PROGRESS)) || 1))
  } catch {
    return 1
  }
}

function loadStars(): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(LS_STARS) || '{}')
  } catch {
    return {}
  }
}

export default function Home() {
  const [screen, setScreen] = useState<'menu' | 'play'>('menu')
  const [overlay, setOverlay] = useState<null | 'won' | 'lost'>(null)
  const [levelIdx, setLevelIdx] = useState(0)
  const [cells, setCells] = useState<Cell[]>([])
  const [clearing, setClearing] = useState<Set<number>>(new Set())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [hints, setHints] = useState<{ id: number; dir: HintDir }[]>([])
  const [dragOffset, setDragOffset] = useState<{ id: number; dx: number; dy: number } | null>(null)
  const [movesLeft, setMovesLeft] = useState(0)
  const [score, setScore] = useState(0)
  const [collected, setCollected] = useState<Record<number, number>>({})
  const [popups, setPopups] = useState<Popup[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [unlocked, setUnlocked] = useState(loadUnlocked)
  const [starsMap, setStarsMap] = useState(loadStars)
  const [shuffling, setShuffling] = useState(false)
  const [fx, setFx] = useState<Fx[]>([])
  const [particles, setParticles] = useState<Particle[]>([])
  const [shakeTick, setShakeTick] = useState(0)
  const [shakeOn, setShakeOn] = useState(false)

  const busyRef = useRef(false)
  const cellsRef = useRef<Cell[]>([])
  const scoreRef = useRef(0)
  const movesRef = useRef(0)
  const collectedRef = useRef<Record<number, number>>({})
  const achievedRef = useRef(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ cell: Cell; x: number; y: number } | null>(null)

  const level: Level = LEVELS[levelIdx]

  const syncCells = useCallback((next: Cell[]) => {
    cellsRef.current = next
    setCells(next)
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }, [])

  const addPopup = useCallback((col: number, row: number, text: string, big = false) => {
    const id = popupId++
    setPopups((p) => [...p, { id, col, row, text, big }])
    setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 900)
  }, [])

  // 特殊块光束 / 冲击环 / 全屏闪光
  const addFx = useCallback((items: Omit<Fx, 'id'>[]) => {
    if (items.length === 0) return
    const withIds = items.map((f) => ({ ...f, id: fxId++ }))
    setFx((prev) => [...prev, ...withIds])
    const ids = new Set(withIds.map((f) => f.id))
    setTimeout(() => setFx((prev) => prev.filter((f) => !ids.has(f.id))), 520)
  }, [])

  // 消除粒子爆发（毛绒星星碎屑）
  const spawnParticles = useCallback((clearedCells: Cell[]) => {
    const chars = ['✦', '●', '✿', '★']
    const list: Particle[] = []
    const cellsToUse = clearedCells.length > 16
      ? clearedCells.filter((_, i) => i % 2 === 0)
      : clearedCells
    for (const c of cellsToUse) {
      const color = c.type >= 0 ? ANIMALS[c.type].deep : '#b57edc'
      const n = clearedCells.length > 16 ? 2 : 3
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2
        const dist = 34 + Math.random() * 55
        list.push({
          id: particleId++,
          col: c.col,
          row: c.row,
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 18,
          color,
          char: chars[Math.floor(Math.random() * chars.length)],
          size: 9 + Math.random() * 9,
        })
      }
    }
    if (list.length === 0) return
    const ids = new Set(list.map((p) => p.id))
    setParticles((prev) => [...prev.slice(-60), ...list])
    setTimeout(() => setParticles((prev) => prev.filter((p) => !ids.has(p.id))), 750)
  }, [])

  // 闲置 6 秒自动提示（CC 式滑动演示）
  const showHintMove = useCallback(() => {
    const move = findPossibleMove(cellsRef.current)
    if (!move) return
    const [a, b] = move
    const dirA: HintDir = b.col > a.col ? 'right' : b.col < a.col ? 'left' : b.row > a.row ? 'down' : 'up'
    const dirB: HintDir = dirA === 'right' ? 'left' : dirA === 'left' ? 'right' : dirA === 'down' ? 'up' : 'down'
    setHints([
      { id: a.id, dir: dirA },
      { id: b.id, dir: dirB },
    ])
  }, [])

  const resetIdleHint = useCallback(() => {
    setHints([])
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => {
      if (busyRef.current || overlay) return
      showHintMove()
    }, 6000)
  }, [overlay, showHintMove])

  useEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  }, [])

  // 大消除时棋盘震动
  useEffect(() => {
    if (shakeTick === 0) return
    setShakeOn(true)
    const t = setTimeout(() => setShakeOn(false), 460)
    return () => clearTimeout(t)
  }, [shakeTick])

  // ----------------------------------------------------------
  // 开局
  // ----------------------------------------------------------
  const startLevel = useCallback(
    (idx: number) => {
      const lv = LEVELS[idx]
      setLevelIdx(idx)
      scoreRef.current = 0
      movesRef.current = lv.moves
      collectedRef.current = {}
      achievedRef.current = false
      setScore(0)
      setMovesLeft(lv.moves)
      setCollected({})
      setOverlay(null)
      setSelectedId(null)
      setHints([])
      setDragOffset(null)
      setPopups([])
      syncCells(createBoard())
      setScreen('play')
      resetIdleHint()
    },
    [syncCells, resetIdleHint],
  )

  // ----------------------------------------------------------
  // 连锁消除主循环
  // ----------------------------------------------------------
  const resolveBoard = useCallback(
    async (firstClear: Set<number> | null, preferred: Cell | null) => {
      let cascade = 1
      let pending = firstClear

      while (true) {
        let clearIds: Set<number>

        if (pending) {
          clearIds = pending
          pending = null
        } else {
          const groups = findMatches(cellsRef.current)
          if (groups.length === 0) break

          const plans = groups
            .map((g) => planSpecial(g, cascade === 1 ? preferred : null))
            .filter((p): p is { cellId: number; special: Cell['special'] } => p !== null)
          const spawnIds = new Set(plans.map((p) => p.cellId))
          const matched = new Set(groups.flatMap((g) => g.cells.map((c) => c.id)))
          spawnIds.forEach((id) => matched.delete(id))
          clearIds = expandClear(cellsRef.current, matched)
          spawnIds.forEach((id) => clearIds.delete(id))

          if (plans.length > 0) {
            sfx.special()
            scoreRef.current += plans.length * 150
            setScore(scoreRef.current)
            syncCells(
              cellsRef.current.map((c) => {
                const p = plans.find((pl) => pl.cellId === c.id)
                if (!p) return c
                return { ...c, special: p.special, type: p.special === 'bomb' ? -1 : c.type }
              }),
            )
            for (const p of plans) {
              const cell = cellsRef.current.find((c) => c.id === p.cellId)
              if (cell) {
                const label = p.special === 'bomb' ? '彩虹球!' : p.special === 'wrap' ? '礼物!' : '条纹!'
                addPopup(cell.col, cell.row, label, true)
              }
            }
          }
        }

        if (clearIds.size === 0) break

        // 计分与收集
        const pts = clearIds.size * 60 * cascade
        scoreRef.current += pts
        setScore(scoreRef.current)
        const clearedCells = cellsRef.current.filter((c) => clearIds.has(c.id))
        for (const c of clearedCells) {
          if (c.type >= 0) {
            collectedRef.current[c.type] = (collectedRef.current[c.type] ?? 0) + 1
          }
        }
        setCollected({ ...collectedRef.current })

        const anchor = clearedCells[Math.floor(clearedCells.length / 2)]
        if (anchor) {
          const text = cascade > 1 ? `连锁x${cascade} +${pts}` : `+${pts}`
          addPopup(anchor.col, anchor.row, text, cascade > 1 || clearIds.size >= 5)
        }

        // 特效：条纹光束 / 包装冲击环 / 彩虹球全屏闪光 / 粒子爆发
        const fxItems: Omit<Fx, 'id'>[] = []
        for (const c of clearedCells) {
          if (c.special === 'h') fxItems.push({ kind: 'beam-h', row: c.row, col: c.col })
          else if (c.special === 'v') fxItems.push({ kind: 'beam-v', row: c.row, col: c.col })
          else if (c.special === 'wrap') fxItems.push({ kind: 'ring', row: c.row, col: c.col })
          else if (c.special === 'bomb') fxItems.push({ kind: 'flash', row: 0, col: 0 })
        }
        addFx(fxItems)
        spawnParticles(clearedCells)
        if (clearIds.size >= 8 || fxItems.length > 0) setShakeTick((t) => t + 1)

        // 消除动画
        setClearing(new Set(clearIds))
        sfx.pop(cascade)
        await sleep(240)

        // 下落 + 补充
        syncCells(applyGravity(cellsRef.current, clearIds))
        setClearing(new Set())
        await sleep(35)
        syncCells(stripRenderRow(cellsRef.current))
        await sleep(200)

        cascade++
      }

      // 无可行动作 → 洗牌
      if (!findPossibleMove(cellsRef.current)) {
        setShuffling(true)
        sfx.shuffle()
        showToast('没有可消除的组合啦，重新洗牌！🔀')
        await sleep(500)
        syncCells(shuffleBoard(cellsRef.current))
        setShuffling(false)
      }
    },
    [syncCells, addPopup, showToast],
  )

  // ----------------------------------------------------------
  // 胜负判定
  // ----------------------------------------------------------
  const goalsMet = useCallback((): boolean => {
    if (scoreRef.current < level.targetScore) return false
    if (level.collect) {
      for (const g of level.collect) {
        if ((collectedRef.current[g.type] ?? 0) < g.count) return false
      }
    }
    return true
  }, [level])

  const checkEnd = useCallback(() => {
    // 达成目标不立即结束：提示后继续用剩余步数冲更高星级
    if (goalsMet() && !achievedRef.current) {
      achievedRef.current = true
      sfx.special()
      showToast('🎉 目标达成！继续冲击更高星级！')
    }
    if (movesRef.current > 0) return
    if (goalsMet()) {
      sfx.win()
      const stars = starsFor(scoreRef.current, level.targetScore)
      const newStars = { ...starsMap, [level.id]: Math.max(stars, starsMap[level.id] ?? 0) }
      setStarsMap(newStars)
      localStorage.setItem(LS_STARS, JSON.stringify(newStars))
      const newUnlocked = Math.max(unlocked, Math.min(LEVELS.length, levelIdx + 2))
      setUnlocked(newUnlocked)
      localStorage.setItem(LS_PROGRESS, String(newUnlocked))
      setOverlay('won')
    } else {
      sfx.lose()
      setOverlay('lost')
    }
  }, [goalsMet, level, levelIdx, starsMap, unlocked, showToast])

  // ----------------------------------------------------------
  // 交换
  // ----------------------------------------------------------
  const trySwap = useCallback(
    async (a: Cell, b: Cell) => {
      if (busyRef.current || overlay) return
      if (!areAdjacent(a, b)) return
      busyRef.current = true
      setSelectedId(null)
      setHints([])
      sfx.swap()

      // 交换位置
      const swapped = cellsRef.current.map((c) => {
        if (c.id === a.id) return { ...c, row: b.row, col: b.col }
        if (c.id === b.id) return { ...c, row: a.row, col: a.col }
        return c
      })
      syncCells(swapped)
      await sleep(170)

      const aNow = cellAt(cellsRef.current, b.row, b.col)!
      const bNow = cellAt(cellsRef.current, a.row, a.col)!

      const specialClear = specialSwapClear(cellsRef.current, aNow, bNow)
      if (specialClear) {
        movesRef.current -= 1
        setMovesLeft(movesRef.current)
        await resolveBoard(specialClear, null)
      } else {
        const groups = findMatches(cellsRef.current)
        if (groups.length === 0) {
          // 无效交换，弹回
          sfx.invalid()
          const back = cellsRef.current.map((c) => {
            if (c.id === a.id) return { ...c, row: a.row, col: a.col }
            if (c.id === b.id) return { ...c, row: b.row, col: b.col }
            return c
          })
          syncCells(back)
          await sleep(170)
          busyRef.current = false
          resetIdleHint()
          return
        }
        movesRef.current -= 1
        setMovesLeft(movesRef.current)
        await resolveBoard(null, aNow)
      }

      checkEnd()
      busyRef.current = false
      resetIdleHint()
    },
    [overlay, syncCells, resolveBoard, checkEnd, resetIdleHint],
  )

  // ----------------------------------------------------------
  // 输入：Candy Crush 式跟手拖拽 + 点选
  // ----------------------------------------------------------
  const handlePointerDown = useCallback(
    (cell: Cell, e: React.PointerEvent) => {
      if (busyRef.current || overlay) return
      dragRef.current = { cell, x: e.clientX, y: e.clientY }

      const clampOffset = (ev: PointerEvent, tileSize: number, start: { x: number; y: number }) => {
        let dx = ev.clientX - start.x
        let dy = ev.clientY - start.y
        // 锁定主轴，最多拖一格
        if (Math.abs(dx) >= Math.abs(dy)) {
          dx = Math.max(-tileSize, Math.min(tileSize, dx))
          dy = 0
        } else {
          dy = Math.max(-tileSize, Math.min(tileSize, dy))
          dx = 0
        }
        return { dx, dy }
      }

      const onMove = (ev: PointerEvent) => {
        if (!dragRef.current || busyRef.current) return
        const boardEl = boardRef.current
        const tileSize = boardEl ? boardEl.clientWidth / 8 : 60
        const { dx, dy } = clampOffset(ev, tileSize, dragRef.current)
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          setDragOffset({ id: dragRef.current.cell.id, dx, dy })
        }
      }

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const start = dragRef.current
        dragRef.current = null
        setDragOffset(null)
        if (!start || busyRef.current) return

        const boardEl = boardRef.current
        const tileSize = boardEl ? boardEl.clientWidth / 8 : 60
        const { dx, dy } = clampOffset(ev, tileSize, start)

        if (Math.max(Math.abs(dx), Math.abs(dy)) > tileSize * 0.35) {
          // 拖拽交换
          const dr = dy > 0 ? 1 : dy < 0 ? -1 : 0
          const dc = dx > 0 ? 1 : dx < 0 ? -1 : 0
          const target = cellAt(cellsRef.current, start.cell.row + dr, start.cell.col + dc)
          if (target) void trySwap(start.cell, target)
          return
        }

        // 点选逻辑
        const sel = selectedId
        if (sel === start.cell.id) {
          setSelectedId(null)
          return
        }
        if (sel !== null) {
          const prev = cellsRef.current.find((c) => c.id === sel)
          if (prev && areAdjacent(prev, start.cell)) {
            void trySwap(prev, start.cell)
            return
          }
        }
        sfx.select()
        setSelectedId(start.cell.id)
        setHints([])
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [overlay, selectedId, trySwap],
  )

  const manualHint = useCallback(() => {
    if (busyRef.current || overlay) return
    sfx.select()
    showHintMove()
  }, [overlay, showHintMove])

  // ----------------------------------------------------------
  // 渲染
  // ----------------------------------------------------------
  const [s1, s2, s3] = starThresholds(level.targetScore)
  const progressPct = Math.min(100, (score / s3) * 100)
  const starAt = (threshold: number) => Math.min(97, (threshold / s3) * 100)

  // ============================ 菜单 ============================
  if (screen === 'menu') {
    return (
      <div className="game-root menu-root">
        <div className="menu-card">
          <div className="menu-animals">
            {ANIMALS.map((a, i) => (
              <img key={a.name} src={a.img} alt={a.name} className="menu-animal" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <h1 className="menu-title">毛绒消消乐</h1>
          <p className="menu-sub">Plush Crush · 软萌动物三消</p>
          <div className="level-grid">
            {LEVELS.map((lv, i) => {
              const locked = i + 1 > unlocked
              const st = starsMap[lv.id] ?? 0
              return (
                <button
                  key={lv.id}
                  disabled={locked}
                  className={`level-btn${locked ? ' level-locked' : ''}`}
                  onClick={() => startLevel(i)}
                >
                  <span className="level-num">{locked ? '🔒' : lv.id}</span>
                  <span className="level-name">{lv.name}</span>
                  <span className="level-stars">
                    {[1, 2, 3].map((n) => (
                      <span key={n} style={{ opacity: n <= st ? 1 : 0.25 }}>⭐</span>
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="menu-tip">🧸 4 连出条纹 · L/T 形出礼物 · 5 连出彩虹球</p>
        </div>
      </div>
    )
  }

  // ============================ 游戏 ============================
  return (
    <div className="game-root">
      {/* HUD */}
      <div className="hud">
        <div className="hud-top">
          <button className="hud-back" onClick={() => setScreen('menu')}>‹ 选关</button>
          <div className="hud-level">
            第 {level.id} 关 · {level.name}
          </div>
          <div className={`hud-moves${movesLeft <= 5 ? ' moves-low' : ''}`}>
            <span className="moves-num">{movesLeft}</span>
            <span className="moves-label">步数</span>
          </div>
        </div>

        <div className="hud-progress-row">
          <span className="hud-score">{score.toLocaleString()}</span>
          <div className="star-bar">
            <div className="star-bar-fill" style={{ width: `${progressPct}%` }} />
            {[s1, s2, s3].map((th, i) => (
              <span key={i} className="star-marker" style={{ left: `${starAt(th)}%`, filter: score >= th ? 'none' : 'grayscale(1)', opacity: score >= th ? 1 : 0.5 }}>
                ⭐
              </span>
            ))}
          </div>
        </div>

        <div className="hud-goals">
          <span className={`goal-chip${score >= level.targetScore ? 'goal-done' : ''}`}>
            🎯 {level.targetScore.toLocaleString()} 分
          </span>
          {level.collect?.map((g) => {
            const got = collected[g.type] ?? 0
            return (
              <span key={g.type} className={`goal-chip${got >= g.count ? 'goal-done' : ''}`}>
                <img src={ANIMALS[g.type].img} alt={ANIMALS[g.type].name} className="goal-animal" />
                {Math.min(got, g.count)}/{g.count}
              </span>
            )
          })}
          <button className="hint-btn" onClick={manualHint}>💡 提示</button>
        </div>
      </div>

      {/* 棋盘 */}
      <div className="board-wrap">
        <div ref={boardRef} className={`board${shuffling || shakeOn ? ' board-shake' : ''}`}>
          {/* 背景格子 */}
          {Array.from({ length: 64 }, (_, i) => (
            <div
              key={i}
              className="board-cell"
              style={{ left: `${(i % 8) * 12.5}%`, top: `${Math.floor(i / 8) * 12.5}%` }}
            />
          ))}
          {cells.map((cell) => {
            const hint = hints.find((h) => h.id === cell.id)
            return (
              <Tile
                key={cell.id}
                cell={cell}
                selected={selectedId === cell.id}
                hintDir={hint ? hint.dir : null}
                clearing={clearing.has(cell.id)}
                drag={dragOffset && dragOffset.id === cell.id ? dragOffset : null}
                onPointerDown={handlePointerDown}
              />
            )
          })}
          {fx.map((f) => {
            if (f.kind === 'beam-h') return <div key={f.id} className="fx-beam fx-beam-h" style={{ top: `${f.row * 12.5}%` }} />
            if (f.kind === 'beam-v') return <div key={f.id} className="fx-beam fx-beam-v" style={{ left: `${f.col * 12.5}%` }} />
            if (f.kind === 'ring')
              return <div key={f.id} className="fx-ring" style={{ left: `${(f.col + 0.5) * 12.5}%`, top: `${(f.row + 0.5) * 12.5}%` }} />
            return <div key={f.id} className="fx-flash" />
          })}
          {particles.map((p) => (
            <span
              key={p.id}
              className="particle"
              style={
                {
                  left: `${(p.col + 0.5) * 12.5}%`,
                  top: `${(p.row + 0.5) * 12.5}%`,
                  color: p.color,
                  fontSize: p.size,
                  '--dx': `${p.dx}px`,
                  '--dy': `${p.dy}px`,
                } as React.CSSProperties
              }
            >
              {p.char}
            </span>
          ))}
          {popups.map((p) => (
            <div
              key={p.id}
              className={`score-popup${p.big ? ' popup-big' : ''}`}
              style={{ left: `${(p.col + 0.5) * 12.5}%`, top: `${(p.row + 0.5) * 12.5}%` }}
            >
              {p.text}
            </div>
          ))}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {/* 结算弹窗 */}
      {overlay && (
        <div className="overlay">
          <div className="overlay-card">
            {overlay === 'won' ? (
              <>
                <div className="overlay-emoji">🎉</div>
                <h2 className="overlay-title">关卡完成！</h2>
                <div className="overlay-stars">
                  {[1, 2, 3].map((n) => (
                    <span
                      key={n}
                      className="big-star"
                      style={{
                        animationDelay: `${n * 0.2}s`,
                        filter: n <= starsFor(score, level.targetScore) ? 'none' : 'grayscale(1)',
                        opacity: n <= starsFor(score, level.targetScore) ? 1 : 0.3,
                      }}
                    >
                      ⭐
                    </span>
                  ))}
                </div>
                <p className="overlay-score">{score.toLocaleString()} 分</p>
                <div className="overlay-btns">
                  {levelIdx + 1 < LEVELS.length && (
                    <button className="btn-primary" onClick={() => startLevel(levelIdx + 1)}>下一关 ›</button>
                  )}
                  <button className="btn-secondary" onClick={() => startLevel(levelIdx)}>再玩一次</button>
                  <button className="btn-secondary" onClick={() => setScreen('menu')}>选关</button>
                </div>
              </>
            ) : (
              <>
                <div className="overlay-emoji">🥺</div>
                <h2 className="overlay-title">步数用完啦</h2>
                <p className="overlay-score">{score.toLocaleString()} / {level.targetScore.toLocaleString()} 分</p>
                <div className="overlay-btns">
                  <button className="btn-primary" onClick={() => startLevel(levelIdx)}>再试一次</button>
                  <button className="btn-secondary" onClick={() => setScreen('menu')}>选关</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
