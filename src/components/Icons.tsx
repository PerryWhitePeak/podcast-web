import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const SendIcon = (props: IconProps) => <svg {...base} {...props}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
export const SearchIcon = (props: IconProps) => <svg {...base} {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
export const QuoteIcon = (props: IconProps) => <svg {...base} {...props}><path d="M9 11H4a2 2 0 0 0-2 2v4h6v-6c0-4-2-6-5-7"/><path d="M22 11h-5a2 2 0 0 0-2 2v4h6v-6c0-4-2-6-5-7"/></svg>
export const PlayIcon = (props: IconProps) => <svg {...base} {...props}><path d="m8 5 11 7-11 7Z"/></svg>
export const PauseIcon = (props: IconProps) => <svg {...base} {...props}><path d="M8 5v14M16 5v14"/></svg>
export const CloseIcon = (props: IconProps) => <svg {...base} {...props}><path d="M6 6l12 12M18 6 6 18"/></svg>
export const RetryIcon = (props: IconProps) => <svg {...base} {...props}><path d="M20 12a8 8 0 1 1-2.34-5.66L20 8"/><path d="M20 3v5h-5"/></svg>
export const ExternalIcon = (props: IconProps) => <svg {...base} {...props}><path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
export const WaveIcon = (props: IconProps) => <svg {...base} {...props}><path d="M3 12h2l2-7 4 14 3-10 2 6 2-3h3"/></svg>
