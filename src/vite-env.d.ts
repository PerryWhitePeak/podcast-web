/// <reference types="vite/client" />

declare const __TRANSCRIPT_MARKDOWN__: string

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_PROXY_TARGET?: string
  readonly VITE_BASE_PATH?: string
  readonly VITE_PUBLIC_DEPLOYMENT?: 'github-pages' | string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
