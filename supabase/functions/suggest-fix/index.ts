import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Security: Restrict CORS to your actual domain
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://mtusmms.me',
]

const corsHeaders = (origin: string) => {
    console.log(`[suggest-fix] CORS request from origin: ${origin}`)
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    console.log(`[suggest-fix] Allowed origin set to: ${allowedOrigin}`)
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
    // Remove potential prompt injection attempts
    return input
        .replace(/ignore previous|system prompt|you are/gi, '')
        .replace(/[<>]/g, '') // Remove potential XSS
        .substring(0, 2000) // Limit input length
}

// Validate URL to prevent SSRF attacks
const validateImageUrl = (url: string): boolean => {
    try {
        const urlObj = new URL(url)
        // Only allow HTTPS and specific domains
        return urlObj.protocol === 'https:' && 
               (urlObj.hostname.includes('supabase.co') || 
                urlObj.hostname.includes('mtusmms.me'))
    } catch {
        return false
    }
}

serve(async (req: Request) => {
    console.log(`[suggest-fix] Request received: ${req.method} ${req.url}`)
    console.log(`[suggest-fix] Headers:`, Object.fromEntries(req.headers.entries()))
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders(req.headers.get('origin') || '') })
    }

    // Only allow POST
    if (req.method !== 'POST') {
        console.log(`[suggest-fix] Method not allowed: ${req.method}`)
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' }, status: 405 }
        )
    }

    try {
        // @ts-ignore: Deno namespace
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
        console.log(`[suggest-fix] GEMINI_API_KEY exists: ${!!GEMINI_API_KEY}`)
        
        if (!GEMINI_API_KEY) {
            throw new Error('Server Config Error: Missing GEMINI_API_KEY. Please configure this secret in Supabase Dashboard > Edge Functions > Secrets.')
        }

        // Parse and validate request body
        let requestBody
        try {
            const bodyText = await req.text()
            console.log(`[suggest-fix] Request body:`, bodyText)
            requestBody = JSON.parse(bodyText)
        } catch (parseError) {
            console.error(`[suggest-fix] JSON parse error:`, parseError)
            throw new Error('Invalid JSON in request body')
        }

        console.log(`[suggest-fix] Parsed request body:`, requestBody)

        const { ticketDescription, ticketCategory, image_url } = requestBody

        // Validate required fields
        if (!ticketDescription || typeof ticketDescription !== 'string') {
            console.error(`[suggest-fix] Missing or invalid ticketDescription:`, ticketDescription)
            throw new Error('Missing or invalid ticketDescription')
        }

        // Sanitize inputs
        const sanitizedDescription = sanitizeInput(ticketDescription)
        const sanitizedCategory = sanitizeInput(ticketCategory || 'General')

        if (sanitizedDescription.length < 10) {
            throw new Error('Ticket description too short')
        }

        console.log(`[suggest-fix] Processing request for: ${sanitizedCategory}`)

        // Construct Gemini Payload Parts
        const parts: any[] = []

        // Handle Image Processing if URL is provided
        if (image_url) {
            console.log(`[suggest-fix] Fetching image from: ${image_url}`)
            try {
                // Validate URL to prevent SSRF
                if (!validateImageUrl(image_url)) {
                    console.warn('[suggest-fix] Invalid or unauthorized image URL')
                    throw new Error('Invalid image URL')
                }
                    const imageResponse = await fetch(image_url, {
                        headers: { 'Accept': 'image/*' },
                    })
                    if (!imageResponse.ok) {
                        console.warn(`[suggest-fix] Failed to fetch image: ${imageResponse.statusText}`)
                    } else {
                        const blob = await imageResponse.blob()
                        
                        // Validate image size (max 10MB)
                        if (blob.size > 10 * 1024 * 1024) {
                            console.warn('[suggest-fix] Image too large, skipping')
                        } else {
                            const arrayBuffer = await blob.arrayBuffer()

                            // Convert ArrayBuffer to Base64
                            let binary = '';
                            const bytes = new Uint8Array(arrayBuffer);
                            const len = bytes.byteLength;
                            for (let i = 0; i < len; i++) {
                                binary += String.fromCharCode(bytes[i]);
                            }
                            const base64String = btoa(binary);

                            parts.push({
                                inline_data: {
                                    mime_type: blob.type || 'image/jpeg',
                                    data: base64String
                                }
                            })
                            console.log("[suggest-fix] Image attached to payload.")
                        }
                    }
                }
            } catch (imgError) {
                console.error("[suggest-fix] Error processing image:", imgError)
            }
        }

        // Add Text Prompts with clear structure
        const systemPrompt = "You are a senior maintenance supervisor advising a junior technician."
        const taskPrompt = `
Analyze this maintenance issue:
Category: ${sanitizedCategory}
Description: ${sanitizedDescription}

Provide a response in this exact format:

Technical Diagnosis: [your technical explanation here]

Tools Required: 
• [tool 1]
• [tool 2]
• [tool 3]

Safety Precaution: WARNING: [your safety warning here]

Keep responses concise and professional.
        `

        parts.push({
            text: `${systemPrompt}\n${taskPrompt}`
        })

        // Call Gemini API with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

        console.log(`[suggest-fix] About to call Gemini API...`)

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: parts
                        }],
                        generationConfig: {
                            temperature: 0.3, // Lower temperature for more consistent outputs
                            maxOutputTokens: 500,
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
                throw new Error("AI Request was blocked by safety filters.")
            }

            let suggestionText = candidate?.content?.parts?.[0]?.text
            if (!suggestionText) {
                throw new Error("AI returned no suggestion content.")
            }

            console.log(`[suggest-fix] Raw AI response:`, suggestionText)
            console.log(`[suggest-fix] Response length:`, suggestionText.length)
            console.log(`[suggest-fix] Response type:`, typeof suggestionText)

            // Parse the structured text response
            let jsonResponse = {
                technical_diagnosis: "",
                tools_required: [],
                safety_precaution: ""
            }

            try {
                // Split by lines and parse each section
                const lines = suggestionText.split('\n').map(line => line.trim())
                console.log(`[suggest-fix] Split lines:`, lines)
                
                let currentSection = ""
                let toolsList = []
                let diagnosisText = ""
                
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i]
                    console.log(`[suggest-fix] Processing line ${i}: "${line}"`)
                    
                    // Handle multi-line diagnosis
                    if (line.toLowerCase().includes('technical diagnosis:')) {
                        diagnosisText = line.replace(/technical diagnosis:/gi, '').trim()
                        // Check if next lines continue the diagnosis
                        let j = i + 1
                        while (j < lines.length && !lines[j].toLowerCase().includes('tools required:') && !lines[j].toLowerCase().includes('safety precaution:')) {
                            diagnosisText += ' ' + lines[j].trim()
                            j++
                        }
                        jsonResponse.technical_diagnosis = diagnosisText.trim()
                        console.log(`[suggest-fix] Found diagnosis: "${jsonResponse.technical_diagnosis}"`)
                        i = j - 1 // Skip the processed lines
                    } else if (line.toLowerCase().includes('tools required:')) {
                        currentSection = 'tools'
                        console.log(`[suggest-fix] Switched to tools section`)
                    } else if (line.toLowerCase().includes('safety precaution:')) {
                        jsonResponse.safety_precaution = line.replace(/safety precaution:/gi, '').trim()
                        currentSection = 'safety'
                        console.log(`[suggest-fix] Found safety: "${jsonResponse.safety_precaution}"`)
                    } else if ((line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) && currentSection === 'tools') {
                        const tool = line.replace(/^[•\-\*]\s*/, '').trim()
                        if (tool) {
                            toolsList.push(tool)
                            console.log(`[suggest-fix] Found tool: "${tool}"`)
                        }
                    }
                }
                
                jsonResponse.tools_required = toolsList
                console.log(`[suggest-fix] Final parsed response:`, jsonResponse)
                
                // Validation and fallbacks
                if (!jsonResponse.technical_diagnosis) {
                    jsonResponse.technical_diagnosis = "Technical issue identified - analysis in progress."
                }
                if (jsonResponse.tools_required.length === 0) {
                    jsonResponse.tools_required = ["Basic toolkit", "Safety equipment", "Testing devices"]
                }
                if (!jsonResponse.safety_precaution) {
                    jsonResponse.safety_precaution = "WARNING: Always follow proper safety procedures."
                }
                
                // Ensure safety precaution starts with WARNING
                if (!jsonResponse.safety_precaution.startsWith('WARNING:')) {
                    jsonResponse.safety_precaution = `WARNING: ${jsonResponse.safety_precaution}`;
                }
                
                // Clean up lengths
                jsonResponse.technical_diagnosis = jsonResponse.technical_diagnosis.substring(0, 500)
                jsonResponse.tools_required = jsonResponse.tools_required.slice(0, 10)
                jsonResponse.safety_precaution = jsonResponse.safety_precaution.substring(0, 200)
                
            } catch (e) {
                console.error("Failed to parse structured response:", suggestionText);
                console.error("Parse error:", e);
                
                // Fallback response
                jsonResponse = {
                    technical_diagnosis: "Maintenance issue detected. Professional assessment required.",
                    tools_required: ["Basic tools", "Safety equipment", "Testing devices"],
                    safety_precaution: "WARNING: Always follow proper safety procedures."
                }
            }

            return new Response(JSON.stringify(jsonResponse), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })

        } catch (apiError: any) {
            if (apiError.name === 'AbortError') {
                throw new Error("AI request timed out. Please try again.")
            }
            throw apiError
        }

    } catch (error: any) {
        console.error(`[suggest-fix] Failed: ${error.message}`)
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: error.message?.includes('blocked') ? 403 : 400,
        })
    }
})
