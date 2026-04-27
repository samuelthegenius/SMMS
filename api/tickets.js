import { createClient } from '@supabase/supabase-js';

/**
 * Tickets API - General ticket CRUD operations
 * 
 * GET /api/tickets?id=xxx - Get ticket by ID
 * PUT /api/tickets - Update ticket properties
 * DELETE /api/tickets?id=xxx - Delete ticket
 * 
 * Body for PUT:
 * - id (required): UUID of the ticket
 * - category (optional): New category
 * - priority (optional): New priority (Low, Medium, High)
 * - status (optional): New status
 * - assigned_to (optional): UUID of assignee
 * - reason (optional): Reason for change (logged in history)
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
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Create Supabase client
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

// Validate update fields
function validateUpdateFields(updates) {
  const validFields = ['category', 'priority', 'status', 'assigned_to', 'title', 'description'];
  const validCategories = [
    'Electrical', 'Plumbing', 'HVAC (Air Conditioning)', 'Carpentry & Furniture',
    'IT & Networking', 'General Maintenance', 'Painting', 'Civil Works',
    'Appliance Repair', 'Cleaning Services'
  ];
  const validPriorities = ['Low', 'Medium', 'High'];
  const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed', 'Escalated', 'Pending Verification'];

  const errors = [];

  for (const [key, value] of Object.entries(updates)) {
    if (!validFields.includes(key)) {
      errors.push(`Invalid field: ${key}`);
      continue;
    }

    switch (key) {
      case 'category':
        if (!validCategories.includes(value)) {
          errors.push(`Invalid category: ${value}`);
        }
        break;
      case 'priority':
        if (!validPriorities.includes(value)) {
          errors.push(`Invalid priority: ${value}`);
        }
        break;
      case 'status':
        if (!validStatuses.includes(value)) {
          errors.push(`Invalid status: ${value}`);
        }
        break;
    }
  }

  return errors;
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
  if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createSupabaseClient(req);

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // GET - Retrieve ticket
    if (req.method === 'GET') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Ticket ID is required' });
      }

      const { data: ticket, error } = await supabase
        .from('tickets')
        .select(`
          *,
          creator:created_by(id, full_name, role),
          assignee:assigned_to(id, full_name, role)
        `)
        .eq('id', id)
        .single();

      if (error || !ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      // Check access permissions
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      const isCreator = ticket.created_by === user.id;
      const isAssignee = ticket.assigned_to === user.id;
      const isAdmin = profile?.role === 'admin';
      const isTechnician = profile?.role === 'technician';

      if (!isCreator && !isAssignee && !isAdmin && !isTechnician) {
        return res.status(403).json({ error: 'Access denied' });
      }

      return res.status(200).json({ ticket });
    }

    // PUT - Update ticket
    if (req.method === 'PUT') {
      const { id, reason, ai_suggestion, ...updates } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'Ticket ID is required' });
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // Validate fields
      const validationErrors = validateUpdateFields(updates);
      if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Validation failed', details: validationErrors });
      }

      // Get user profile and current ticket
      const [{ data: profile }, { data: ticket }] = await Promise.all([
        supabase.from('profiles').select('role, full_name').eq('id', user.id).single(),
        supabase.from('tickets').select('*').eq('id', id).single()
      ]);

      if (!profile || !ticket) {
        return res.status(404).json({ error: 'Profile or ticket not found' });
      }

      // Check permissions
      const isAdmin = profile.role === 'admin';
      const isTechnician = profile.role === 'technician' && ticket.assigned_to === user.id;
      const isCreator = ticket.created_by === user.id;

      if (!isAdmin && !isTechnician && !isCreator) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Field-level permissions
      if (updates.category && !isAdmin && !isTechnician) {
        return res.status(403).json({ error: 'Only technicians and admins can change category' });
      }

      if (updates.priority && !isAdmin) {
        return res.status(403).json({ error: 'Only admins can change priority' });
      }

      if (updates.assigned_to && !isAdmin) {
        return res.status(403).json({ error: 'Only admins can reassign tickets' });
      }

      // Prepare update data
      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      // Track what changed for system message
      const changes = [];
      if (updates.category && updates.category !== ticket.category) {
        changes.push({ field: 'category', old: ticket.category, new: updates.category });
      }
      if (updates.priority && updates.priority !== ticket.priority) {
        changes.push({ field: 'priority', old: ticket.priority, new: updates.priority });
      }
      if (updates.status && updates.status !== ticket.status) {
        changes.push({ field: 'status', old: ticket.status, new: updates.status });
      }

      // Update ticket
      const { data: updatedTicket, error: updateError } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      // Post system message to chat about changes
      if (changes.length > 0) {
        const changeTexts = changes.map(c => `${c.field} from "${c.old}" to "${c.new}"`).join(', ');
        const systemMessage = `${profile.full_name} updated ${changeTexts}${reason ? `. Reason: ${reason}` : ''}${ai_suggestion ? ` (AI suggested)` : ''}`;

        await supabase
          .from('ticket_messages')
          .insert({
            ticket_id: id,
            sender_id: user.id,
            sender_type: isAdmin ? 'admin' : isTechnician ? 'technician' : 'user',
            message: systemMessage,
            message_type: 'status_update',
            is_internal: false,
          });
      }

      // Generate new repair guide if category changed
      let newRepairGuide = null;
      if (updates.category && (isTechnician || isAdmin)) {
        try {
          const { data: aiData } = await supabase.functions.invoke('suggest-fix', {
            body: {
              ticketDescription: updatedTicket.description,
              ticketCategory: updates.category,
            },
          });
          newRepairGuide = aiData;

          // Add AI repair guide to chat
          if (aiData) {
            await supabase
              .from('ticket_messages')
              .insert({
                ticket_id: id,
                sender_id: null,
                sender_type: 'ai',
                message: `Updated repair guide for ${updates.category} issue:\n\n**Technical Diagnosis:** ${aiData.technical_diagnosis}\n\n**Tools Required:**\n${aiData.tools_required.map(tool => `• ${tool}`).join('\n')}\n\n**Safety Precaution:** ${aiData.safety_precaution}`,
                message_type: 'ai_suggestion',
                ai_context: {
                  trigger: 'category_change',
                  old_category: ticket.category,
                  new_category: updates.category,
                },
                is_internal: false,
              });
          }
        } catch (_aiError) {
          // Repair guide generation failed silently
        }
      }

      // Send notifications for status changes
      if (updates.status && updates.status !== ticket.status) {
        const notifications = [];
        
        if (ticket.created_by !== user.id) {
          notifications.push({
            user_id: ticket.created_by,
            ticket_id: id,
            message: `Ticket status changed to ${updates.status}`,
          });
        }

        if (ticket.assigned_to && ticket.assigned_to !== user.id) {
          notifications.push({
            user_id: ticket.assigned_to,
            ticket_id: id,
            message: `Assigned ticket status changed to ${updates.status}`,
          });
        }

        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }
      }

      return res.status(200).json({
        success: true,
        ticket: updatedTicket,
        new_repair_guide: newRepairGuide,
        message: 'Ticket updated successfully',
      });
    }

    // DELETE - Delete ticket (admin only)
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ error: 'Ticket ID is required' });
      }

      // Verify admin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete tickets' });
      }

      const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        message: 'Ticket deleted successfully',
      });
    }

  } catch (error) {
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
