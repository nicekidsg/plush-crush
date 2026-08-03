export interface CollectGoal {
  type: number
  count: number
}

export interface Level {
  id: number
  name: string
  moves: number
  targetScore: number
  collect?: CollectGoal[]
}

export const LEVELS: Level[] = [
  { id: 1, name: '毛绒初遇', moves: 18, targetScore: 1500 },
  { id: 2, name: '邦尼兔派对', moves: 20, targetScore: 2500, collect: [{ type: 0, count: 12 }] },
  { id: 3, name: '甜点风暴', moves: 20, targetScore: 4200 },
  { id: 4, name: '熊与企鹅', moves: 24, targetScore: 4500, collect: [{ type: 1, count: 10 }, { type: 4, count: 10 }] },
  { id: 5, name: '彩虹冲刺', moves: 22, targetScore: 7500 },
  { id: 6, name: '猎犬大集结', moves: 26, targetScore: 8000, collect: [{ type: 2, count: 14 }] },
]

export function starThresholds(target: number): [number, number, number] {
  return [target, Math.round(target * 1.6), Math.round(target * 2.4)]
}

export function starsFor(score: number, target: number): number {
  const [s1, s2, s3] = starThresholds(target)
  if (score >= s3) return 3
  if (score >= s2) return 2
  if (score >= s1) return 1
  return 0
}
