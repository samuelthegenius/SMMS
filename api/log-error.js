/**
 * @file api/log-error.js
 * @description Receives client-side error reports (e.g. from ErrorBoundary) and
 * stores them in Supabase for debugging. Uses the service role key so the insert
 * bypasses RLS regardless of whether the user is authenticated.
 *
 * POST /api/log-error
 * Body: { message, stack, componentStack, url, userAgent, timestamp }
 */

import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGINS = [
  // Production domain
  'https://mtusmms.me',
  'https://www.mtusmms.me',
  // Vercel preview/production deployments (VERCEL_URL is the per-deployment URL)
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.PUBLIC_APP_URL,
  // Localhost for development
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
].filter(Boolean);

function getCorsHeaders(origin) {
  // For Vercel preview deployments (*.vercel.app), allow all — these are
  // protected by Vercel's own Deployment Protection anyway.
  const isVercelPreview = origin && origin.endsWith('.vercel.app');
  const allowedOrigin = isVercelPreview || ALLOWED_ORIGINS.includes(origin)
    ? origin
    : null;
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  Object.entries(getCorsHeaders(origin)).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const { message, stack, componentStack, url, userAgent, timestamp } = body || {};

  if (!message) return res.status(400).json({ error: 'message is required' });

  // Truncate fields to avoid Supabase column size limits
  const truncate = (str, max = 5000) => (str || '').slice(0, max);

  try {
    // Always log to console first — Vercel Runtime Logs capture this
    // even if the DB insert fails or SUPABASE_URL is not yet set.
    console.error('[client-error] PAGE:', url);
    console.error('[client-error] MESSAGE:', message);
    console.error('[client-error] STACK:', truncate(stack, 2000));
    console.error('[client-error] COMPONENT:', truncate(componentStack, 2000));

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error('[client-error-log] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var — set in Vercel Dashboard');
      return res.status(200).json({ logged: false, fallback: 'vercel_logs' });
    }

    const supabase = createClient(supabaseUrl, serviceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { error: dbError } = await supabase.from('client_error_logs').insert({
      message:          truncate(message, 1000),
      stack:            truncate(stack),
      component_stack:  truncate(componentStack),
      page_url:         truncate(url, 500),
      user_agent:       truncate(userAgent, 300),
      occurred_at:      timestamp || new Date().toISOString(),
    });

    if (dbError) {
      console.error('[client-error-log] DB insert failed:', dbError.message);
      return res.status(200).json({ logged: false, fallback: 'vercel_logs' });
    }

    return res.status(200).json({ logged: true });
  } catch (err) {
    // Never let logging itself crash — always return 200
    console.error('[client-error-log] Handler error:', err?.message);
    return res.status(200).json({ logged: false });
  }
}
