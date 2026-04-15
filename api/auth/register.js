/**
 * @file api/auth/register.js
 * @description Server-side user registration using the Supabase service role key.
 *
 * Why server-side?
 *   supabase.auth.signUp() (client) and profile creation are two separate systems
 *   with no shared transaction. If profile creation fails on the client, an orphaned
 *   auth.users row is left behind ("ghost user"), blocking future re-registration.
 *
 *   This endpoint uses the service role key which can:
 *     1. Run all validation queries before touching auth.users
 *     2. Create the auth user
 *     3. Create the profile
 *     4. Hard-delete the auth user if step 3 fails — no ghost user left behind
 *
 * POST /api/auth/register
 */

import { createClient } from '@supabase/supabase-js';

// Build allowed origins list
const ALLOWED_ORIGINS = [
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.PUBLIC_APP_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
].filter(Boolean);

function getCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Password: min 8 chars, 1 uppercase, 1 lowercase, 1 number
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  const origin = req.headers.origin || '';

  // Apply CORS + security headers
  Object.entries({ ...getCorsHeaders(origin), ...SECURITY_HEADERS }).forEach(
    ([k, v]) => res.setHeader(k, v)
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  // ── Service-role Supabase client ──────────────────────────────────────────
  // This key bypasses RLS and can delete auth users — NEVER expose to client.
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Parse & validate request body ────────────────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { email, password, fullName, role, idNumber, department, specialization, accessCode } = body || {};

  if (!email || !password || !fullName || !role || !idNumber || !accessCode) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!PASSWORD_REGEX.test(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and number' });
  }
  if (!['student', 'staff', 'technician'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (idNumber.length < 5) {
    return res.status(400).json({ error: 'Invalid ID number format' });
  }
  if (role === 'technician' && !specialization) {
    return res.status(400).json({ error: 'Specialization is required for technicians' });
  }

  // ── Step 1: Validate access code ─────────────────────────────────────────
  const { data: codeRow } = await supabaseAdmin
    .from('role_access_codes')
    .select('code')
    .eq('role', role)
    .maybeSingle();

  if (!codeRow || codeRow.code !== accessCode) {
    return res.status(400).json({ error: 'Invalid access code. Please check and try again.' });
  }

  // ── Step 2: Check email not already in use ───────────────────────────────
  const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
  const emailTaken = existingAuthUsers?.users?.some(
    u => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (emailTaken) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
  }

  // ── Step 3: Check ID number not already in use ───────────────────────────
  const { data: existingId } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('identification_number', idNumber)
    .maybeSingle();

  if (existingId) {
    return res.status(409).json({ error: 'This ID number is already registered. Please sign in or contact support.' });
  }

  // ── Step 4: Create the auth user ─────────────────────────────────────────
  // All validations passed — safe to create at this point.
  const resolvedDepartment = role === 'technician' ? 'Works Department' : (department || '');

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: false, // keep email confirmation flow if enabled in Supabase settings
    user_metadata: {
      full_name: fullName,
      role,
      department: resolvedDepartment,
    },
  });

  if (authError) {
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }

  const userId = authData.user.id;

  // ── Step 5: Create the profile ───────────────────────────────────────────
  // If this fails for any reason we immediately delete the auth user so no
  // ghost row is left in auth.users.
  const skills = role === 'technician' && specialization ? [specialization] : null;

  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: userId,
    email,
    full_name: fullName,
    role,
    identification_number: idNumber,
    department: resolvedDepartment,
    created_at: new Date().toISOString(),
  });

  if (profileError) {
    // Hard-delete the auth user — no ghost user left behind
    await supabaseAdmin.auth.admin.deleteUser(userId);

    // Surface known constraint violations
    const msg = profileError.message || '';
    if (msg.includes('identification_number') || msg.includes('already')) {
      return res.status(409).json({ error: 'This ID number is already registered.' });
    }
    return res.status(500).json({ error: 'Profile setup failed. Please try again.' });
  }

  // ── Step 6: Insert technician skills ─────────────────────────────────────
  if (skills?.length) {
    await supabaseAdmin.from('technician_skills').insert(
      skills.map(skill => ({ profile_id: userId, skill }))
    );
    // Skills failure is non-fatal — user is registered, skills can be added later
  }

  return res.status(201).json({ message: 'Account created. Please check your email to verify your account.' });
}
