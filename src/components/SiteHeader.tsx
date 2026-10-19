import type { ReactNode } from 'react'
import { appPath } from '../lib/paths'

interface SiteHeaderProps {
  current: 'home' | 'transcript' | 'agent'
  aside?: ReactNode
}

const navItems = [
  { key: 'home', path: '/', label: '首页' },
  { key: 'transcript', path: '/transcript', label: '访谈稿' },
  { key: 'agent', path: '/agent', label: 'AI Agent' },
] as const

export function SiteHeader({ current, aside }: SiteHeaderProps) {
  return (
    <header className="global-header">
      <a className="global-brand" href={appPath('/')} aria-label="孙学 × 薄肌理论首页">
        <span className="brand-monogram">孙<span>×</span>薄</span>
        <span><strong>孙学 × 薄肌理论</strong><small>THE LONG CONVERSATION</small></span>
      </a>
      <nav className="global-nav" aria-label="主导航">
        {navItems.map((item) => (
          <a key={item.key} href={appPath(item.path)} aria-current={current === item.key ? 'page' : undefined}>{item.label}</a>
        ))}
        <a className="nav-video" href="https://www.bilibili.com/video/BV1fcHD6cEw3" target="_blank" rel="noreferrer">原片 ↗</a>
      </nav>
      {aside && <div className="global-aside">{aside}</div>}
    </header>
  )
}
