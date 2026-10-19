import { describe, expect, it } from 'vitest'
import { filterTranscript, parseTranscript, timestampToSeconds } from './transcript'

const fixture = `## 00:00:00

**[00:00:15] 孙宇晨：** 认知决定命运。

**[00:00:17] 邵艾伦：** 这是下一句话。

这是同一话轮的续段。
`

describe('transcript parser', () => {
  it('extracts authoritative timestamps, speakers and continuation paragraphs', () => {
    const parsed = parseTranscript(fixture)
    expect(parsed.chapters).toHaveLength(1)
    expect(parsed.turns).toHaveLength(2)
    expect(parsed.turns[0]).toMatchObject({ speaker: '孙宇晨', timestamp: '00:00:15', seconds: 15 })
    expect(parsed.turns[1]?.content).toContain('续段')
  })

  it('searches content and speaker without changing source text', () => {
    const turns = parseTranscript(fixture).turns
    expect(filterTranscript(turns, '认知')).toHaveLength(1)
    expect(filterTranscript(turns, '邵艾伦')).toHaveLength(1)
    expect(timestampToSeconds('01:02:03')).toBe(3723)
  })
})
