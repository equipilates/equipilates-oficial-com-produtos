import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Fallback = projeto corporativo Equipilates (override via env na Vercel)
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || 'https://aigegzzlmpxtfewxixif.supabase.co';
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpZ2VnenpsbXB4dGZld3hpeGlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NjE5MTksImV4cCI6MjA5OTUzNzkxOX0.I64rIVU9cOzSry8AV_NIyJcdQs6dWBx7q3IJTO-rllU';

// Cliente público para uso no frontend
export const supabase: SupabaseClient<Database> = createClient<Database>(supabaseUrl, supabaseAnonKey);

// Cliente com service role para operações administrativas (server-side only)
export const getServiceSupabase = () => {
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.warn('Missing SUPABASE_SERVICE_ROLE_KEY - using anon client');
    return supabase;
  }
  return createClient<Database>(supabaseUrl, serviceRoleKey);
};
