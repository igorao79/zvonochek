'use client'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null

export const supabase = (() => {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  supabaseClient = createSupabaseClient(supabaseUrl, supabaseKey)
  return supabaseClient
})()

// Для обратной совместимости
export const createClient = () => supabase
