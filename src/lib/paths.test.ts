import { describe, expect, it } from 'vitest'
import { appPath, assetPath, currentRoute } from './paths'

describe('base-aware paths', () => {
  it('builds navigation and asset paths from the Vite base', () => {
    expect(appPath('/agent')).toBe(`${import.meta.env.BASE_URL}agent`)
    expect(assetPath('interview-duo.png')).toBe(`${import.meta.env.BASE_URL}interview-duo.png`)
  })

  it('normalizes route trailing slashes', () => {
    expect(currentRoute('/agent/')).toBe('/agent')
    expect(currentRoute('/transcript')).toBe('/transcript')
  })
})
