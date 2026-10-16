// Public Supabase settings. Both names are accepted because Supabase/Vercel integrations
// have used "anon key" and "publishable key" for the same browser-safe key.
// (Literal process.env references so Next.js can inline them into the client bundle.)
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "") as string;
export const SUPABASE_PUBLIC_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "") as string;
