import { createClient } from '@supabase/supabase-js'

const _url = import.meta.env.VITE_SUPABASE_URL as string
const _key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!_url || !_key) {
  console.warn('[LuminaSupport] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no definidas.')
}

export const SUPABASE_URL = _url || 'https://bd.luissalascortes.dev'
export const SUPABASE_ANON_KEY = _key || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2NDg0ODAwLCJleHAiOjE5MzQyNTEyMDB9.31hvLUfMpE42-Opml7SLHQUQUSsBmqhWv8sItLbxsX0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
