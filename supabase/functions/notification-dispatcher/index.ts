
// deno-lint-ignore no-import-prefix
import { serve } from "jsr:@std/http@0.224.0/server"
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2"

// Web Push library for VAPID-based push notifications
// Using web-push library compatible with Deno
const webPush = {
    async sendNotification(
        subscription: PushSubscriptionJSON,
        payload: string,
        options: { vapidDetails: { subject: string; publicKey: string; privateKey: string } }
    ) {
        const { vapidDetails } = options
        
        // Create JWT for VAPID authentication
        const header = { typ: 'JWT', alg: 'ES256' }
        const now = Math.floor(Date.now() / 1000)
        const body = {
            aud: new URL(subscription.endpoint).origin,
            exp: now + 86400, // 24 hours
            sub: vapidDetails.subject
        }
        
        // Import private key for signing
        const privateKeyData = base64UrlToUint8Array(vapidDetails.privateKey)
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            privateKeyData.buffer as ArrayBuffer,
            { name: 'ECDSA', namedCurve: 'P-256' },
            false,
            ['sign']
        )
        
        // Sign JWT
        const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
        const bodyB64 = btoa(JSON.stringify(body)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
        const signatureInput = new TextEncoder().encode(`${headerB64}.${bodyB64}`)
        const signature = await crypto.subtle.sign('ECDSA', cryptoKey, signatureInput)
        const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
            .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
        
        const vapidToken = `${headerB64}.${bodyB64}.${signatureB64}`
        
        // Send the push notification
        const response = await fetch(subscription.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/octet-stream',
                'Authorization': `vapid t=${vapidToken}, k=${vapidDetails.publicKey}`,
                'TTL': '86400'
            },
            body: new TextEncoder().encode(payload)
        })
        
        if (!response.ok && response.status !== 201) {
            throw new Error(`Push failed: ${response.status} ${await response.text()}`)
        }
        
        return response
    }
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - base64Url.length % 4) % 4)
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

interface PushSubscriptionJSON {
    endpoint: string
    expirationTime?: number | null
    keys: {
        p256dh: string
        auth: string
    }
}

// Configuration
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

// EmailJS Configuration
const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID')
const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID')
const EMAILJS_USER_ID = Deno.env.get('EMAILJS_USER_ID')
const EMAILJS_PRIVATE_KEY = Deno.env.get('EMAILJS_PRIVATE_KEY')

// VAPID keys for push notifications
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@mtusmms.me'

// SMS Provider (e.g., Twilio)
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders(req.headers.get('origin') || '') })
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' }, status: 405 }
        )
    }

    try {
        // Initialize Supabase Client
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing Supabase configuration')
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        const results = {
            email: { processed: 0, failed: 0, errors: [] as string[] },
            push: { processed: 0, failed: 0, errors: [] as string[] },
            sms: { processed: 0, failed: 0, errors: [] as string[] }
        }

        // 1. Process Email Notifications
        console.log('[Notification Dispatcher] EmailJS config check:', {
            hasServiceId: !!EMAILJS_SERVICE_ID,
            hasTemplateId: !!EMAILJS_TEMPLATE_ID,
            hasUserId: !!EMAILJS_USER_ID,
            hasPrivateKey: !!EMAILJS_PRIVATE_KEY
        })

        // Helper function to extract urgency info from message and build styled email
        function buildEscalationEmail(message: string, ticketId: string): { subject: string; html: string } {
            // Parse urgency from message format: "🚨 CRITICAL ESCALATION #3: \"title\" at location • X.X hours pending • PRIORITY priority"
            const urgencyMatch = message.match(/^(🚨|⚠️|⏰|📋)\s*(CRITICAL|URGENT|FOLLOW-UP|INITIAL)\s*ESCALATION\s*#(\d+):\s*"([^"]+)"\s*at\s*([^•]+)\s*•\s*([\d.]+)\s*hours\s*pending\s*•\s*(HIGH|MEDIUM|NORMAL)\s*priority/i)
            
            if (!urgencyMatch) {
                // Fallback for legacy messages
                return {
                    subject: `SMMS: ${message.substring(0, 60)}...`,
                    html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #DC2626; margin: 0 0 16px 0;">SMMS Escalation Alert</h2>
                        <p style="font-size: 16px; line-height: 1.5; color: #374151;">${message}</p>
                        <a href="${Deno.env.get('DASHBOARD_URL') || 'https://mtusmms.me'}/ticket/${ticketId}" 
                           style="display: inline-block; background: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px;">
                            View Ticket
                        </a>
                    </div>`
                }
            }
            
            const [, icon, level, escalationNum, title, location, hours, priority] = urgencyMatch
            
            // Color scheme based on urgency
            const colors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
                'CRITICAL': { bg: '#FEF2F2', border: '#DC2626', text: '#991B1B', badge: '#DC2626' },
                'URGENT': { bg: '#FFF7ED', border: '#EA580C', text: '#9A3412', badge: '#EA580C' },
                'FOLLOW-UP': { bg: '#FFFBEB', border: '#D97706', text: '#92400E', badge: '#D97706' },
                'INITIAL': { bg: '#ECFDF5', border: '#059669', text: '#065F46', badge: '#059669' }
            }
            
            const scheme = colors[level] || colors['INITIAL']
            const priorityBadgeColor = priority === 'HIGH' ? '#DC2626' : priority === 'MEDIUM' ? '#D97706' : '#059669'
            
            const dashboardUrl = Deno.env.get('DASHBOARD_URL') || 'https://mtusmms.me'
            
            return {
                subject: `${icon} ${level}: Ticket #${ticketId?.slice(0, 8)} Requires Immediate Attention`,
                html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 32px 24px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">🏛️ MTU SMMS</h1>
                        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Maintenance Management System</p>
                    </div>
                    
                    <!-- Alert Banner -->
                    <div style="background: ${scheme.bg}; border-left: 4px solid ${scheme.border}; padding: 20px 24px; margin: 24px;">
                        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                            <span style="font-size: 32px;">${icon}</span>
                            <div>
                                <p style="margin: 0; color: ${scheme.text}; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${level} ESCALATION</p>
                                <p style="margin: 4px 0 0 0; color: ${scheme.text}; font-size: 20px; font-weight: 700;">Escalation #${escalationNum}</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Ticket Details -->
                    <div style="padding: 0 24px 24px 24px;">
                        <div style="background: #F9FAFB; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                            <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #111827; line-height: 1.4;">${title}</h2>
                            
                            <div style="display: grid; gap: 12px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #E5E7EB;">
                                    <span style="color: #6B7280; font-size: 14px;">📍 Location</span>
                                    <span style="color: #111827; font-weight: 500; font-size: 14px;">${location.trim()}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #E5E7EB;">
                                    <span style="color: #6B7280; font-size: 14px;">⏱️ Hours Pending</span>
                                    <span style="color: ${hours >= '8' ? '#DC2626' : hours >= '4' ? '#EA580C' : '#D97706'}; font-weight: 700; font-size: 14px;">${hours} hours</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
                                    <span style="color: #6B7280; font-size: 14px;">🎯 Priority</span>
                                    <span style="background: ${priorityBadgeColor}; color: white; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase;">${priority}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Action Button -->
                        <a href="${dashboardUrl}/ticket/${ticketId}" 
                           style="display: block; background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: white; padding: 16px 28px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; text-align: center; margin-bottom: 16px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
                            🔧 View & Resolve Ticket
                        </a>
                        
                        <!-- Footer -->
                        <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin: 0;">
                            This is an automated escalation from the Maintenance Management System.<br>
                            Ticket ID: ${ticketId}
                        </p>
                    </div>
                </div>`
            }
        }

        if (EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID && EMAILJS_USER_ID && EMAILJS_PRIVATE_KEY) {
            const { data: pendingEmails, error: emailFetchError } = await supabase.rpc('get_pending_notifications', {
                p_channel: 'email',
                p_limit: 20
            })

            console.log('[Notification Dispatcher] Email query result:', {
                pendingCount: pendingEmails?.length || 0,
                error: emailFetchError?.message || null
            })

            if (!emailFetchError && pendingEmails && pendingEmails.length > 0) {
                for (const notification of pendingEmails) {
                    try {
                        const { subject, html } = buildEscalationEmail(notification.message, notification.ticket_id)
                        
                        const emailPayload = {
                            service_id: EMAILJS_SERVICE_ID,
                            template_id: EMAILJS_TEMPLATE_ID,
                            user_id: EMAILJS_USER_ID,
                            accessToken: EMAILJS_PRIVATE_KEY,
                            template_params: {
                                to_email: notification.user_email,
                                subject: subject,
                                message: html,
                                ticket_id: notification.ticket_id
                            }
                        }

                        const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(emailPayload)
                        })

                        if (emailRes.ok) {
                            await supabase.rpc('update_notification_status', {
                                p_log_id: notification.log_id,
                                p_status: 'sent'
                            })
                            results.email.processed++
                        } else {
                            const errorText = await emailRes.text()
                            throw new Error(`EmailJS failed: ${errorText}`)
                        }
                    } catch (err: unknown) {
                        const errMsg = err instanceof Error ? err.message : String(err)
                        await supabase.rpc('update_notification_status', {
                            p_log_id: notification.log_id,
                            p_status: 'failed',
                            p_error_message: errMsg
                        })
                        results.email.failed++
                        results.email.errors.push(`Notification ${notification.log_id}: ${errMsg}`)
                    }
                }
            }
        }

        // 2. Process Push Notifications with VAPID
        if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
            const { data: pendingPushes, error: pushFetchError } = await supabase.rpc('get_pending_notifications', {
                p_channel: 'push',
                p_limit: 20
            })

            if (!pushFetchError && pendingPushes && pendingPushes.length > 0) {
                for (const notification of pendingPushes) {
                    try {
                        const subscription = notification.metadata?.subscription as PushSubscriptionJSON | undefined
                        
                        if (!subscription || !subscription.endpoint || !subscription.keys) {
                            throw new Error('Invalid push subscription data')
                        }

                        // Parse urgency from message for better push title
                        const urgencyMatch = notification.message.match(/^(🚨|⚠️|⏰|📋)\s*(CRITICAL|URGENT|FOLLOW-UP|INITIAL)/)
                        const icon = urgencyMatch?.[1] || '🔔'
                        const level = urgencyMatch?.[2] || 'ESCALATION'
                        const ticketMatch = notification.message.match(/"([^"]+)"/) 
                        const ticketTitle = ticketMatch ? ticketMatch[1].substring(0, 40) : 'Ticket'
                        
                        // Truncate message for push (max ~100 chars for visibility)
                        const shortMessage = notification.message.length > 90 
                            ? notification.message.substring(0, 87) + '...' 
                            : notification.message

                        // Create push payload with urgency-based styling
                        const pushPayload = JSON.stringify({
                            title: `${icon} ${level}: ${ticketTitle}`,
                            body: shortMessage,
                            icon: '/apple-touch-icon.png',
                            badge: '/favicon.ico',
                            tag: `escalation-${notification.ticket_id}`,
                            requireInteraction: true,
                            data: {
                                ticketId: notification.ticket_id,
                                notificationId: notification.log_id,
                                dashboard: true,
                                urgency: level
                            },
                            actions: [
                                { action: 'view', title: '🔧 View' },
                                { action: 'dismiss', title: 'Dismiss' }
                            ]
                        })

                        // Send using VAPID
                        await webPush.sendNotification(
                            subscription,
                            pushPayload,
                            {
                                vapidDetails: {
                                    subject: VAPID_SUBJECT,
                                    publicKey: VAPID_PUBLIC_KEY,
                                    privateKey: VAPID_PRIVATE_KEY
                                }
                            }
                        )

                        await supabase.rpc('update_notification_status', {
                            p_log_id: notification.log_id,
                            p_status: 'sent'
                        })
                        results.push.processed++

                    } catch (err: unknown) {
                        const errorMessage = err instanceof Error ? err.message : String(err)
                        
                        // Check if subscription is expired (Gone)
                        if (errorMessage.includes('410') || errorMessage.includes('Gone')) {
                            // Mark subscription as inactive
                            const sub = notification.metadata?.subscription as PushSubscriptionJSON | undefined
                            if (sub?.endpoint) {
                                await supabase
                                    .from('push_subscriptions')
                                    .update({ is_active: false })
                                    .eq('user_id', notification.user_id)
                                    .ilike('subscription_json->>endpoint', `%${sub.endpoint.slice(-50)}%`)
                            }
                        }
                        
                        await supabase.rpc('update_notification_status', {
                            p_log_id: notification.log_id,
                            p_status: 'failed',
                            p_error_message: errorMessage
                        })
                        results.push.failed++
                        results.push.errors.push(`Notification ${notification.log_id}: ${errorMessage}`)
                    }
                }
            }
        }

        // 3. Process SMS Notifications (for critical alerts only)
        if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
            const { data: pendingSMS, error: smsFetchError } = await supabase.rpc('get_pending_notifications', {
                p_channel: 'sms',
                p_limit: 10
            })

            if (!smsFetchError && pendingSMS && pendingSMS.length > 0) {
                for (const notification of pendingSMS) {
                    try {
                        const phoneNumber = notification.metadata?.phone
                        
                        if (!phoneNumber) {
                            throw new Error('No phone number found')
                        }

                        // Parse urgency and build concise SMS
                        const urgencyMatch = notification.message.match(/^(🚨|⚠️|⏰|📋)\s*(CRITICAL|URGENT)/)
                        const isCritical = !!urgencyMatch
                        const ticketMatch = notification.message.match(/"([^"]+)"/) 
                        const ticketTitle = ticketMatch ? ticketMatch[1].substring(0, 30) : 'Ticket'
                        const hoursMatch = notification.message.match(/([\d.]+)\s*hours/)
                        const hoursPending = hoursMatch ? hoursMatch[1] : '?'
                        
                        // Build SMS with urgency indicator and short link placeholder
                        const baseMsg = isCritical 
                            ? `🚨CRITICAL: "${ticketTitle}" pending ${hoursPending}h. `
                            : `⏰Escalation: "${ticketTitle}" pending ${hoursPending}h. `
                        const dashboardUrl = `${Deno.env.get('DASHBOARD_URL') || 'https://mtusmms.me'}/ticket/${notification.ticket_id}`
                        const smsMessage = baseMsg + `View: ${dashboardUrl}`

                        // Send SMS via Twilio
                        const twilioRes = await fetch(
                            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
                            {
                                method: 'POST',
                                headers: {
                                    'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
                                    'Content-Type': 'application/x-www-form-urlencoded'
                                },
                                body: new URLSearchParams({
                                    To: phoneNumber,
                                    From: TWILIO_PHONE_NUMBER,
                                    Body: smsMessage
                                })
                            }
                        )

                        if (twilioRes.ok) {
                            await supabase.rpc('update_notification_status', {
                                p_log_id: notification.log_id,
                                p_status: 'sent'
                            })
                            results.sms.processed++
                        } else {
                            const errorData = await twilioRes.json()
                            throw new Error(`Twilio error: ${errorData.message || 'Unknown error'}`)
                        }
                    } catch (err: unknown) {
                        const errMsg = err instanceof Error ? err.message : String(err)
                        await supabase.rpc('update_notification_status', {
                            p_log_id: notification.log_id,
                            p_status: 'failed',
                            p_error_message: errMsg
                        })
                        results.sms.failed++
                        results.sms.errors.push(`Notification ${notification.log_id}: ${errMsg}`)
                    }
                }
            }
        }

        return new Response(JSON.stringify({
            message: 'Notification dispatch complete',
            results,
            timestamp: new Date().toISOString()
        }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error('[Notification Dispatcher] Critical Error:', error)
        return new Response(JSON.stringify({ error: errMsg || 'Internal server error' }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
