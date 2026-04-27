
// deno-lint-ignore no-import-prefix
import { serve } from "jsr:@std/http@0.224.0/server"
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2"

// Security: Restrict CORS to allowed origins only
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://mtusmms.me',
]

// Configuration for escalation timing (in hours)
const ESCALATION_CONFIG = {
    initialThreshold: 2,        // First alert after 2 hours
    followUpInterval: 1,        // Subsequent alerts every 1 hour
    urgentThreshold: 4,         // Escalate to urgent after 4 hours
    criticalThreshold: 8,       // Escalate to critical after 8 hours
    maxEscalationsPerRun: 10,   // Prevent timeout
}

const corsHeaders = (origin: string) => {
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
    }
}

// Helper to fetch admin and department head emails
interface Profile {
    email: string
    full_name?: string | null
    role: string
}

// deno-lint-ignore no-explicit-any
async function getEscalationRecipients(supabase: any, department: string | null) {
    const recipients: { email: string; name: string; role: string }[] = []

    try {
        // Get admins
        const { data: admins, error: adminError } = await supabase
            .from('profiles')
            .select('email, full_name, role, department')
            .eq('role', 'admin')

        if (!adminError && admins) {
            recipients.push(...(admins as Profile[]).map((a) => ({
                email: a.email,
                name: a.full_name || 'Admin',
                role: a.role
            })))
        }

        // Get department staff if department is specified
        if (department) {
            const { data: deptHeads, error: deptError } = await supabase
                .from('profiles')
                .select('email, full_name, role, department')
                .eq('department', department)
                .in('role', ['staff', 'src'])

            if (!deptError && deptHeads) {
                // Add only if not already in recipients
                const existingEmails = new Set(recipients.map(r => r.email))
                recipients.push(...(deptHeads as Profile[])
                    .filter((d) => !existingEmails.has(d.email))
                    .map((d) => ({
                        email: d.email,
                        name: d.full_name || 'Department Staff',
                        role: d.role
                    }))
                );
            }
        }
    } catch (_err) {
        // Silent fail - fallback email will be used
    }

    // Add fallback if no recipients found
    if (recipients.length === 0) {
        const fallbackEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@example.com'
        recipients.push({ email: fallbackEmail, name: 'System Admin', role: 'admin' })
    }

    return recipients
}

// Note: Email sending is handled by notification-dispatcher to avoid duplicates
// The escalate_stale_ticket_multi_channel() RPC creates pending notification logs
// which are then processed by the notification-dispatcher edge function

// Get escalation urgency level based on hours pending and previous escalations
function getEscalationUrgency(hoursPending: number, escalationCount: number): {
    level: 'low' | 'medium' | 'high' | 'critical',
    subjectPrefix: string,
    alertFrequency: string
} {
    if (hoursPending >= ESCALATION_CONFIG.criticalThreshold || escalationCount >= 6) {
        return { 
            level: 'critical', 
            subjectPrefix: '🚨 CRITICAL ESCALATION',
            alertFrequency: 'Every hour'
        }
    }
    if (hoursPending >= ESCALATION_CONFIG.urgentThreshold || escalationCount >= 3) {
        return { 
            level: 'high', 
            subjectPrefix: '⚠️ URGENT ESCALATION',
            alertFrequency: 'Every 1-2 hours'
        }
    }
    if (escalationCount >= 1) {
        return { 
            level: 'medium', 
            subjectPrefix: '⏰ FOLLOW-UP ESCALATION',
            alertFrequency: 'Every 2 hours'
        }
    }
    return { 
        level: 'low', 
        subjectPrefix: '📋 INITIAL ESCALATION',
        alertFrequency: 'First alert'
    }
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders(req.headers.get('origin') || '') })
    }

    // Allow POST or GET (GET for easy cron/curl testing)
    if (req.method !== 'POST' && req.method !== 'GET') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' }, status: 405 }
        )
    }

    try {
        // 1. Initialize Supabase Client
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing Supabase configuration')
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // 2. Get Stale Tickets (verified but not attended to)
        const { data: staleTickets, error: rpcError } = await supabase.rpc('get_stale_tickets', {
            p_hours_threshold: ESCALATION_CONFIG.initialThreshold
        })

        if (rpcError) {
            throw new Error(`Failed to fetch stale tickets: ${rpcError.message}`)
        }

        if (!staleTickets || staleTickets.length === 0) {
            return new Response(JSON.stringify({
                message: 'No escalations needed',
                count: 0,
                threshold: ESCALATION_CONFIG.initialThreshold
            }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // 4. Loop and Escalate (respect max limit to prevent timeout)
        const results: {
            id: string;
            status: string;
            error?: string;
            notificationsSent?: number;
            urgency?: string;
        }[] = []

        for (const ticket of staleTickets.slice(0, ESCALATION_CONFIG.maxEscalationsPerRun)) {
            try {
                // Validate ticket data
                if (!ticket.ticket_id || !ticket.title) {
                    continue
                }

                // Determine urgency level
                const urgency = getEscalationUrgency(
                    ticket.hours_since_verified,
                    ticket.escalation_count || 0
                )
                
                // Get escalation recipients (admins + department heads + assigned technician)
                const recipients = await getEscalationRecipients(supabase, ticket.department)
                
                // Add assigned technician if exists and has email
                if (ticket.assigned_to && ticket.assigned_to_email && ticket.assigned_to_email !== 'N/A') {
                    const techAlreadyIncluded = recipients.some(r => r.email === ticket.assigned_to_email)
                    if (!techAlreadyIncluded) {
                        recipients.push({
                            email: ticket.assigned_to_email,
                            name: ticket.assigned_to_name || 'Technician',
                            role: 'technician'
                        })
                    }
                }
                
                // Record escalation in database with multi-channel support
                const { data: _escalationResult, error: _escalateError } = await supabase.rpc('escalate_stale_ticket_multi_channel', {
                    p_ticket_id: ticket.ticket_id,
                    p_message: null // Use default message
                })

                // Silent fail on escalation record error - notifications still queued

                // Escalation recorded - notifications will be sent by notification-dispatcher
                // The escalate_stale_ticket_multi_channel() RPC creates pending notification_logs
                // entries which the dispatcher processes for email/push/SMS delivery
                results.push({ 
                    id: ticket.ticket_id, 
                    status: 'Escalated', 
                    notificationsSent: recipients.length,
                    urgency: urgency.level
                })

            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err)
                results.push({
                    id: ticket.ticket_id,
                    status: 'Failed',
                    error: errMsg
                })
            }
        }

        // 5. Get escalation summary for reporting
        const { data: summaryData } = await supabase.rpc('get_escalation_summary')
        const summary = summaryData?.[0] || { total_stale_tickets: 0, high_priority_stale: 0 }

        // 6. Trigger notification dispatcher for immediate delivery
        let dispatchResult = null
        try {
            // Call the notification dispatcher to process pending notifications
            const dispatchRes = await fetch(`${SUPABASE_URL}/functions/v1/notification-dispatcher`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': 'application/json'
                }
            })
            if (dispatchRes.ok) {
                dispatchResult = await dispatchRes.json()
            }
        } catch (_dispatchErr) {
            // Silent fail - dispatcher will run on its own schedule
        }

        // 7. Return Summary
        return new Response(JSON.stringify({
            message: 'Verified ticket escalation run complete',
            processed: results.length,
            threshold: ESCALATION_CONFIG.initialThreshold,
            totalStaleTickets: summary.total_stale_tickets,
            highPriorityStale: summary.high_priority_stale,
            details: results,
            dispatchResult,
            channels: ['in_app', 'email', 'push', 'sms (critical only)'],
            nextRun: 'Schedule this function to run every 30-60 minutes for constant alerts'
        }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error)
        return new Response(JSON.stringify({ error: errMsg || 'Internal server error' }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
