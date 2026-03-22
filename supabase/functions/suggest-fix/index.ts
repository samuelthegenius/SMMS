import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Security: Restrict CORS to your actual domain
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

// Input sanitization
const sanitizeInput = (input: string): string => {
    if (!input) return ''
    // Remove potential prompt injection attempts
    return input
        .replace(/ignore previous|system prompt|you are/gi, '')
        .substring(0, 2000) // Limit input length
}

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
        // @ts-ignore: Deno namespace
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
        if (!GEMINI_API_KEY) {
            throw new Error('Server Config Error: Missing GEMINI_API_KEY')
        }

        // Parse and validate request body
        let requestBody
        try {
            requestBody = await req.json()
        } catch {
            throw new Error('Invalid JSON in request body')
        }

        const { ticketDescription, ticketCategory, image_url } = requestBody

        // Validate required fields
        if (!ticketDescription || typeof ticketDescription !== 'string') {
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
                // Validate URL format
                if (!image_url.startsWith('https://')) {
                    console.warn('[suggest-fix] Invalid image URL scheme')
                } else {
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

        // Add Text Prompts with strict output formatting
        const systemPrompt = "You are a senior maintenance supervisor advising a junior technician."
        const taskPrompt = `
            Category: ${sanitizedCategory}
            Issue: ${sanitizedDescription}

            Return a STRICT JSON object (no markdown formatting, no code blocks) with these fields:
            - technical_diagnosis: (A concise technical explanation of the fault, max 200 characters)
            - tools_required: (Array of exactly 3-5 essential tools)
            - safety_precaution: (One critical safety warning starting with "WARNING:")

            Rules:
            - Response must be valid JSON only
            - No explanations outside the JSON
            - Keep diagnosis professional and technical
            - Tools must be specific to the issue
        `

        parts.push({
            text: `${systemPrompt}\n${taskPrompt}`
        })

        // Call Gemini API with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

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
                            responseMimeType: 'application/json', // Force JSON response
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

            // Parse JSON response
            let jsonResponse;
            try {
                jsonResponse = JSON.parse(suggestionText);
                
                // Validate response structure
                if (!jsonResponse.technical_diagnosis || !Array.isArray(jsonResponse.tools_required) || !jsonResponse.safety_precaution) {
                    throw new Error("AI response missing required fields")
                }
                
                // Sanitize response
                jsonResponse.technical_diagnosis = jsonResponse.technical_diagnosis.substring(0, 500)
                jsonResponse.tools_required = jsonResponse.tools_required.slice(0, 10)
                jsonResponse.safety_precaution = jsonResponse.safety_precaution.substring(0, 200)
                
            } catch (e) {
                console.error("Failed to parse AI JSON:", suggestionText);
                throw new Error("AI Response was not valid JSON");
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
