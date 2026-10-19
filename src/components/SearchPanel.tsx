import { FormEvent, useState } from 'react'
import { searchTranscript } from '../lib/api'
import { errorLabel } from '../lib/format'
import type { Citation, SearchResponse } from '../types'
import { CitationCard } from './CitationCard'
import { RetryIcon, SearchIcon } from './Icons'

interface SearchPanelProps {
  onPlayCitation: (citation: Citation) => void
  serviceAvailable: boolean
}

export function SearchPanel({ onPlayCitation, serviceAvailable }: SearchPanelProps) {
  const [query, setQuery] = useState('')
  const [topK, setTopK] = useState(5)
  const [data, setData] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (question = query) => {
    const clean = question.trim()
    if (!clean || !serviceAvailable || loading) return
    setLoading(true)
    setError(null)
    try {
      setData(await searchTranscript(clean, topK))
    } catch (reason) {
      setData(null)
      setError(errorLabel(reason))
    } finally {
      setLoading(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run()
  }

  return (
    <section className="search-panel panel" aria-label="逐字稿搜索">
      <div className="panel-heading search-heading"><div><span className="eyebrow">SOURCE EXPLORER</span><h2>逐字稿检索</h2></div><select value={topK} onChange={(e) => setTopK(Number(e.target.value))} aria-label="结果数量"><option value="3">3 条</option><option value="5">5 条</option><option value="10">10 条</option></select></div>
      <form className="search-form" onSubmit={submit}><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value.slice(0, 500))} maxLength={500} placeholder={serviceAvailable ? '搜索观点、人物或概念' : '在线检索服务尚未连接'} aria-label="搜索逐字稿"/><button type="submit" disabled={!serviceAvailable || !query.trim() || loading}>{loading ? '检索中' : '搜索'}</button></form>

      <div className="search-results" aria-live="polite">
        {!serviceAvailable ? <div className="search-state"><SearchIcon /><strong>在线检索暂不可用</strong><p>你仍可在“访谈稿”页面浏览和搜索已发布的静态逐字稿。</p></div> : loading ? <div className="search-skeleton"><span/><span/><span/></div> : error ? (
          <div className="search-state error"><strong>搜索失败</strong><p>{error}</p><button type="button" onClick={() => void run()}><RetryIcon /> 重试</button></div>
        ) : !data ? (
          <div className="search-state"><SearchIcon /><p>搜索访谈逐字稿，查看未经过 AI 改写的原文。</p></div>
        ) : data.results.length === 0 ? (
          <div className="search-state"><p>没有找到相关逐字稿。试试更具体的人名、概念或表达。</p></div>
        ) : (
          <>
            <div className="search-summary"><span>{data.results.length} 组结果</span><span>按相关程度排列</span></div>
            {data.semantic_error && <div className="semantic-warning">部分搜索能力暂不可用，结果可能不够完整。</div>}
            <div className="hit-list">{data.results.map((hit) => (
              <article className="search-hit" key={hit.chunk_id}>
                <div className="hit-top"><span>#{hit.rank}</span><span>{hit.speakers.join('、') || '说话人未确认'}</span></div>
                <p className="hit-content">{hit.content}</p>
                <details><summary>{hit.evidence.length} 条权威原文</summary><div className="citation-list">{hit.evidence.map((citation, index) => <CitationCard key={citation.citation_id} citation={citation} compact index={index} onPlay={onPlayCitation} />)}</div></details>
              </article>
            ))}</div>
          </>
        )}
      </div>
    </section>
  )
}
