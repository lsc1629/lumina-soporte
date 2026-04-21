import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bd.luissalascortes.dev'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc2NDg0ODAwLCJleHAiOjE5MzQyNTEyMDB9.31hvLUfMpE42-Opml7SLHQUQUSsBmqhWv8sItLbxsX0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
