
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Security: Restrict CORS to allowed origins only
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://mtusmms.me',
]

const corsHeaders = (origin: string) => {
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
    }
}

// Helper to fetch the Admin's email from the database
async function getAdminEmail(supabase: any) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('email')
            .eq('role', 'admin')
            .limit(1)
            .single()

        if (error || !data?.email) {
            console.warn('[Escalation Monitor] Could not fetch admin email from DB. Using fallback.')
            // Use environment variable fallback instead of hardcoded email
            const fallbackEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@example.com'
            return fallbackEmail
        }

        return data.email
    } catch (err) {
        console.error('[Escalation Monitor] Error in getAdminEmail:', err)
        const fallbackEmail = Deno.env.get('ADMIN_EMAIL') || 'admin@example.com'
        return fallbackEmail
    }
}

// Email validation
const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders(req.headers.get('origin') || '') })
    }

    // Only allow POST
    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' }, status: 405 }
        )
    }

    try {
        // 1. Initialize Supabase Client
        // @ts-ignore
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        // @ts-ignore
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing Supabase configuration')
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // 2. Initialize EmailJS Config
        // @ts-ignore
        const SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID')
        // @ts-ignore
        const TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID')
        // @ts-ignore
        const USER_ID = Deno.env.get('EMAILJS_USER_ID')
        // @ts-ignore
        const ACCESS_TOKEN = Deno.env.get('EMAILJS_PRIVATE_KEY')

        if (!SERVICE_ID || !TEMPLATE_ID || !USER_ID || !ACCESS_TOKEN) {
            throw new Error('Missing EmailJS configuration')
        }

        // 3. Get Stale Tickets
        console.log('[Escalation Monitor] Checking for stale tickets...')
        
        // Note: You need to create the get_stale_tickets RPC function in Supabase
        const { data: staleTickets, error: rpcError } = await supabase.rpc('get_stale_tickets')

        if (rpcError) throw rpcError

        if (!staleTickets || staleTickets.length === 0) {
            console.log('[Escalation Monitor] No stale tickets found.')
            return new Response(JSON.stringify({ message: 'No escalations needed', count: 0 }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        console.log(`[Escalation Monitor] Found ${staleTickets.length} stale tickets. Processing...`)

        // 4. Get Admin Email (Dynamic)
        const recipientEmail = await getAdminEmail(supabase)
        
        // Validate admin email
        if (!validateEmail(recipientEmail)) {
            throw new Error('Invalid admin email address')
        }
        
        console.log(`[Escalation Monitor] Sending alerts to: ${recipientEmail}`)

        // 5. Loop and Escalate (max 10 at a time to prevent timeout)
        const results = []
        const maxEscalations = 10
        
        for (const ticket of staleTickets.slice(0, maxEscalations)) {
            try {
                // Validate ticket data
                if (!ticket.id || !ticket.title) {
                    console.warn('[Escalation Monitor] Skipping ticket with missing data')
                    continue
                }
                
                // Prepare EmailJS Payload
                const emailPayload = {
                    service_id: SERVICE_ID,
                    template_id: TEMPLATE_ID,
                    user_id: USER_ID,
                    accessToken: ACCESS_TOKEN,
                    template_params: {
                        to_email: recipientEmail,
                        subject: `URGENT ESCALATION: ${ticket.title}`,
                        message: `This ticket (ID: ${ticket.id}) has been ignored for over 4 hours.\n\nDetails:\nTitle: ${ticket.title}\nLocation: ${ticket.specific_location || 'Unknown'}\nPriority: ${ticket.priority}\nSubmitted: ${new Date(ticket.created_at).toLocaleString()}\n\nView Dashboard: [DASHBOARD_URL]`,
                        ticket_id: ticket.id
                    }
                }

                const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(emailPayload)
                })

                if (!emailRes.ok) {
                    const text = await emailRes.text()
                    throw new Error(`EmailJS failed: ${text}`)
                }

                results.push({ id: ticket.id, status: 'Escalated' })

            } catch (err: any) {
                console.error(`[Escalation Monitor] Failed to escalate ticket ${ticket.id}:`, err)
                results.push({ id: ticket.id, status: 'Failed', error: err.message })
            }
        }

        // 6. Return Summary
        return new Response(JSON.stringify({
            message: 'Escalation run complete',
            processed: results.length,
            details: results
        }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('[Escalation Monitor] Critical Error:', error)
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
