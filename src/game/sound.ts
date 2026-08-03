// WebAudio 简易合成音效，无需任何音频资源
let ctx: AudioContext | null = null

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, dur = 0.12, type: OscillatorType = 'sine', vol = 0.14, delay = 0) {
  const c = ac()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  const t0 = c.currentTime + delay
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export const sfx = {
  select() {
    tone(660, 0.06, 'triangle', 0.07)
  },
  swap() {
    tone(320, 0.07, 'sine', 0.1)
    tone(420, 0.07, 'sine', 0.1, 0.05)
  },
  invalid() {
    tone(170, 0.14, 'sawtooth', 0.06)
  },
  pop(cascade = 1) {
    const f = 420 + Math.min(cascade, 6) * 90
    tone(f, 0.12, 'triangle', 0.15)
    tone(f * 1.5, 0.1, 'sine', 0.1, 0.04)
    if (cascade >= 2) tone(f * 2, 0.12, 'sine', 0.08, 0.08)
  },
  special() {
    ;[523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.13, i * 0.05))
  },
  shuffle() {
    ;[300, 260, 320, 380].forEach((f, i) => tone(f, 0.09, 'square', 0.06, i * 0.06))
  },
  win() {
    ;[523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, i * 0.09))
  },
  lose() {
    ;[392, 330, 262, 196].forEach((f, i) => tone(f, 0.2, 'sine', 0.12, i * 0.12))
  },
}
