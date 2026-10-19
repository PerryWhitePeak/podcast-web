export type AlignmentStatus = 'accurate' | 'needs_review' | 'unmatched' | 'not_applicable'
export type ContentType = 'grounded' | 'mixed' | 'insufficient'

export interface SourceLocation {
  path: string
  markdown_sha256: string
  line_start: number
  line_end: number
}

export interface Citation {
  citation_id: string
  speaker: string | null
  speaker_confirmed: boolean
  quote: string
  paragraph_id: string
  turn_id: string | null
  display_timestamp: string | null
  source: SourceLocation
  alignment_status: AlignmentStatus
  audio_start: number | null
  audio_end: number | null
  candidate_audio_start: number | null
  candidate_audio_end: number | null
  audio_url: string | null
  playback_available: boolean
}

export interface SearchHit {
  rank: number
  chunk_id: string
  content: string
  speakers: string[]
  turn_ids: string[]
  score: number
  alignment_status: string
  audio_start: number | null
  audio_end: number | null
  playback_available: boolean
  evidence: Citation[]
}

export interface SearchResponse {
  question: string
  mode_requested: string
  mode_used: string
  semantic_error: string | null
  results: SearchHit[]
}

export interface ChatResponse {
  question: string
  answer: string
  content_type: ContentType
  answer_origin: 'model' | 'fixed' | 'evidence_extract' | 'safety_fallback'
  citations: Citation[]
  retrieval: SearchResponse
  answer_completeness: {
    status: 'not_applicable' | 'pending_human_review' | 'incomplete'
    action_request: boolean
    human_review: boolean
    reason: string
    [key: string]: unknown
  }
  answer_mode?: 'basic_conversation' | 'interview_knowledge' | 'open_analysis'
  model_used?: boolean
}

export type ChatStreamEvent =
  | { event: 'status'; data: { phase: 'retrieving' | 'generating' | 'validating'; message?: string } }
  | { event: 'delta'; data: { text: string; validation: 'citation_quote_speaker_checks_passed' | 'conversation_contract_passed' | 'fixed_response' | 'safe_fallback' } }
  | { event: 'citations'; data: { items: Citation[] } }
  | { event: 'done'; data: { response: ChatResponse; safety_buffered: boolean; degraded?: boolean } }
  | { event: 'error'; data: { code: string; message: string } }

export interface HealthResponse {
  status: 'ok' | 'degraded'
  schema_version: string
  canonical_source_current: boolean
  keyword_index_ready: boolean
  semantic_index_ready: boolean
  semantic_model: string | null
  llm_provider: string
  llm_configured: boolean
  auth_enabled?: boolean
  auth_configured?: boolean
  audio_available: boolean
  audio_filename: string | null
  audio_media_type: string | null
  audio_duration_seconds: number | null
}

export interface ApiErrorBody {
  detail?: {
    code?: string
    message?: string
  } | Array<{ msg?: string }>
}

export interface AccountResponse {
  email: string
  role: 'user' | 'admin'
  available: number
  reserved: number
  consumed: number
  total_granted: number
  csrf_token: string | null
}
