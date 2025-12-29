
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to fetch the Admin's email from the database
async function getAdminEmail(supabase: any) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('email')
            .eq('role', 'admin') // Adjust 'admin' if your role name is different (e.g., 'super_admin')
            .limit(1)
            .single()

        if (error || !data?.email) {
            console.warn('[Escalation Monitor] Could not fetch admin email from DB. Using fallback.')
            return 'admin@mtu.edu.ng' // Fallback
        }

        return data.email
    } catch (err) {
        console.error('[Escalation Monitor] Error in getAdminEmail:', err)
        return 'admin@mtu.edu.ng' // Fallback
    }
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
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
        const ACCESS_TOKEN = Deno.env.get('EMAILJS_PRIVATE_KEY') // Using Private Key as Access Token for V1 API

        if (!SERVICE_ID || !TEMPLATE_ID || !USER_ID || !ACCESS_TOKEN) {
            throw new Error('Missing EmailJS configuration')
        }

        // 3. Get Stale Tickets
        console.log('[Escalation Monitor] Checking for stale tickets...')
        const { data: staleTickets, error: rpcError } = await supabase.rpc('get_stale_tickets')

        if (rpcError) throw rpcError

        if (!staleTickets || staleTickets.length === 0) {
            console.log('[Escalation Monitor] No stale tickets found.')
            return new Response(JSON.stringify({ message: 'No escalations needed', count: 0 }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        console.log(`[Escalation Monitor] Found ${staleTickets.length} stale tickets. Processing...`)

        console.log(`[Escalation Monitor] Found ${staleTickets.length} stale tickets. Processing...`)

        // 4. Get Admin Email (Dynamic)
        const recipientEmail = await getAdminEmail(supabase)
        console.log(`[Escalation Monitor] Sending alerts to: ${recipientEmail}`)

        // 5. Loop and Escalate
        const results = []
        for (const ticket of staleTickets) {
            try {
                // Prepare EmailJS Payload
                const emailPayload = {
                    service_id: SERVICE_ID,
                    template_id: TEMPLATE_ID,
                    user_id: USER_ID,
                    accessToken: ACCESS_TOKEN,
                    template_params: {
                        to_email: recipientEmail,
                        subject: `URGENT ESCALATION: ${ticket.title}`,
                        message: `This ticket (ID: ${ticket.id}) has been ignored for over 4 hours.\n\nDetails:\nTitle: ${ticket.title}\nLocation: ${ticket.specific_location || 'Unknown'}\nPriority: ${ticket.priority}\nSubmitted: ${new Date(ticket.created_at).toLocaleString()}`,
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

        // 5. Return Summary
        return new Response(JSON.stringify({
            message: 'Escalation run complete',
            processed: results.length,
            details: results
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('[Escalation Monitor] Critical Error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
