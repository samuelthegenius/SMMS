import { createClient } from '@supabase/supabase-js';

/**
 * Ticket Chat API
 * 
 * GET /api/ticket-chat?ticket_id=xxx - Get chat messages
 * POST /api/ticket-chat - Send a message
 * DELETE /api/ticket-chat?message_id=xxx - Delete/edit a message
 * 
 * Query params for GET:
 * - ticket_id (required): UUID of the ticket
 * - limit (optional): Number of messages to return (default 50)
 * - before (optional): Get messages before this timestamp
 * 
 * Body for POST:
 * - ticket_id (required): UUID of the ticket
 * - message (required): Message text
 * - is_internal (optional): Boolean for internal notes
 * - parent_id (optional): UUID of parent message for threading
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
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createSupabaseClient(req);

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // GET - Retrieve chat messages
    if (req.method === 'GET') {
      const { ticket_id, limit = 50, before } = req.query;

      if (!ticket_id) {
        return res.status(400).json({ error: 'ticket_id is required' });
      }

      // Validate ticket access
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('created_by, assigned_to')
        .eq('id', ticket_id)
        .single();

      if (ticketError || !ticket) {
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
      const isITAdmin = profile?.role === 'it_admin';
      const isSupervisor = profile?.role === 'manager' || profile?.role === 'supervisor';

      if (!isCreator && !isAssignee && !isITAdmin && !isSupervisor) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Build query
      let query = supabase
        .from('ticket_messages')
        .select(`
          id,
          ticket_id,
          sender_id,
          sender_type,
          message,
          message_type,
          ai_context,
          is_internal,
          is_deleted,
          deleted_at,
          deleted_by,
          parent_message_id,
          created_at,
          edited_at,
          sender:sender_id(full_name, role)
        `)
        .eq('ticket_id', ticket_id)
        .order('created_at', { ascending: true })
        .limit(parseInt(limit, 10));

      // Filter out internal messages for non-staff
      if (!isAssignee && !isITAdmin && !isSupervisor) {
        query = query.eq('is_internal', false);
      }

      // Filter out deleted messages for non-admins/supervisors
      if (!isITAdmin && !isSupervisor) {
        query = query.eq('is_deleted', false);
      }

      if (before) {
        query = query.lt('created_at', before);
      }

      const { data: messages, error } = await query;

      if (error) {
        throw error;
      }

      return res.status(200).json({
        messages: messages || [],
        count: messages?.length || 0,
      });
    }

    // POST - Send a message
    if (req.method === 'POST') {
      const { ticket_id, message, is_internal = false, parent_id, ai_assist = false } = req.body;

      if (!ticket_id || !message || typeof message !== 'string') {
        return res.status(400).json({ error: 'ticket_id and message are required' });
      }

      if (message.trim().length === 0 || message.length > 3000) {
        return res.status(400).json({ error: 'Message must be between 1 and 3000 characters' });
      }

      // Validate ticket and get context
      const { data: ticket, error: ticketError } = await supabase
        .from('tickets')
        .select('created_by, assigned_to, title, status')
        .eq('id', ticket_id)
        .single();

      if (ticketError || !ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .single();

      const isCreator = ticket.created_by === user.id;
      const isAssignee = ticket.assigned_to === user.id;
      const isITAdmin = profile?.role === 'it_admin';
      const isTechnician = profile?.role === 'technician';
      const isSupervisor = profile?.role === 'manager' || profile?.role === 'supervisor';

      // Determine sender type
      let senderType = 'user';
      if (isITAdmin) senderType = 'admin'; // Keep 'admin' as sender type for UI compatibility
      else if (isTechnician && isAssignee) senderType = 'technician';

      // Permission checks
      if (is_internal && !isAssignee && !isITAdmin && !isSupervisor) {
        return res.status(403).json({ error: 'Only staff can create internal notes' });
      }

      if (!isCreator && !isAssignee && !isITAdmin && !isSupervisor) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Insert message
      const { data: newMessage, error: insertError } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id,
          sender_id: user.id,
          sender_type: senderType,
          message: message.trim(),
          message_type: 'text',
          is_internal: is_internal && (isAssignee || isAdmin),
          parent_message_id: parent_id || null,
        })
        .select(`
          id,
          ticket_id,
          sender_id,
          sender_type,
          message,
          message_type,
          is_internal,
          parent_message_id,
          created_at,
          sender:sender_id(full_name, role)
        `)
        .single();

      if (insertError) {
        throw insertError;
      }

      // If AI assist is requested, generate AI response
      let aiResponse = null;
      if (ai_assist && (isAssignee || isITAdmin || isSupervisor)) {
        try {
          const { data: aiData } = await supabase.functions.invoke('ai-chat-assistant', {
            body: {
              ticket_id,
              message,
              action: 'chat',
            },
          });
          aiResponse = aiData;
        } catch {
          // AI assist failed silently
        }
      }

      return res.status(201).json({
        message: newMessage,
        ai_response: aiResponse,
      });
    }

    // DELETE - Delete/soft-delete a message (only own messages within 5 minutes)
    if (req.method === 'DELETE') {
      const { message_id } = req.query;

      if (!message_id) {
        return res.status(400).json({ error: 'message_id is required' });
      }

      // Get the message
      const { data: message, error: msgError } = await supabase
        .from('ticket_messages')
        .select('sender_id, created_at, sender_type')
        .eq('id', message_id)
        .single();

      if (msgError || !message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Check permissions
      const isOwnMessage = message.sender_id === user.id;
      const isRecent = new Date(message.created_at) > new Date(Date.now() - 5 * 60 * 1000);
      const isAI = message.sender_type === 'ai';

      if (!isOwnMessage && !isAI) {
        return res.status(403).json({ error: 'Can only delete your own messages' });
      }

      if (!isRecent && !isAI) {
        return res.status(403).json({ error: 'Can only delete messages within 5 minutes' });
      }

      // Soft delete - preserve original content
      const { data: updated, error: updateError } = await supabase
        .from('ticket_messages')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user.id,
        })
        .eq('id', message_id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      return res.status(200).json({
        message: 'Message deleted',
        updated,
      });
    }

  } catch (error) {
    return res.status(500).json({
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
