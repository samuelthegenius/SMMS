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

const corsHeaders = (origin: string) => {
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
    }
}

const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID')
const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID')
const EMAILJS_USER_ID = Deno.env.get('EMAILJS_USER_ID')
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Email validation
const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

const sendViaEmailJS = async (to_email: string, subject: string, message: string) => {
    // Validate email before sending
    if (!validateEmail(to_email)) {
        throw new Error(`Invalid email address: ${to_email}`)
    }

    const payload = {
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_USER_ID,
        accessToken: EMAILJS_PRIVATE_KEY,
        template_params: {
            to_email: to_email,
            subject: subject,
            message: message
        }
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }
};

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
        // Validate configuration
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EMAILJS_SERVICE_ID) {
            throw new Error('Missing configuration')
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        const payload = await req.json()

        // Robust Payload Extraction
        const record = payload.record || payload
        const oldRecord = payload.old_record

        if (!record) {
            return new Response(JSON.stringify({ error: 'Invalid Payload Structure' }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const emailsSent = [];

        // --- Scenario A: Status is 'Pending Verification' (Notify Reporter) ---
        if (record.status === 'Pending Verification') {
            // 3. Robust ID Detection
            const reporterId = record.created_by || record.user_id

            if (reporterId) {
                // Fetch Reporter Profile (only fetch needed fields)
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('email, full_name')
                    .eq('id', reporterId)
                    .single();

                if (!profileError && profile && profile.email) {
                    const reporterName = profile.full_name || 'User';
                    const emailSubject = `Action Required: Verify Repair for Ticket #${record.id}`;
                    const dashboardLink = "https://mtusmms.me/dashboard";

                    const emailBody = `
                        <div style="font-family: sans-serif; color: #333;">
                            <h2>Verify Repair</h2>
                            <p>Hello <strong>${reporterName}</strong>,</p>
                            <p>The technician has marked your request at <strong>${record.specific_location}</strong> as resolved.</p>
                            <p>Please log in to the portal to confirm the fix or report an issue.</p>
                            <p style="margin-top: 20px;">
                                <a href="${dashboardLink}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                            </p>
                        </div>
                    `;

                    await sendViaEmailJS(profile.email, emailSubject, emailBody);
                    emailsSent.push(`Reporter (${profile.email})`);
                }
            }
        }

        // --- Scenario B: Rejection Reason Present (Notify Admin) ---
        const isNewRejection = record.rejection_reason && (!oldRecord || record.rejection_reason !== oldRecord.rejection_reason);

        if (isNewRejection) {
            // Fetch Admin Email
            const getAdminEmail = async () => {
                const { data, error: _error } = await supabase
                    .from('profiles')
                    .select('email')
                    .eq('role', 'admin')
                    .limit(1)
                    .single()
                return data?.email || 'admin@mtu.edu.ng';
            };

            const adminEmail = await getAdminEmail();
            
            // Validate admin email
            if (!validateEmail(adminEmail)) {
                throw new Error('Invalid admin email address')
            }
            
            const emailSubject = `ALERT: Repair Rejected for Ticket #${record.id}`;
            const dashboardLink = "https://mtusmms.me/dashboard";

            const emailBody = `
                <div style="font-family: sans-serif; color: #333;">
                    <h2 style="color: #d93025;">Repair Rejected</h2>
                    <p><strong>URGENT:</strong> A user has rejected a repair.</p>
                    <hr />
                    <p><strong>Ticket ID:</strong> #${record.id}</p>
                    <p><strong>Location:</strong> ${record.specific_location}</p>
                    <p><strong>Rejection Reason:</strong><br/>
                    <em>"${record.rejection_reason}"</em></p>
                    <hr />
                    <p>Please investigate immediately.</p>
                    <p style="margin-top: 20px;">
                        <a href="${dashboardLink}" style="background-color: #d93025; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Open Admin Dashboard</a>
                    </p>
                </div>
            `;

            await sendViaEmailJS(adminEmail, emailSubject, emailBody);
            emailsSent.push(`Admin (${adminEmail})`);
        }

        if (emailsSent.length === 0) {
            return new Response(JSON.stringify({ message: 'No email conditions met' }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        return new Response(JSON.stringify({ message: `Emails sent to: ${emailsSent.join(', ')}` }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error)
        return new Response(JSON.stringify({ error: errMsg || 'Internal server error' }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
