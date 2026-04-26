import { createClient } from '@supabase/supabase-js';

/**
 * Ticket Management API
 * 
 * POST /api/ticket-management - Update ticket properties with AI assistance
 * 
 * Body for POST:
 * - ticket_id (required): UUID of the ticket
 * - action (required): 'recategorize' | 'reprioritize' | 'change_status'
 * - new_value (required): New value for the action
 * - ai_suggestion (optional): AI suggestion context
 * - reason (optional): Reason for the change
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

// Validate action and value
function validateActionAndValue(action, value) {
  const validActions = ['recategorize', 'reprioritize', 'change_status'];
  
  if (!validActions.includes(action)) {
    return { valid: false, error: 'Invalid action' };
  }

  switch (action) {
    case 'recategorize':
      const validCategories = [
        'Electrical', 'Plumbing', 'HVAC (Air Conditioning)', 'Carpentry & Furniture',
        'IT & Networking', 'General Maintenance', 'Painting', 'Civil Works',
        'Appliance Repair', 'Cleaning Services'
      ];
      if (!validCategories.includes(value)) {
        return { valid: false, error: 'Invalid category' };
      }
      break;

    case 'reprioritize':
      const validPriorities = ['Low', 'Medium', 'High'];
      if (!validPriorities.includes(value)) {
        return { valid: false, error: 'Invalid priority' };
      }
      break;

    case 'change_status':
      const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed', 'Escalated', 'Pending Verification'];
      if (!validStatuses.includes(value)) {
        return { valid: false, error: 'Invalid status' };
      }
      break;
  }

  return { valid: true };
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createSupabaseClient(req);

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { ticket_id, action, new_value, ai_suggestion, reason } = req.body;

    // Validate required fields
    if (!ticket_id || !action || !new_value) {
      return res.status(400).json({ 
        error: 'Missing required fields: ticket_id, action, new_value' 
      });
    }

    // Validate action and value
    const validation = validateActionAndValue(action, new_value);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Get user profile and ticket
    const [{ data: profile }, { data: ticket }] = await Promise.all([
      supabase.from('profiles').select('role, full_name').eq('id', user.id).single(),
      supabase.from('tickets').select('*').eq('id', ticket_id).single()
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

    // Additional permission checks for specific actions
    if (action === 'recategorize' && !isAdmin && !isTechnician) {
      return res.status(403).json({ error: 'Only technicians and admins can recategorize tickets' });
    }

    if (action === 'reprioritize' && !isAdmin) {
      return res.status(403).json({ error: 'Only admins can reprioritize tickets' });
    }

    // Prepare update data
    let updateData = { updated_at: new Date().toISOString() };
    let oldValue = null;

    switch (action) {
      case 'recategorize':
        updateData.category = new_value;
        oldValue = ticket.category;
        break;
      case 'reprioritize':
        updateData.priority = new_value;
        oldValue = ticket.priority;
        break;
      case 'change_status':
        updateData.status = new_value;
        oldValue = ticket.status;
        break;
    }

    // Update the ticket
    const { data: updatedTicket, error: updateError } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', ticket_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Add a system message to chat about the change
    const changeMessage = `${profile.full_name} changed ${action.replace('_', ' ')} from "${oldValue}" to "${new_value}"${reason ? `. Reason: ${reason}` : ''}${ai_suggestion ? ` (AI suggested)` : ''}`;

    await supabase
      .from('ticket_messages')
      .insert({
        ticket_id,
        sender_id: user.id,
        sender_type: profile.role === 'admin' ? 'admin' : 'technician',
        message: changeMessage,
        message_type: 'status_update',
        is_internal: false,
      });

    // If category changed, generate new repair guide
    let newRepairGuide = null;
    if (action === 'recategorize' && (isTechnician || isAdmin)) {
      try {
        const { data: aiData } = await supabase.functions.invoke('suggest-fix', {
          body: {
            ticketDescription: ticket.description,
            ticketCategory: new_value,
          },
        });

        if (aiData) {
          newRepairGuide = aiData;

          // Add AI repair guide to chat
          await supabase
            .from('ticket_messages')
            .insert({
              ticket_id,
              sender_id: null,
              sender_type: 'ai',
              message: `Updated repair guide for ${new_value} issue:\n\n**Technical Diagnosis:** ${aiData.technical_diagnosis}\n\n**Tools Required:**\n${aiData.tools_required.map(tool => `• ${tool}`).join('\n')}\n\n**Safety Precaution:** ${aiData.safety_precaution}`,
              message_type: 'ai_suggestion',
              ai_context: {
                trigger: 'category_change',
                old_category: oldValue,
                new_category: new_value,
              },
              is_internal: false,
            });
        }
      } catch (aiError) {
        console.error('Failed to generate updated repair guide:', aiError);
      }
    }

    // Send notifications if needed
    if (action === 'change_status') {
      // Notify ticket creator about status change
      if (ticket.created_by !== user.id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: ticket.created_by,
            ticket_id,
            message: `Ticket status changed to ${new_value}`,
          });
      }

      // Notify assignee about status change
      if (ticket.assigned_to && ticket.assigned_to !== user.id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: ticket.assigned_to,
            ticket_id,
            message: `Assigned ticket status changed to ${new_value}`,
          });
      }
    }

    return res.status(200).json({
      success: true,
      ticket: updatedTicket,
      old_value,
      new_value,
      action,
      new_repair_guide: newRepairGuide,
      message: `Ticket ${action.replace('_', ' ')} updated successfully`,
    });

  } catch (error) {
    console.error('Ticket management error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
