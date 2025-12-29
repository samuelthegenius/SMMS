
// @ts-ignore: Deno URL imports are not resolved by standard VS Code extension
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// @ts-ignore: Deno namespace
const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID')
// @ts-ignore: Deno namespace
const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID')
// @ts-ignore: Deno namespace
const EMAILJS_USER_ID = Deno.env.get('EMAILJS_USER_ID') // Public Key
// @ts-ignore: Deno namespace
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY') // Private Key

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper to send email via EmailJS REST API
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
            // Note: Your EmailJS template must use {{to_email}}, {{subject}}, and {{message}} variables
        }
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`EmailJS Error: ${errorText}`);
    }
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_USER_ID || !EMAILJS_PRIVATE_KEY) {
            throw new Error('Missing EmailJS environment variables')
        }

        const { type, student_email, technician_email, ticket_title, technician_name, ticket_description, ticket_location, ticket_priority } = await req.json()

        const emailPromises = [];
        const dashboardLink = "https://mtusmms.me/dashboard";

        // 1. Ticket Created -> Notify Student & Technician
        if (type === 'ticket_created') {
            // To Student
            if (student_email) {
                emailPromises.push(sendViaEmailJS(
                    student_email,
                    `Ticket Received: ${ticket_title}`,
                    `<p>Hello,</p>
                     <p>We received your report regarding <strong>${ticket_title}</strong>.</p>
                     <p>A technician will be assigned shortly.</p>
                     <p><a href="${dashboardLink}">View Dashboard</a></p>`
                ));
            }
            // To Technician (if assigned immediately)
            if (technician_email) {
                emailPromises.push(sendViaEmailJS(
                    technician_email,
                    `New Task Assigned: ${ticket_title}`,
                    `<div style="font-family: sans-serif; color: #333;">
                    <h2>New Task Assigned</h2>
                    <p>Hello <strong>${technician_name || 'Technician'}</strong>,</p>
                    <p>You have been assigned a new ticket.</p>
                    <hr />
                    <p><strong>Title:</strong> ${ticket_title}</p>
                    <p><strong>Location:</strong> ${ticket_location}</p>
                    <p><strong>Priority:</strong> ${ticket_priority}</p>
                    <p><strong>Description:</strong><br/>${ticket_description}</p>
                    <hr />
                    <p>Please log in to your dashboard to "Accept" or "Resolve" this task.</p>
                    <p style="margin-top: 15px;">
                        <a href="${dashboardLink}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                    </p>
                </div>`
                ));
            }
        }

        // 2. Ticket Reassigned -> Notify New Technician
        if (type === 'ticket_reassigned' && technician_email) {
            emailPromises.push(sendViaEmailJS(
                technician_email,
                `Job Reassigned to You: ${ticket_title}`,
                `<div style="font-family: sans-serif; color: #333;">
                <h2>Job Reassigned</h2>
                <p>Hello <strong>${technician_name || 'Technician'}</strong>,</p>
                <p>A ticket has been reassigned to you.</p>
                <hr />
                <p><strong>Title:</strong> ${ticket_title}</p>
                <p><strong>Location:</strong> ${ticket_location}</p>
                 <p><strong>Priority:</strong> ${ticket_priority}</p>
                <hr />
                <p>Please check your dashboard.</p>
                <p style="margin-top: 15px;">
                    <a href="${dashboardLink}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                </p>
            </div>`
            ));
        }

        // 3. Ticket Completed -> Notify Student
        if (type === 'ticket_completed' && student_email) {
            emailPromises.push(sendViaEmailJS(
                student_email,
                `Ticket Resolved: ${ticket_title}`,
                `<div style="font-family: sans-serif; color: #333;">
                <h2>Good news!</h2>
                <p>Your ticket <strong>${ticket_title}</strong> has been marked as <strong>Resolved</strong>.</p>
                <p>Our technician has completed the work.</p>
                <hr />
                <p>If the issue persists, please open a new ticket or contact support.</p>
                <p>Thank you for using Smart Maintenance.</p>
                <p><a href="${dashboardLink}">View Dashboard</a></p>
            </div>`
            ));
        }

        await Promise.all(emailPromises);

        return new Response(JSON.stringify({ message: 'Emails processed' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error(error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
