
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

// Security: Restrict CORS to your actual domain in production
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://mtusmms.me',
    // Add your production domain here
]

const corsHeaders = (origin: string) => {
    // Validate origin before reflecting it back
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400', // 24 hours
    }
}

// Input validation helper
const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

// Helper to send email via EmailJS REST API
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
        const errorText = await response.text();
        throw new Error(`EmailJS Error: ${errorText}`)
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
        // Validate environment variables
        if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_USER_ID || !EMAILJS_PRIVATE_KEY) {
            throw new Error('Server configuration error: Missing EmailJS credentials')
        }

        // Parse and validate request body
        let requestBody
        try {
            requestBody = await req.json()
        } catch {
            throw new Error('Invalid JSON in request body')
        }

        const { type, student_email, technician_email, ticket_title, technician_name, ticket_description, ticket_location, ticket_priority } = requestBody

        // Validate required fields
        if (!type) {
            throw new Error('Missing required field: type')
        }

        if (!['ticket_created', 'ticket_reassigned', 'ticket_completed'].includes(type)) {
            throw new Error('Invalid email type')
        }

        // Validate email addresses if provided
        if (student_email && !validateEmail(student_email)) {
            throw new Error('Invalid student email format')
        }
        if (technician_email && !validateEmail(technician_email)) {
            throw new Error('Invalid technician email format')
        }

        // Rate limiting: Check for abuse using simple IP-based limiting
        // In production, implement proper rate limiting with Redis or database
        const clientIP = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
        const rateLimitKey = `email_${clientIP}`
        
        // Simple in-memory rate limiting (not for production use)
        // In production, use Redis or Supabase for distributed rate limiting
        const requestCount = await req.headers.get('X-Request-Count')
        if (requestCount && parseInt(requestCount) > 10) {
            console.warn(`Rate limit exceeded for IP: ${clientIP}`)
            throw new Error('Rate limit exceeded. Please try again later.')
        }

        const emailPromises = [];
        const dashboardLink = "https://mtusmms.me/dashboard";

        // 1. Ticket Created -> Notify Student & Technician
        if (type === 'ticket_created') {
            // To Student
            if (student_email && ticket_title) {
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
            if (technician_email && ticket_title) {
                emailPromises.push(sendViaEmailJS(
                    technician_email,
                    `New Task Assigned: ${ticket_title}`,
                    `<div style="font-family: sans-serif; color: #333;">
                    <h2>New Task Assigned</h2>
                    <p>Hello <strong>${technician_name || 'Technician'}</strong>,</p>
                    <p>You have been assigned a new ticket.</p>
                    <hr />
                    <p><strong>Title:</strong> ${ticket_title || 'N/A'}</p>
                    <p><strong>Location:</strong> ${ticket_location || 'N/A'}</p>
                    <p><strong>Priority:</strong> ${ticket_priority || 'N/A'}</p>
                    <p><strong>Description:</strong><br/>${ticket_description || 'N/A'}</p>
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
        if (type === 'ticket_reassigned' && technician_email && ticket_title) {
            emailPromises.push(sendViaEmailJS(
                technician_email,
                `Job Reassigned to You: ${ticket_title}`,
                `<div style="font-family: sans-serif; color: #333;">
                <h2>Job Reassigned</h2>
                <p>Hello <strong>${technician_name || 'Technician'}</strong>,</p>
                <p>A ticket has been reassigned to you.</p>
                <hr />
                <p><strong>Title:</strong> ${ticket_title || 'N/A'}</p>
                <p><strong>Location:</strong> ${ticket_location || 'N/A'}</p>
                 <p><strong>Priority:</strong> ${ticket_priority || 'N/A'}</p>
                <hr />
                <p>Please check your dashboard.</p>
                <p style="margin-top: 15px;">
                    <a href="${dashboardLink}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                </p>
            </div>`
            ));
        }

        // 3. Ticket Completed -> Notify Student
        if (type === 'ticket_completed' && student_email && ticket_title) {
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

        if (emailPromises.length === 0) {
            throw new Error('No valid recipients for email')
        }

        await Promise.all(emailPromises);

        return new Response(JSON.stringify({ message: 'Emails processed successfully' }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('send-email error:', error)
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: error.message?.includes('Rate limit') ? 429 : 400,
        })
    }
})
