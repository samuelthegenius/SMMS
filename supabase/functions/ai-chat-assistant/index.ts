// deno-lint-ignore no-import-prefix
import { serve } from "jsr:@std/http@0.224.0/server"
// deno-lint-ignore no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2"

// Security: Restrict CORS to your actual domain
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://mtusmms.me',
    'https://www.mtusmms.me',
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

// Input sanitization
const sanitizeInput = (input: string): string => {
    if (!input) return ''
    return input
        .replace(/ignore previous|system prompt|you are/gi, '')
        .replace(/[<>]/g, '')
        .substring(0, 3000)
}

// AI Assistant System Prompt
interface TicketContext {
    ticket_id: string | number
    title: string
    category: string
    priority: string
    location: string
    status: string
    description: string
}

const getSystemPrompt = (ticketContext: TicketContext) => `
You are an AI Maintenance Assistant helping with ticket #${ticketContext.ticket_id}.

TICKET DETAILS:
- Title: ${ticketContext.title}
- Category: ${ticketContext.category}
- Priority: ${ticketContext.priority}
- Location: ${ticketContext.location}
- Status: ${ticketContext.status}
- Description: ${ticketContext.description}

YOUR ROLE:
1. Help technicians troubleshoot maintenance issues
2. Suggest repair approaches and tools needed
3. Provide safety warnings when relevant
4. Answer questions about the specific ticket
5. Help users understand their maintenance request status
6. **TICKET MANAGEMENT**: Suggest recategorization, reprioritization, or status changes when appropriate

TICKET MANAGEMENT CAPABILITIES:
- If the issue seems more severe than current priority, suggest upgrading to "High"
- If the category doesn't match the description, suggest a better category
- If the location is unclear, ask for clarification or suggest likely locations
- If the issue is resolved, suggest status change to "Resolved"

TICKET CATEGORIES AVAILABLE: Electrical, Plumbing, HVAC (Air Conditioning), Carpentry & Furniture, IT & Networking, General Maintenance, Painting, Civil Works, Appliance Repair, Cleaning Services

PRIORITY LEVELS: Low, Medium, High

STATUS OPTIONS: Open, In Progress, Resolved, Closed, Escalated, Pending Verification

GUIDELINES:
- Be concise and professional (max 3-4 sentences for simple questions)
- For complex technical questions, provide detailed step-by-step guidance
- Always prioritize safety in your recommendations
- If you don't have enough information, ask clarifying questions
- Reference the ticket details when relevant
- Use formatting (bullet points, bold text) for readability
- When suggesting changes, explain WHY the change is needed

Do not:
- Make up information not in the ticket
- Suggest dangerous shortcuts
- Reveal internal system details
- Discuss other tickets or users
- Automatically change tickets - only SUGGEST changes for human approval
`

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
        // Get environment variables
        // @ts-ignore: Deno namespace
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
        // @ts-ignore: Deno namespace
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        // @ts-ignore: Deno namespace
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!GEMINI_API_KEY) {
            throw new Error('Server Config Error: Missing GEMINI_API_KEY')
        }
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Server Config Error: Missing Supabase configuration')
        }

        // Create Supabase admin client
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // Parse request body
        let requestBody
        try {
            const bodyText = await req.text()
            requestBody = JSON.parse(bodyText)
        } catch {
            throw new Error('Invalid JSON in request body')
        }

        const { ticket_id, message, chat_history, action = 'chat' } = requestBody

        // Validate required fields
        if (!ticket_id || typeof ticket_id !== 'string') {
            throw new Error('Missing or invalid ticket_id')
        }

        if (!message || typeof message !== 'string' || message.trim().length < 1) {
            throw new Error('Missing or invalid message')
        }

        const sanitizedMessage = sanitizeInput(message)

        // Fetch ticket details for context
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .select('id, title, description, category, priority, facility_type, specific_location, status, created_by, assigned_to')
            .eq('id', ticket_id)
            .single()

        if (ticketError || !ticket) {
            throw new Error('Ticket not found')
        }

        // Build ticket context
        const ticketContext = {
            ticket_id: ticket.id,
            title: ticket.title,
            description: ticket.description || 'No description provided',
            category: ticket.category || 'General',
            priority: ticket.priority || 'Medium',
            location: `${ticket.facility_type || 'Unknown'} - ${ticket.specific_location || 'Unknown'}`,
            status: ticket.status
        }

        // Handle different actions
        if (action === 'summarize') {
            // Summarize chat history
            const summaryPrompt = `Summarize the following chat conversation about maintenance ticket "${ticket.title}" in 2-3 bullet points. Focus on key issues discussed, decisions made, and next steps:

${chat_history || 'No chat history'}

Provide a concise summary:`

            const summary = await callGemini(GEMINI_API_KEY, summaryPrompt, 200)
            return new Response(JSON.stringify({ summary }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'suggest_fix') {
            // Get AI fix suggestion
            const fixPrompt = `Based on this maintenance issue:
Title: ${ticket.title}
Category: ${ticket.category}
Description: ${ticket.description}

Provide:
1. Technical Diagnosis (what's likely wrong)
2. Tools Required (bullet list)
3. Safety Precautions (bullet list)
4. Step-by-step repair approach`

            const fixSuggestion = await callGemini(GEMINI_API_KEY, fixPrompt, 800)
            return new Response(JSON.stringify({ 
                suggestion: fixSuggestion,
                message_type: 'ai_suggestion'
            }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'suggest_categorization') {
            // Suggest better categorization
            const categoryPrompt = `Analyze this maintenance ticket and suggest improvements:

Current Details:
- Title: ${ticket.title}
- Category: ${ticket.category}
- Priority: ${ticket.priority}
- Description: ${ticket.description}

Suggest:
1. Better category if current one doesn't fit (from: Electrical, Plumbing, HVAC, Carpentry & Furniture, IT & Networking, General Maintenance, Painting, Civil Works, Appliance Repair, Cleaning Services)
2. Appropriate priority level (Low, Medium, High)
3. Brief reasoning for each suggestion

Format your response as:
**Suggested Category:** [category] - [reason]
**Suggested Priority:** [priority] - [reason]`

            const suggestion = await callGemini(GEMINI_API_KEY, categoryPrompt, 400)
            return new Response(JSON.stringify({ 
                suggestion,
                message_type: 'ai_suggestion',
                action_type: 'categorization'
            }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        if (action === 'suggest_status_change') {
            // Suggest status change
            const statusPrompt = `Based on this maintenance ticket and recent chat:

Ticket Details:
- Title: ${ticket.title}
- Current Status: ${ticket.status}
- Priority: ${ticket.priority}
- Description: ${ticket.description}

Recent Chat:
${chat_history || 'No recent chat'}

Suggest the most appropriate status change (from: Open, In Progress, Resolved, Closed, Escalated, Pending Verification) and explain why.

Format your response as:
**Suggested Status:** [status]
**Reason:** [brief explanation]`

            const suggestion = await callGemini(GEMINI_API_KEY, statusPrompt, 300)
            return new Response(JSON.stringify({ 
                suggestion,
                message_type: 'ai_suggestion',
                action_type: 'status_change'
            }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })
        }

        // Default: Chat response
        // Build conversation context
        let conversationContext = getSystemPrompt(ticketContext)
        
        // Add recent chat history if provided
        if (chat_history && Array.isArray(chat_history) && chat_history.length > 0) {
            conversationContext += '\n\nRECENT CHAT HISTORY:\n'
            chat_history.slice(-10).forEach((msg: { sender_type: string; message: string }) => {
                const role = msg.sender_type === 'ai' ? 'Assistant' : 'User'
                conversationContext += `${role}: ${msg.message}\n`
            })
        }

        // Add user message
        conversationContext += `\nUser: ${sanitizedMessage}\n\nAssistant:`

        const startTime = Date.now()
        const aiResponse = await callGemini(GEMINI_API_KEY, conversationContext, 600)
        const responseTime = Date.now() - startTime

        // Store AI response in database
        const { data: aiMessage, error: insertError } = await supabase
            .from('ticket_messages')
            .insert({
                ticket_id: ticket_id,
                sender_id: null,
                sender_type: 'ai',
                message: aiResponse,
                message_type: 'ai_suggestion',
                ai_context: {
                    prompt: sanitizedMessage,
                    response_time_ms: responseTime,
                    model_used: 'gemini-flash',
                    action: action
                }
            })
            .select('id')
            .single()

        if (insertError) {
            console.error('Failed to store AI message:', insertError)
        }

        return new Response(JSON.stringify({
            response: aiResponse,
            message_id: aiMessage?.id,
            context: {
                response_time_ms: responseTime,
                model_used: 'gemini-flash'
            }
        }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error(`[ai-chat-assistant] Failed: ${errMsg}`)
        return new Response(JSON.stringify({ error: errMsg || 'Internal server error' }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: errMsg?.includes('not found') ? 404 : 
                     errMsg?.includes('Missing') ? 400 : 500,
        })
    }
})

// Call Gemini API
async function callGemini(apiKey: string, prompt: string, maxTokens: number = 500): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: prompt }]
                    }],
                    generationConfig: {
                        temperature: 0.4,
                        maxOutputTokens: maxTokens,
                    }
                }),
                signal: controller.signal
            }
        )

        clearTimeout(timeoutId)

        const data = await response.json()

        if (data.error) {
            throw new Error(`Gemini API Error: ${data.error.message || 'Unknown error'}`)
        }

        const candidate = data.candidates?.[0]
        if (!candidate && data.promptFeedback) {
            throw new Error("AI Request was blocked by safety filters")
        }

        const text = candidate?.content?.parts?.[0]?.text
        if (!text) {
            throw new Error("AI returned no response")
        }

        return text.trim()

    } catch (error: unknown) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error("AI request timed out. Please try again.")
        }
        throw error
    }
}
