// deno-lint-ignore no-import-prefix
import { serve } from "jsr:@std/http@0.224.0/server"
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2"

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
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    }
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders(req.headers.get('origin') || '') })
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' }, status: 405 }
        )
    }

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing Supabase configuration')
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // 1. Fetch tickets pending verification for more than 3 days
        const threeDaysAgo = new Date()
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)

        const { data: staleTickets, error: fetchError } = await supabase
            .from('tickets')
            .select('id, created_by, title')
            .eq('status', 'Pending Verification')
            .lt('updated_at', threeDaysAgo.toISOString())

        if (fetchError) {
            throw new Error(`Failed to fetch stale tickets: ${fetchError.message}`)
        }

        if (!staleTickets || staleTickets.length === 0) {
            return new Response(JSON.stringify({
                message: 'No tickets require auto-closing',
                count: 0
            }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        const results = []

        // 2. Loop and auto-close
        for (const ticket of staleTickets) {
            try {
                // Update ticket status to Closed
                const { error: updateError } = await supabase
                    .from('tickets')
                    .update({ 
                        status: 'Closed',
                        satisfaction_status: 'satisfied', // Implicitly satisfied since they didn't object
                        rating: 5, // Default 5 stars or null? Let's leave rating as null or 5. Let's use 5.
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', ticket.id)

                if (updateError) throw updateError

                // Insert notification for the user
                const { error: notifyError } = await supabase
                    .from('notifications')
                    .insert({
                        user_id: ticket.created_by,
                        ticket_id: ticket.id,
                        message: `Your ticket "${ticket.title}" has been automatically closed after 3 days of pending verification.`
                    })

                if (notifyError) console.error('Failed to notify auto-close:', notifyError)

                results.push({ id: ticket.id, status: 'Closed' })
            } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err)
                results.push({ id: ticket.id, status: 'Failed', error: errMsg })
            }
        }

        return new Response(JSON.stringify({
            message: 'Auto-close run complete',
            processed: results.length,
            details: results
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
