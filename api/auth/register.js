/**
 * POST /api/auth/register
 *
 * Server-side registration using the Supabase service role key.
 * All validation + auth user creation + profile creation run here so that
 * if profile creation fails we can hard-delete the auth user and avoid ghost rows.
 */

import { createClient } from '@supabase/supabase-js';

const ALLOWED_ORIGINS = [
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.PUBLIC_APP_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
].filter(Boolean);

const VALID_ROLES = [
  'student', 'staff', 'manager', 'supervisor',
  'team_lead', 'technician', 'dean', 'src', 'porter',
];

// Password: min 8 chars, 1 uppercase, 1 lowercase, 1 number
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const EMAIL_REGEX    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getCorsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  Object.entries({ ...getCorsHeaders(origin), ...SECURITY_HEADERS }).forEach(
    ([k, v]) => res.setHeader(k, v),
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Parse body ──────────────────────────────────────────────────────────────
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json'))
    return res.status(400).json({ error: 'Content-Type must be application/json' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { email, password, fullName, role, idNumber, department, specialization, accessCode, gender } = body || {};

  // ── Field validation ────────────────────────────────────────────────────────
  if (!email || !password || !fullName || !role || !idNumber || !accessCode)
    return res.status(400).json({ error: 'Missing required fields' });
  if (!EMAIL_REGEX.test(email))
    return res.status(400).json({ error: 'Invalid email address' });
  if (!PASSWORD_REGEX.test(password))
    return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and number' });
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ error: 'Invalid role' });
  if (idNumber.length < 5)
    return res.status(400).json({ error: 'Invalid ID number format' });
  if ((role === 'technician' || role === 'team_lead') && !specialization)
    return res.status(400).json({ error: 'Specialization is required for technicians and team leads' });
  if ((role === 'student' || role === 'porter') && !['male', 'female'].includes(gender))
    return res.status(400).json({ error: 'Gender is required for students and porters' });

  // ── Step 1: Validate access code ────────────────────────────────────────────
  const { data: codeRow } = await supabaseAdmin
    .from('role_access_codes')
    .select('code')
    .eq('role', role)
    .maybeSingle();

  if (!codeRow || codeRow.code !== accessCode)
    return res.status(400).json({ error: 'Invalid access code. Please check and try again.' });

  // ── Step 2: Check email not already in use ──────────────────────────────────
  const { data: existingAuthUsers } = await supabaseAdmin.auth.admin.listUsers();
  const emailTaken = existingAuthUsers?.users?.some(
    u => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (emailTaken)
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });

  // ── Step 3: Check ID number not already in use ──────────────────────────────
  const { data: existingId } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('identification_number', idNumber)
    .maybeSingle();

  if (existingId)
    return res.status(409).json({ error: 'This ID number is already registered. Please sign in or contact support.' });

  // ── Step 4: Create auth user ────────────────────────────────────────────────
  const resolvedDepartment =
    role === 'technician' || role === 'team_lead' ? 'Works Department' : (department || '');

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // access code already verifies identity; skip email confirmation
    user_metadata: { full_name: fullName, role, department: resolvedDepartment },
  });

  if (authError)
    return res.status(500).json({ error: 'Failed to create account. Please try again.' });

  const userId = authData.user.id;

  // ── Step 5: Create profile (rollback auth user on failure) ──────────────────
  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: userId,
    email,
    full_name: fullName,
    role,
    identification_number: idNumber,
    department: resolvedDepartment,
    gender: (role === 'student' || role === 'porter') ? gender : null,
    created_at: new Date().toISOString(),
  });

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    const msg = profileError.message || '';
    if (msg.includes('identification_number') || msg.includes('already'))
      return res.status(409).json({ error: 'This ID number is already registered.' });
    return res.status(500).json({ error: 'Profile setup failed. Please try again.' });
  }

  // ── Step 6: Insert technician/team_lead skills (non-fatal) ──────────────────
  if ((role === 'technician' || role === 'team_lead') && specialization) {
    await supabaseAdmin
      .from('technician_skills')
      .insert({ profile_id: userId, skill: specialization });
  }

  return res.status(201).json({ message: 'Account created successfully. You can now sign in.' });
}
