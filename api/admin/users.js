import { createClient } from '@supabase/supabase-js';

/**
 * Admin User Management API
 * 
 * GET /api/admin/users - List all users (with optional filters)
 * POST /api/admin/users - Create a new user
 * PUT /api/admin/users - Update a user
 * DELETE /api/admin/users?id=xxx - Delete a user
 * 
 * This endpoint requires IT Admin privileges.
 */

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.PUBLIC_APP_URL,
  process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null,
].filter(Boolean);

// Security headers
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Get CORS headers
function getCorsHeaders(origin) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Create Supabase admin client (service role)
function createSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

// Create Supabase client with user auth
function createSupabaseClient(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const token = authHeader?.replace('Bearer ', '');

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
    {
      global: {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    }
  );
}

// Verify IT Admin access
async function verifyITAdmin(supabase) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { authorized: false, error: 'Unauthorized', status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { authorized: false, error: 'Profile not found', status: 404 };
  }

  if (profile.role !== 'it_admin') {
    return { authorized: false, error: 'IT Admin access required', status: 403 };
  }

  return { authorized: true, userId: user.id };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';

  // Set CORS and security headers
  const corsHeaders = getCorsHeaders(origin);
  Object.entries({ ...corsHeaders, ...SECURITY_HEADERS }).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Validate method
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createSupabaseClient(req);
    const supabaseAdmin = createSupabaseAdmin();

    // Verify IT Admin access
    const authCheck = await verifyITAdmin(supabase);
    if (!authCheck.authorized) {
      return res.status(authCheck.status).json({ error: authCheck.error });
    }

    // GET - List users
    if (req.method === 'GET') {
      const { role, search, limit = 100, offset = 0 } = req.query;

      let query = supabaseAdmin
        .from('profiles')
        .select('*, technician_skills(skill)')
        .order('created_at', { ascending: false })
        .limit(parseInt(limit, 10))
        .range(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10) - 1);

      if (role && role !== 'all') {
        query = query.eq('role', role);
      }

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,identification_number.ilike.%${search}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        throw error;
      }

      // Transform data
      const transformedData = data?.map(user => ({
        ...user,
        skills: user.technician_skills?.map(ts => ts.skill) || []
      })) || [];

      return res.status(200).json({
        users: transformedData,
        count: count || data?.length || 0,
      });
    }

    // POST - Create user
    if (req.method === 'POST') {
      const { 
        email, 
        password, 
        fullName, 
        role, 
        department, 
        idNumber, 
        specialization,
        createdByAdmin 
      } = req.body;

      // Validate required fields
      if (!email || !fullName || !role || !idNumber) {
        return res.status(400).json({ 
          error: 'Missing required fields: email, fullName, role, idNumber' 
        });
      }

      // Prevent creating it_admin through this endpoint (for security)
      if (role === 'it_admin' && !createdByAdmin) {
        return res.status(403).json({ 
          error: 'IT Admin accounts can only be created through secure channels' 
        });
      }

      // Check if email already exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const emailExists = existingUsers?.users?.some(
        u => u.email?.toLowerCase() === email.toLowerCase()
      );
      if (emailExists) {
        return res.status(409).json({ error: 'Email already registered' });
      }

      // Check if ID number already exists
      const { data: existingId } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('identification_number', idNumber)
        .maybeSingle();

      if (existingId) {
        return res.status(409).json({ error: 'ID number already registered' });
      }

      // Determine department
      let resolvedDepartment = department;
      if (!resolvedDepartment) {
        if (role === 'technician' || role === 'team_lead') {
          resolvedDepartment = specialization === 'IT & Networking' 
            ? 'IT Support & Infrastructure' 
            : 'Works Department';
        } else if (role === 'supervisor' || role === 'manager') {
          resolvedDepartment = 'Works Department';
        } else {
          resolvedDepartment = 'Unassigned';
        }
      }

      // Generate password if not provided
      const userPassword = password || Math.random().toString(36).slice(-8) + 'A1!';

      // Create auth user
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: userPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role,
          department: resolvedDepartment,
        },
      });

      if (authError) {
        throw authError;
      }

      const userId = authData.user.id;

      // Create profile
      const skills = (role === 'technician' || role === 'team_lead') && specialization 
        ? [specialization] 
        : null;

      const { error: profileError } = await supabaseAdmin.from('profiles').insert({
        id: userId,
        email,
        full_name: fullName,
        role,
        identification_number: idNumber,
        department: resolvedDepartment,
        is_active: true,
        created_at: new Date().toISOString(),
      });

      if (profileError) {
        // Rollback: delete auth user
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw profileError;
      }

      // Insert technician skills if applicable
      if (skills && skills.length > 0) {
        const { error: skillsError } = await supabaseAdmin.from('technician_skills').insert(
          skills.map(skill => ({
            profile_id: userId,
            skill,
          }))
        );
        if (skillsError) {
          console.error('Failed to insert skills:', skillsError);
        }
      }

      return res.status(201).json({
        message: 'User created successfully',
        user: {
          id: userId,
          email,
          full_name: fullName,
          role,
          department: resolvedDepartment,
        },
        tempPassword: password ? undefined : userPassword,
      });
    }

    // PUT - Update user
    if (req.method === 'PUT') {
      const { id, fullName, role, department, idNumber, isActive, specialization } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Check if user exists
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', id)
        .single();

      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Prevent modifying other it_admin accounts (except self)
      if (existingUser.role === 'it_admin' && id !== authCheck.userId) {
        return res.status(403).json({ error: 'Cannot modify other IT Admin accounts' });
      }

      // Build update data
      const updateData = {};
      if (fullName !== undefined) updateData.full_name = fullName;
      if (role !== undefined) updateData.role = role;
      if (department !== undefined) updateData.department = department;
      if (idNumber !== undefined) updateData.identification_number = idNumber;
      if (isActive !== undefined) updateData.is_active = isActive;

      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(updateData)
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }

      // Update skills if technician or team_lead
      if ((role === 'technician' || role === 'team_lead') && specialization) {
        // Delete existing skills
        await supabaseAdmin.from('technician_skills').delete().eq('profile_id', id);
        // Insert new skill
        await supabaseAdmin.from('technician_skills').insert({
          profile_id: id,
          skill: specialization,
        });
      }

      return res.status(200).json({
        message: 'User updated successfully',
      });
    }

    // DELETE - Delete user
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Check if user exists
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('id, role')
        .eq('id', id)
        .single();

      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Prevent deleting it_admin accounts (including self)
      if (existingUser.role === 'it_admin') {
        return res.status(403).json({ error: 'Cannot delete IT Admin accounts through this endpoint' });
      }

      // Delete auth user (cascades to profile via ON DELETE CASCADE)
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);

      if (deleteError) {
        throw deleteError;
      }

      return res.status(200).json({
        message: 'User deleted successfully',
      });
    }

  } catch (error) {
    console.error('Admin users API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
