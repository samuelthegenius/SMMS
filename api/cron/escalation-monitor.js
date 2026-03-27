import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

/**
 * Cron Job: Escalation Monitor
 * Runs every 6 hours to check for tickets that need escalation
 * Triggered by Vercel Cron Jobs
 * 
 * Schedule: 0 0/6 * * * (every 6 hours in UTC)
 */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Verify cron secret to ensure request is from Vercel
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('Running escalation monitor at', new Date().toISOString());
    }

    // Find tickets that need escalation
    const { data: tickets, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('status', 'open')
      .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .is('escalated_at', null);

    if (error) {
      throw error;
    }

    const escalatedTickets = [];

    for (const ticket of tickets || []) {
      // Escalate ticket
      const { error: updateError } = await supabase
        .from('tickets')
        .update({
          escalated_at: new Date().toISOString(),
          priority: 'high',
        })
        .eq('id', ticket.id);

      if (!updateError) {
        escalatedTickets.push(ticket.id);
        
        // Use waitUntil for post-response work (sending notifications)
        waitUntil(
          sendEscalationNotification(ticket)
        );
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`Escalated ${escalatedTickets.length} tickets`);
    }

    return res.status(200).json({
      success: true,
      escalatedCount: escalatedTickets.length,
      escalatedTickets,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Escalation monitor error:', error);
    }
    return res.status(500).json({
      error: 'Failed to run escalation monitor',
    });
  }
}

async function sendEscalationNotification(ticket) {
  // Send notification logic here
  // This runs after the response is sent using waitUntil
  if (process.env.NODE_ENV === 'development') {
    console.log(`Sending escalation notification for ticket ${ticket.id}`);
  }
  
  // Example: Send email via Resend
  if (process.env.RESEND_API_KEY) {
    try {
      const ALLOWED_ORIGINS = [
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
        process.env.PUBLIC_APP_URL,
        process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null,
      ].filter(Boolean);

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.ALERT_FROM_EMAIL || 'alerts@example.com',
          to: process.env.ADMIN_EMAIL || 'admin@example.com',
          subject: `Ticket #${ticket.id} Escalated`,
          text: `Ticket "${ticket.title}" has been escalated due to no response within 24 hours.`,
        }),
      });
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to send escalation email:', err);
      }
    }
  }
}
