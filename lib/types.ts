import type { SignalData } from 'simple-peer'
import SimplePeer from 'simple-peer'

export type CallSignal = {
  type: 'offer' | 'answer' | 'ice-candidate' | 'end-call'
  from: string
  to: string
  signal?: any
  candidate?: RTCIceCandidate
}

export type CallState = 'idle' | 'calling' | 'receiving' | 'connected'

export type User = {
  id: string
  email: string
  display_name?: string
  avatar_url?: string
  last_seen?: string
  created_at?: string
  updated_at?: string
  online?: boolean
}

export interface PeerRefs {
  peerRef: React.MutableRefObject<SimplePeer.Instance | null>
  signalBufferRef: React.MutableRefObject<Array<{type: string, signal?: SimplePeer.SignalData, from: string}>>
  keepAliveIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>
  connectionCheckIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>
  reconnectTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>
  lastKeepAliveRef: React.MutableRefObject<number>
  reconnectAttemptsRef: React.MutableRefObject<number>
}

