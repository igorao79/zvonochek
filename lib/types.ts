import type { SignalData } from 'simple-peer'

export type CallSignal = {
  type: 'offer' | 'answer' | 'ice-candidate' | 'end-call'
  from: string
  to: string
  signal?: SignalData
  candidate?: RTCIceCandidate
}

export type CallState = 'idle' | 'calling' | 'receiving' | 'connected'

export type User = {
  id: string
  email: string
  display_name?: string
  full_name?: string
  avatar_url?: string
  created_at?: string
  updated_at?: string
  online?: boolean
}

