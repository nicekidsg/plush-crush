import { memo } from 'react'
import type { Cell } from '../game/engine'
import { ANIMALS } from '../game/animals'

export type HintDir = 'left' | 'right' | 'up' | 'down'

interface TileProps {
  cell: Cell
  selected: boolean
  hintDir: HintDir | null
  clearing: boolean
  /** 跟手拖拽偏移（仅被拖拽的棋子非空） */
  drag: { dx: number; dy: number } | null
  onPointerDown: (cell: Cell, e: React.PointerEvent) => void
}

/** 彩色毛绒炸弹：彩虹毛线球 */
function BombBall() {
  return (
    <div className="bomb-ball">
      <span className="bomb-sparkle">✨</span>
    </div>
  )
}

function TileInner({ cell, selected, hintDir, clearing, drag, onPointerDown }: TileProps) {
  const animal = cell.type >= 0 ? ANIMALS[cell.type] : null
  const isBomb = cell.special === 'bomb'

  // transform 定位（GPU 合成，避免 left/top 布局抖动）
  const x = cell.col * 100
  const y = (cell.renderRow ?? cell.row) * 100
  const transform = drag
    ? `translate3d(calc(${x}% + ${drag.dx}px), calc(${y}% + ${drag.dy}px), 0)`
    : `translate3d(${x}%, ${y}%, 0)`

  const style: React.CSSProperties = {
    transform,
    transition: drag ? 'none' : undefined,
    zIndex: drag ? 6 : undefined,
  }

  return (
    <div
      className={`tile-slot${clearing ? ' tile-pop' : ''}${hintDir ? ` tile-hint-${hintDir}` : ''}`}
      style={style}
      onPointerDown={(e) => onPointerDown(cell, e)}
    >
      <div
        className={`plush-tile${selected ? ' plush-selected' : ''}${cell.special === 'wrap' ? ' plush-wrapped' : ''}${drag ? ' plush-dragging' : ''}`}
        style={
          animal
            ? {
                background: `radial-gradient(circle at 32% 28%, #ffffff 0%, ${animal.bg} 46%, ${animal.edge} 130%)`,
                borderColor: animal.edge,
                boxShadow: `inset 0 -4px 8px ${animal.edge}66, inset 0 3px 6px #ffffffcc, 0 3px 6px rgba(120,80,120,0.18), 0 0 0 3px ${animal.edge}33`,
              }
            : {
                background: 'radial-gradient(circle at 32% 28%, #fff 0%, #ffe9f6 40%, #d9b8ff 130%)',
                borderColor: '#c9a0f0',
              }
        }
      >
        {/* 缝线虚线内框 */}
        <div className="plush-stitch" style={animal ? { borderColor: `${animal.deep}55` } : undefined} />

        {isBomb ? (
          <BombBall />
        ) : (
          <img
            className="plush-img"
            src={animal?.img}
            alt={animal?.name}
            draggable={false}
          />
        )}

        {/* 条纹特殊块 */}
        {(cell.special === 'h' || cell.special === 'v') && (
          <>
            <div className={`stripe-overlay stripe-${cell.special}`} />
            <span className="special-badge">{cell.special === 'h' ? '↔' : '↕'}</span>
          </>
        )}

        {/* 包装特殊块 */}
        {cell.special === 'wrap' && <span className="special-badge wrap-badge">🎀</span>}
      </div>
    </div>
  )
}

const Tile = memo(TileInner)
export default Tile
