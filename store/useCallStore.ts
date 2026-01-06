'use client'

import { create } from 'zustand'

interface CallStore {
  // Состояние звонка
  isCalling: boolean
  error: string | null

  // Методы
  setError: (error: string | null) => void
  endCall: () => void
  setIsCalling: (isCalling: boolean) => void
}

export const useCallStore = create<CallStore>((set, get) => ({
  isCalling: false,
  error: null,

  setError: (error: string | null) => {
    set({ error })
  },

  endCall: () => {
    console.log('📞 Call ended via store')
    set({
      isCalling: false,
      error: null
    })
  },

  setIsCalling: (isCalling: boolean) => {
    set({ isCalling })
  }
}))

export default useCallStore

