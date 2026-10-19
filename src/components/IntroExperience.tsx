import { useEffect, useRef, useState } from 'react'

interface IntroExperienceProps {
  onClose: () => void
}

const duration = 12

export function IntroExperience({ onClose }: IntroExperienceProps) {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(true)
  const startedAt = useRef(Date.now())
  const mediaRef = useRef<HTMLAudioElement | null>(null)

  const stopMedia = () => {
    mediaRef.current?.pause()
    if (mediaRef.current) mediaRef.current.currentTime = 0
  }

  const close = () => {
    stopMedia()
    localStorage.setItem('sunology-intro-seen', 'silent-v1')
    onClose()
  }

  const replay = () => {
    stopMedia()
    startedAt.current = Date.now()
    setElapsed(0)
    setRunning(true)
  }

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      const next = Math.min((Date.now() - startedAt.current) / 1000, duration)
      setElapsed(next)
      if (next >= duration) setRunning(false)
    }, 80)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => () => stopMedia(), [])

  const phase = elapsed < 2.5 ? 0 : elapsed < 5.2 ? 1 : elapsed < 8.3 ? 2 : elapsed < 10.5 ? 3 : 4

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-label="薄肌理论开场">
      <div className="intro-grain" />
      <div className="intro-orbit intro-orbit-one" />
      <div className="intro-orbit intro-orbit-two" />
      <div className="intro-frame-mark"><span>INTERVIEW ARCHIVE</span><span>04:22:29</span></div>
      <div className={`intro-scene ${phase === 0 ? 'is-active' : ''}`}>
        <p>一场长谈</p><h2>孙宇晨 <i>×</i> 邵艾伦</h2>
      </div>
      <div className={`intro-scene intro-title-scene ${phase === 1 ? 'is-active' : ''}`}>
        <p>SUNOLOGY MEETS BOJI</p><h2>薄肌理论</h2><span>身体、认知与个人发展的四小时对话</span>
      </div>
      <div className={`intro-scene intro-statement ${phase === 2 ? 'is-active' : ''}`}>
        <em>COGNITION · ACTION · PRACTICE</em>
        <p>认知塑造选择<br />行动检验判断</p>
      </div>
      <div className={`intro-scene intro-metadata ${phase === 3 ? 'is-active' : ''}`}>
        <span>682</span><p>个话轮<br />按原片时间顺序整理</p>
      </div>
      <div className={`intro-scene intro-end ${phase === 4 ? 'is-active' : ''}`}>
        <p>孙学 × 薄肌理论</p><h2>从这里，进入完整对话。</h2>
        <button type="button" onClick={close}>进入首页</button>
      </div>
      <div className="intro-controls">
        <button type="button" disabled aria-label="无声模式">无声模式</button>
        <div className="intro-progress" aria-label={`开场进度 ${Math.round(elapsed)} 秒`}><span style={{ width: `${(elapsed / duration) * 100}%` }} /></div>
        {!running && <button type="button" onClick={replay}>重播</button>}
        <button type="button" onClick={close}>跳过</button>
      </div>
    </div>
  )
}
