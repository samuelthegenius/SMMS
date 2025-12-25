/**
 * @file api/send-email.js
 * @description Serverless Function to handle transactional email delivery.
 * 
 * Key Features:
 * - Resend Integration: Uses the Resend API for reliable email transport.
 * - Secure Env Vars: Accesses process.env for API keys, keeping secrets out of the codebase.
 * - Error Handling: Provides structured JSON responses for success and failure states.
 */
import { Resend } from 'resend';

// Initializing the Resend client with the secure API key.
// Note: We use VITE_ prefix if configured via client-side env, but in standard Vercel functions, 
// standard env vars are preferred. Current setup respects the user's provided config name.
const resend = new Resend(process.env.VITE_RESEND_API_KEY);

export default async function handler(req, res) {
    // Extract destructuring with validation implicitly handled by the Resend call,
    // though explicit validation could be added for robustness.
    const { to, subject, html } = req.body;

    try {
        // Asynchronous email dispatch using the Resend SDK.
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev', // Default sender for testing domain
            to,
            subject,
            html,
        });

        // Conditional Error Handling:
        // If the upstream provider returns an error, we propagate a 400 Bad Request
        // rather than crashing the server.
        if (error) {
            return res.status(400).json({ error });
        }

        res.status(200).json(data);
    } catch (error) {
        // Catch-all for network or runtime errors, returning 500 Internal Server Error.
        res.status(500).json({ error: error.message });
    }
}
