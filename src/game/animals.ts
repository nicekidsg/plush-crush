// 毛绒动物伙伴定义（AI 生成的原创软萌毛绒形象，WebP 轻量素材）
// 路径使用 BASE_URL 以兼容子路径部署（如 GitHub Pages）
const BASE = import.meta.env.BASE_URL

export interface AnimalDef {
  img: string
  name: string
  /** 毛绒底色 */
  bg: string
  /** 缝线/描边色 */
  edge: string
  /** 深色阴影 */
  deep: string
}

export const ANIMALS: AnimalDef[] = [
  { img: `${BASE}animals/bunny.webp`,   name: '邦尼兔',   bg: '#FDE4EF', edge: '#F2A9CC', deep: '#D97BA8' },
  { img: `${BASE}animals/bear.webp`,    name: '巴塞罗熊', bg: '#F4E7D7', edge: '#D4AF85', deep: '#B08A5E' },
  { img: `${BASE}animals/dog.webp`,     name: '小猎犬',   bg: '#FFF3DC', edge: '#EFC98F', deep: '#D9A85E' },
  { img: `${BASE}animals/fox.webp`,     name: '小狐狸',   bg: '#FFE8DC', edge: '#F5A97E', deep: '#DE8250' },
  { img: `${BASE}animals/penguin.webp`, name: '花生企鹅', bg: '#E4EEFF', edge: '#9FC0F0', deep: '#6E97D6' },
  { img: `${BASE}animals/dragon.webp`,  name: '雪雪龙',   bg: '#E0F6F1', edge: '#8AD5C7', deep: '#54B3A1' },
]
