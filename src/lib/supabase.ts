import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[LuminaSupport] VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no definidas.')
}

export const supabase = createClient(
  supabaseUrl || 'https://bd.luissalascortes.dev',
  supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2NDg0ODAwLCJleHAiOjE5MzQyNTEyMDB9.31hvLUfMpE42-Opml7SLHQUQUSsBmqhWv8sItLbxsX0'
)
