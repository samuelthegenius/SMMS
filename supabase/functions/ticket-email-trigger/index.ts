
import { serve } from "std/http/server.ts"
import { createClient } from '@supabase/supabase-js'

const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID')
const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID')
const EMAILJS_USER_ID = Deno.env.get('EMAILJS_USER_ID')
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const sendViaEmailJS = async (to_email: string, subject: string, message: string) => {
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
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EMAILJS_SERVICE_ID) {
            throw new Error('Missing configuration')
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // 1. Debug Logging
        const payload = await req.json()
        console.log("Webhook Payload:", JSON.stringify(payload))

        // 2. Robust Payload Extraction
        const record = payload.record || payload // Handle both { record: ... } and direct object
        const oldRecord = payload.old_record

        if (!record) {
            console.error("Invalid Payload Structure: Missing 'record'");
            return new Response(JSON.stringify({ error: 'Invalid Payload Structure' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            })
        }

        const emailsSent = [];

        // --- Scenario A: Status is 'Pending Verification' (Notify Reporter) ---
        if (record.status === 'Pending Verification') {

            // 3. Robust ID Detection
            const reporterId = record.created_by || record.user_id

            if (reporterId) {
                console.log(`Processing 'Pending Verification' for Reporter ID: ${reporterId}`);

                // Fetch Reporter Profile
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
                } else {
                    console.error('Profile query failed or no email:', profileError);
                }
            } else {
                console.error("No Reporter ID found in ticket data:", JSON.stringify(record));
            }
        }

        // --- Scenario B: Rejection Reason Present (Notify Admin) ---
        // Check if rejection_reason is present AND it's a new rejection (compared to oldRecord)
        const isNewRejection = record.rejection_reason && (!oldRecord || record.rejection_reason !== oldRecord.rejection_reason);

        if (isNewRejection) {
            console.log(`Processing 'Rejection' for Ticket #${record.id}`);

            // Fetch Admin Email
            // Function to get admin email (inline to avoid global scope issues if simple)
            const getAdminEmail = async () => {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('email')
                    .eq('role', 'admin')
                    .limit(1)
                    .single()
                return data?.email || 'admin@mtu.edu.ng';
            };

            const adminEmail = await getAdminEmail();
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
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        return new Response(JSON.stringify({ message: `Emails sent to: ${emailsSent.join(', ')}` }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error("Edge Function Error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
