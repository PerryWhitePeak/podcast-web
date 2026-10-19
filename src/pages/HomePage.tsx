import { useState, type SyntheticEvent } from 'react'
import { IntroExperience } from '../components/IntroExperience'
import { SiteHeader } from '../components/SiteHeader'
import { appPath, assetPath } from '../lib/paths'

const originalVideoUrl = 'https://www.bilibili.com/video/BV1fcHD6cEw3'

interface InterviewImageProps {
  src: string
  alt: string
  className: string
  width: number
  height: number
}

function InterviewImage({ src, alt, className, width, height }: InterviewImageProps) {
  const [failed, setFailed] = useState(false)

  const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
    setFailed(true)
    event.currentTarget.hidden = true
  }

  return (
    <div className={`${className}${failed ? ' is-unavailable' : ''}`}>
      <img src={src} alt={alt} width={width} height={height} loading="eager" fetchPriority="high" decoding="async" onError={handleError} />
      {failed && <span role="img" aria-label={`${alt}加载失败`}>影像暂不可用</span>}
    </div>
  )
}

function AgentSignal() {
  return (
    <div className="agent-signal" aria-hidden="true">
      <span />
      <span />
      <span />
      <i />
    </div>
  )
}

export function HomePage() {
  const [introOpen, setIntroOpen] = useState(false)

  return (
    <div className="site-page home-page stage8-home">
      <SiteHeader current="home" />
      <main>
        <section className="stage8-hero" aria-labelledby="home-title">
          <div className="stage8-hero-copy">
            <div className="stage8-overline">
              <span>THE LONG CONVERSATION</span>
              <i aria-hidden="true" />
              <span>INTERVIEW 001</span>
            </div>
            <h1 id="home-title">孙宇晨 <em>×</em><br />邵艾伦</h1>
            <p className="stage8-subtitle">关于认知、行动与薄肌理论的深度访谈</p>
            <p className="stage8-lede">四小时二十二分钟，从身体与认知谈到 AI、财富与个人发展。保留原始语境，也追问每一个观点如何形成。</p>
            <dl className="stage8-meta">
              <div><dt>时长</dt><dd>04:22:29</dd></div>
              <div><dt>对话</dt><dd>682 个话轮</dd></div>
              <div><dt>形式</dt><dd>原片 · 逐字稿 · AI</dd></div>
            </dl>
            <div className="stage8-hero-actions">
              <a href="#explore">开始探索 <span aria-hidden="true">↓</span></a>
              <button type="button" onClick={() => setIntroOpen(true)}>
                <span className="stage8-play" aria-hidden="true">▶</span>
                观看 12 秒无声开场
              </button>
            </div>
          </div>

          <div className="stage8-hero-visual" aria-label="孙宇晨与邵艾伦真实访谈影像">
            <InterviewImage src={assetPath('interview-duo.png')} alt="邵艾伦与孙宇晨远程访谈同框画面" className="stage8-duo-image" width={2556} height={927} />
            <div className="stage8-mobile-portraits">
              <InterviewImage src={assetPath('shao-ailun.png')} alt="访谈主持人邵艾伦" className="stage8-person-image is-shao" width={854} height={601} />
              <InterviewImage src={assetPath('sun-yuchen.png')} alt="访谈嘉宾孙宇晨" className="stage8-person-image is-sun" width={1278} height={917} />
            </div>
            <div className="stage8-image-caption">
              <span>HOST / 邵艾伦</span>
              <span>GUEST / 孙宇晨</span>
            </div>
            <div className="stage8-film-note" aria-hidden="true"><span>UNCUT</span><span>04H 22M</span></div>
          </div>
        </section>

        <section className="stage8-explore" id="explore" aria-labelledby="explore-title">
          <header className="stage8-section-heading">
            <div><span>EXPLORE THE ARCHIVE</span><span>三种方式，进入同一场对话</span></div>
            <h2 id="explore-title">从一个问题开始。</h2>
          </header>

          <div className="stage8-entry-grid" aria-label="核心功能入口">
            <a href={appPath('/agent')} className="stage8-entry-card stage8-agent-card">
              <span className="stage8-card-index">01 / AI AGENT</span>
              <AgentSignal />
              <div className="stage8-agent-prompt" aria-hidden="true">
                <span>向这场访谈提问</span><b>↗</b>
              </div>
              <div className="stage8-card-copy">
                <p>对话不是答案的终点，而是检索的起点。</p>
                <h3>向 AI 提问</h3>
                <span>探索孙学与薄肌理论 · 回答可追溯至原文</span>
              </div>
              <b className="stage8-card-arrow" aria-hidden="true">↗</b>
            </a>

            <a href={appPath('/transcript')} className="stage8-entry-card stage8-transcript-card">
              <span className="stage8-card-index">02 / TRANSCRIPT</span>
              <div className="stage8-card-copy">
                <p>沿时间轴返回对话现场。</p>
                <h3>阅读访谈稿</h3>
                <span>完整内容 · 搜索 · 人物筛选 · 时间定位</span>
              </div>
              <div className="stage8-lines" aria-hidden="true"><i /><i /><i /><i /></div>
              <b className="stage8-card-arrow" aria-hidden="true">↗</b>
            </a>

            <a href={originalVideoUrl} target="_blank" rel="noreferrer" className="stage8-entry-card stage8-video-card">
              <span className="stage8-card-index">03 / ORIGINAL FILM</span>
              <div className="stage8-card-copy">
                <p>回到未经转述的完整语境。</p>
                <h3>观看原片</h3>
                <span>完整访谈视频 · Bilibili</span>
              </div>
              <span className="stage8-video-play" aria-hidden="true">▶</span>
              <b className="stage8-card-arrow" aria-hidden="true">↗</b>
            </a>
          </div>

          <p className="stage8-evidence-note"><span>VERIFIABLE BY DESIGN</span>AI 回答尽量指向权威逐字稿与原始时间位置；音频与视频不会自动播放。</p>
        </section>
      </main>
      <footer className="site-footer stage8-footer">
        <span>孙宇晨 × 邵艾伦</span>
        <span>基于权威逐字稿的阅读与问答实验</span>
        <span>LOCAL ARCHIVE · NO AUTO PLAY</span>
      </footer>
      {introOpen && <IntroExperience onClose={() => setIntroOpen(false)} />}
    </div>
  )
}
