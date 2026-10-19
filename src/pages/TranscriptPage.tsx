import { useMemo, useRef, useState } from 'react'
import { AudioPlayer, type AudioPlayerHandle } from '../components/AudioPlayer'
import { SiteHeader } from '../components/SiteHeader'
import { filterTranscript, parseTranscript } from '../lib/transcript'

function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim()
  if (!needle) return <>{text}</>
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return <>{parts.map((part, index) => part.toLocaleLowerCase('zh-CN') === needle.toLocaleLowerCase('zh-CN') ? <mark key={index}>{part}</mark> : part)}</>
}

export function TranscriptPage() {
  const parsed = useMemo(() => parseTranscript(__TRANSCRIPT_MARKDOWN__), [])
  const [query, setQuery] = useState('')
  const [speaker, setSpeaker] = useState('全部')
  const [chapterOpen, setChapterOpen] = useState(false)
  const playerRef = useRef<AudioPlayerHandle>(null)
  const speakers = useMemo(() => ['全部', ...Array.from(new Set(parsed.turns.map((turn) => turn.speaker)))], [parsed.turns])
  const results = useMemo(() => filterTranscript(parsed.turns, query).filter((turn) => speaker === '全部' || turn.speaker === speaker), [parsed.turns, query, speaker])

  const jumpToChapter = (timestamp: string) => {
    const turn = parsed.turns.find((item) => item.timestamp >= timestamp)
    document.getElementById(turn?.id ?? '')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setChapterOpen(false)
  }

  return (
    <div className="site-page transcript-page">
      <SiteHeader current="transcript" />
      <main className="transcript-layout">
        <aside className={`chapter-rail ${chapterOpen ? 'is-open' : ''}`}>
          <div className="chapter-heading"><p>TIME INDEX</p><button type="button" onClick={() => setChapterOpen(false)} aria-label="关闭时间导航">×</button></div>
          <nav aria-label="时间节点">{parsed.chapters.map((chapter, index) => <button key={chapter.id} type="button" onClick={() => jumpToChapter(chapter.timestamp)}><span>{chapter.timestamp}</span><small>{index === 0 ? '开场' : `第 ${index} 节`}</small></button>)}</nav>
        </aside>

        <section className="transcript-document">
          <header className="transcript-masthead">
            <p className="kicker">AUTHORITATIVE TRANSCRIPT · READ ONLY</p><h1>完整访谈稿</h1><p>邵艾伦 Alan 访谈孙宇晨</p>
            <dl><div><dt>时长</dt><dd>约 4 小时 22 分</dd></div><div><dt>规模</dt><dd>{parsed.turns.length} 个话轮</dd></div><div><dt>来源</dt><dd>完整逐字稿github.md</dd></div></dl>
          </header>

          <div className="transcript-toolbar">
            <button className="chapter-toggle" type="button" onClick={() => setChapterOpen(true)}>☰ 时间导航</button>
            <label className="transcript-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索完整访谈稿" placeholder="搜索正文、说话人或时间…" /><kbd>{results.length}</kbd></label>
            <div className="speaker-filter" aria-label="按说话人筛选">{speakers.slice(0, 3).map((name) => <button key={name} type="button" className={speaker === name ? 'active' : ''} onClick={() => setSpeaker(name)}>{name}</button>)}</div>
          </div>

          <div className="source-notice"><span>只读源</span><p>正文由构建过程直接读取权威 Markdown；页面没有独立副本，也不会改写原文。</p></div>
          <div className="turn-list" aria-live="polite">
            {results.length === 0 && <div className="empty-results"><strong>没有找到匹配内容</strong><p>尝试缩短关键词或切换说话人。</p></div>}
            {results.map((turn) => <article className={`transcript-turn speaker-${turn.speaker === '孙宇晨' ? 'sun' : 'shao'}`} id={turn.id} key={turn.id}><div className="turn-meta"><button type="button" onClick={() => playerRef.current?.playRange(turn.seconds, turn.seconds + 25)} aria-label={`播放 ${turn.timestamp} 附近音频`}>{turn.timestamp}<span>▶</span></button><strong>{turn.speaker}</strong></div><div className="turn-copy">{turn.content.split('\n\n').map((paragraph, index) => <p key={index}><Highlight text={paragraph} query={query} /></p>)}</div></article>)}
          </div>
        </section>
      </main>
      <div className="transcript-player"><AudioPlayer ref={playerRef} health={null} /></div>
    </div>
  )
}
