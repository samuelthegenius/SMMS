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
            // Suggest better categorization with structured JSON response
            const categoryPrompt = `You are a JSON response bot. Analyze this maintenance ticket and return ONLY JSON.

Current Details:
- Title: ${ticket.title}
- Current Category: ${ticket.category}
- Priority: ${ticket.priority}
- Description: ${ticket.description}

Available Categories: Electrical, Plumbing, HVAC (Air Conditioning), Carpentry & Furniture, IT & Networking, General Maintenance, Painting, Civil Works, Appliance Repair, Cleaning Services

Your entire response must be exactly this JSON format:
{"suggested_category":"CategoryName","confidence":0.85,"reasoning":"Brief explanation"}

Important:
- suggested_category must be exactly one of the available categories
- confidence must be a number between 0.0 and 1.0
- reasoning should be 1-2 sentences
- NO MARKDOWN, NO EXPLANATION, ONLY THE JSON
- START WITH { and END WITH }`;

            let aiResponse;
            try {
                // Use JSON mode for consistent structured output with higher token limit
                aiResponse = await callGemini(GEMINI_API_KEY, categoryPrompt, 500, true);
            } catch (_err) {
                // Fallback to regular mode if JSON mode fails
                aiResponse = await callGemini(GEMINI_API_KEY, categoryPrompt, 500, false);
            }

            // Parse the JSON response - always return something, never fail
            let parsedSuggestion;
            try {
                // AI with jsonMode should return pure JSON
                parsedSuggestion = JSON.parse(aiResponse);
            } catch (_e) {
                // Try to repair incomplete JSON
                try {
                    const repaired = repairIncompleteJSON(aiResponse);
                    parsedSuggestion = JSON.parse(repaired);
                } catch {
                    // Fallback 1: try to extract from markdown code blocks
                    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            parsedSuggestion = JSON.parse(jsonMatch[0]);
                        } catch {
                            // Fallback 2: extract category with regex
                            const categoryMatch = aiResponse.match(/(?:Electrical|Plumbing|HVAC|Carpentry & Furniture|IT & Networking|General Maintenance|Painting|Civil Works|Appliance Repair|Cleaning Services)/i);
                            const suggestedCategory = categoryMatch ? categoryMatch[0].trim() : ticket.category;

                            parsedSuggestion = {
                                suggested_category: suggestedCategory,
                                confidence: 0.5,
                                reasoning: 'AI response parsing failed, extracted category with regex from: ' + aiResponse.substring(0, 100)
                            };
                        }
                    } else {
                        // Final fallback: return current category with low confidence
                        parsedSuggestion = {
                            suggested_category: ticket.category,
                            confidence: 0.3,
                            reasoning: 'AI response was not parseable. Response was: ' + aiResponse.substring(0, 100)
                        };
                    }
                }
            }

            return new Response(JSON.stringify({
                suggested_value: parsedSuggestion.suggested_category,
                current_value: ticket.category,
                confidence: parsedSuggestion.confidence,
                reasoning: parsedSuggestion.reasoning,
                message_type: 'ai_suggestion',
                action_type: 'recategorize'
            }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        if (action === 'suggest_status_change') {
            // Suggest status change with structured JSON response
            const statusPrompt = `You are a JSON response bot. Based on this maintenance ticket and recent chat, return ONLY JSON.

Ticket Details:
- Title: ${ticket.title}
- Current Status: ${ticket.status}
- Priority: ${ticket.priority}
- Description: ${ticket.description}

Recent Chat:
${chat_history || 'No recent chat'}

Available Statuses: Open, In Progress, Resolved, Closed, Escalated, Pending Verification

Your entire response must be exactly this JSON format:
{"suggested_status":"StatusName","confidence":0.85,"reasoning":"Brief explanation"}

Important:
- suggested_status must be exactly one of the available statuses
- confidence must be a number between 0.0 and 1.0
- reasoning should reference ticket/chat details
- NO MARKDOWN, NO EXPLANATION, ONLY THE JSON
- START WITH { and END WITH }`;

            let aiResponse;
            try {
                // Use JSON mode for consistent structured output
                aiResponse = await callGemini(GEMINI_API_KEY, statusPrompt, 300, true);
            } catch (_err) {
                // Fallback to regular mode if JSON mode fails
                aiResponse = await callGemini(GEMINI_API_KEY, statusPrompt, 300, false);
            }

            // Parse the JSON response - always return something, never fail
            let parsedSuggestion;
            try {
                // AI with jsonMode should return pure JSON
                parsedSuggestion = JSON.parse(aiResponse);
            } catch (_e) {
                // Fallback 1: try to extract from markdown code blocks
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        parsedSuggestion = JSON.parse(jsonMatch[0]);
                    } catch {
                        // Fallback 2: extract status with regex
                        const statusMatch = aiResponse.match(/(?:Open|In Progress|Resolved|Closed|Escalated|Pending Verification)/i);
                        const suggestedStatus = statusMatch ? statusMatch[0].trim() : ticket.status;

                        parsedSuggestion = {
                            suggested_status: suggestedStatus,
                            confidence: 0.5,
                            reasoning: 'AI response parsing failed, extracted status with regex from: ' + aiResponse.substring(0, 100)
                        };
                    }
                } else {
                    // Final fallback: return current status with low confidence
                    parsedSuggestion = {
                        suggested_status: ticket.status,
                        confidence: 0.3,
                        reasoning: 'AI response was not parseable. Response was: ' + aiResponse.substring(0, 100)
                    };
                }
            }

            return new Response(JSON.stringify({
                suggested_value: parsedSuggestion.suggested_status,
                current_value: ticket.status,
                confidence: parsedSuggestion.confidence,
                reasoning: parsedSuggestion.reasoning,
                message_type: 'ai_suggestion',
                action_type: 'change_status'
            }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        if (action === 'suggest_priority') {
            // Suggest priority change with structured JSON response
            const priorityPrompt = `You are a JSON response bot. Based on this maintenance ticket, return ONLY JSON with priority recommendation.

Ticket Details:
- Title: ${ticket.title}
- Current Priority: ${ticket.priority}
- Category: ${ticket.category}
- Status: ${ticket.status}
- Description: ${ticket.description}

Priority Guidelines:
- HIGH: Safety hazards, water leaks, power outages, security issues, no heating in winter, no cooling in extreme heat, systems affecting large numbers of people
- MEDIUM: Equipment malfunctions that impact work but have workarounds, single room issues, non-critical repairs
- LOW: Cosmetic issues, preventive maintenance, minor inconveniences, nice-to-have improvements

Available Priorities: Low, Medium, High

Your entire response must be exactly this JSON format:
{"suggested_priority":"PriorityName","confidence":0.85,"reasoning":"Brief explanation"}

Important:
- suggested_priority must be exactly one of: Low, Medium, High
- confidence must be a number between 0.0 and 1.0
- reasoning should reference specific ticket details and explain the severity assessment
- NO MARKDOWN, NO EXPLANATION, ONLY THE JSON
- START WITH { and END WITH }`;

            let aiResponse;
            try {
                // Use JSON mode for consistent structured output
                aiResponse = await callGemini(GEMINI_API_KEY, priorityPrompt, 300, true);
            } catch (_err) {
                // Fallback to regular mode if JSON mode fails
                aiResponse = await callGemini(GEMINI_API_KEY, priorityPrompt, 300, false);
            }

            // Parse the JSON response - always return something, never fail
            let parsedSuggestion;
            try {
                // AI with jsonMode should return pure JSON
                parsedSuggestion = JSON.parse(aiResponse);
            } catch (_e) {
                // Fallback 1: try to extract from markdown code blocks
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        parsedSuggestion = JSON.parse(jsonMatch[0]);
                    } catch {
                        // Fallback 2: extract priority with regex
                        const priorityMatch = aiResponse.match(/(?:Low|Medium|High)/i);
                        const suggestedPriority = priorityMatch ? priorityMatch[0].trim() : ticket.priority;

                        parsedSuggestion = {
                            suggested_priority: suggestedPriority,
                            confidence: 0.5,
                            reasoning: 'AI response parsing failed, extracted priority with regex from: ' + aiResponse.substring(0, 100)
                        };
                    }
                } else {
                    // Final fallback: return current priority with low confidence
                    parsedSuggestion = {
                        suggested_priority: ticket.priority,
                        confidence: 0.3,
                        reasoning: 'AI response was not parseable. Response was: ' + aiResponse.substring(0, 100)
                    };
                }
            }

            return new Response(JSON.stringify({
                suggested_value: parsedSuggestion.suggested_priority,
                current_value: ticket.priority,
                confidence: parsedSuggestion.confidence,
                reasoning: parsedSuggestion.reasoning,
                message_type: 'ai_suggestion',
                action_type: 'reprioritize'
            }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            });
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
            // Silent fail - AI response already sent to user
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
        return new Response(JSON.stringify({ error: errMsg || 'Internal server error' }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: errMsg?.includes('not found') ? 404 : 
                     errMsg?.includes('Missing') ? 400 : 500,
        })
    }
})

// Repair incomplete JSON responses
function repairIncompleteJSON(jsonStr: string): string {
    // Remove any trailing characters after the last }
    let cleaned = jsonStr.trim();
    
    // Find the last complete JSON object
    const lastBraceIndex = cleaned.lastIndexOf('}');
    if (lastBraceIndex !== -1) {
        cleaned = cleaned.substring(0, lastBraceIndex + 1);
    }
    
    // Try to fix common truncation issues
    if (cleaned.endsWith('"')) {
        // Ends with an open quote, close it
        cleaned = cleaned.slice(0, -1) + '\\"';
    }
    
    // If it ends with a property name but no value, add a default
    if (cleaned.endsWith('":')) {
        cleaned += ' null';
    }
    
    // If it ends with a comma and no closing brace, remove comma and add brace
    if (cleaned.endsWith(',')) {
        cleaned = cleaned.slice(0, -1);
    }
    
    // Ensure it ends with a closing brace
    if (!cleaned.endsWith('}')) {
        cleaned += '}';
    }
    
    // Try to complete missing properties with defaults
    if (!cleaned.includes('"confidence":')) {
        cleaned = cleaned.replace('}', ',"confidence":0.5}');
    }
    if (!cleaned.includes('"reasoning":')) {
        cleaned = cleaned.replace('}', ',"reasoning":"AI response was truncated"}');
    }
    
    return cleaned;
}

// Call Gemini API with optional JSON mode
async function callGemini(apiKey: string, prompt: string, maxTokens: number = 500, jsonMode: boolean = false): Promise<string> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    try {
        const generationConfig: { temperature: number; maxOutputTokens: number; responseMimeType?: string; thinkingConfig?: { thinkingBudget: number } } = {
            temperature: 0.2, // Lower temperature for more consistent output
            maxOutputTokens: maxTokens,
        }

        // Enable JSON mode for structured responses
        if (jsonMode) {
            generationConfig.responseMimeType = 'application/json'
        }

        // Disable thinking for Gemini 2.5 Flash to prevent truncation
        generationConfig.thinkingConfig = { thinkingBudget: 0 }

        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }],
            generationConfig
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
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
