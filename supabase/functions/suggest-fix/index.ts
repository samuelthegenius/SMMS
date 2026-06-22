// deno-lint-ignore no-import-prefix
import { serve } from "jsr:@std/http@0.224.0/server"

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
        .substring(0, 2000)
}

// Validate URL to prevent SSRF attacks
const validateImageUrl = (url: string): boolean => {
    try {
        const urlObj = new URL(url)
        return urlObj.protocol === 'https:' && 
               (urlObj.hostname.includes('supabase.co'))
    } catch {
        return false
    }
}

serve(async (req: Request) => {
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
        // @ts-ignore: Deno namespace
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
        
        if (!GEMINI_API_KEY) {
            throw new Error('Server Config Error: Missing GEMINI_API_KEY. Please configure this secret in Supabase Dashboard > Edge Functions > Secrets.')
        }

        let requestBody
        try {
            const bodyText = await req.text()
            requestBody = JSON.parse(bodyText)
        } catch (_parseError) {
            throw new Error('Invalid JSON in request body')
        }

        const { ticketDescription, ticketCategory, image_url } = requestBody

        if (!ticketDescription || typeof ticketDescription !== 'string') {
            throw new Error('Missing or invalid ticketDescription')
        }

        const sanitizedDescription = sanitizeInput(ticketDescription)
        const sanitizedCategory = sanitizeInput(ticketCategory || 'General')

        if (sanitizedDescription.trim().length < 3) {
            throw new Error('Ticket description too short')
        }

        const parts: { text?: string; inline_data?: { mime_type: string; data: string } }[] = []

        if (image_url) {
            try {
                if (!validateImageUrl(image_url)) {
                    throw new Error('Invalid image URL')
                }

                const imageResponse = await fetch(image_url, {
                    headers: { 'Accept': 'image/*' },
                })
                if (!imageResponse.ok) {
                    throw new Error(`Failed to fetch image: ${imageResponse.statusText}`)
                } else {
                    const blob = await imageResponse.blob()
                    if (blob.size > 10 * 1024 * 1024) {
                        throw new Error('Image too large')
                    } else {
                        const arrayBuffer = await blob.arrayBuffer()
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
                    }
                }
            } catch (_imgError) {
                // Continue without image
            }
        }

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

        let data = null;
        let lastError = null;
        let retries = 5;
        
        for (let i = 0; i < retries; i++) {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), i === 0 ? 20000 : 30000)
            
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
                                temperature: 0.2,
                                maxOutputTokens: 600,
                            }
                        }),
                        signal: controller.signal
                    }
                )

                clearTimeout(timeoutId)
                data = await response.json()
                
                if (data.error && data.error.message && data.error.message.includes('high demand')) {
                    throw new Error(`Gemini API Error: ${data.error.message}`);
                }
                
                if (!data.error) {
                    break;
                } else {
                    throw new Error(`Gemini API Error: ${data.error.message}`);
                }
            } catch (err) {
                clearTimeout(timeoutId)
                lastError = err;
                
                if (err.name === 'AbortError' || (err instanceof Error && err.message.includes('high demand'))) {
                    if (i < retries - 1) {
                        const delay = Math.pow(2, i + 1) * 1000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                }
                
                break;
            }
        }

        if (!data || data.error) {
            throw lastError || new Error(`Gemini API Error: ${data?.error?.message || 'Failed to contact Gemini API after multiple attempts'}`);
        }

        const candidate = data.candidates?.[0]
        if (!candidate && data.promptFeedback) {
            throw new Error("AI Request was blocked by safety filters.")
        }

        const suggestionText = candidate?.content?.parts?.[0]?.text
        if (!suggestionText) {
            throw new Error("AI returned no suggestion content.")
        }

        const jsonResponse: {
            technical_diagnosis: string
            tools_required: string[]
            safety_precaution: string
        } = {
            technical_diagnosis: "",
            tools_required: [],
            safety_precaution: ""
        }

        try {
            const lines = suggestionText.split('\n').map((line: string) => line.trim())
            
            let currentSection = ""
            const toolsList: string[] = []
            let diagnosisText = ""
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i]
                
                if (line.toLowerCase().includes('technical diagnosis:')) {
                    currentSection = "diagnosis"
                    diagnosisText += line.substring(line.toLowerCase().indexOf('technical diagnosis:') + 20).trim() + " "
                }
                else if (line.toLowerCase().includes('tools required:')) {
                    currentSection = "tools"
                }
                else if (line.toLowerCase().includes('safety precaution')) {
                    currentSection = "safety"
                    const idx = line.toLowerCase().indexOf('safety precaution')
                    const afterColon = line.indexOf(':', idx)
                    jsonResponse.safety_precaution = afterColon >= 0 ? line.substring(afterColon + 1).trim() : ''
                }
                else if (line.toLowerCase().includes('step-by-step repair approach:')) {
                    currentSection = "steps"
                }
                else if (line.length > 0) {
                    if (currentSection === "diagnosis") {
                        diagnosisText += line + " "
                    } else if (currentSection === "tools" && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*'))) {
                        toolsList.push(line.substring(1).trim())
                    } else if (currentSection === "tools" && line.match(/^\d+\./)) {
                        toolsList.push(line.substring(line.indexOf('.') + 1).trim())
                    } else if (currentSection === "safety") {
                        if (jsonResponse.safety_precaution) jsonResponse.safety_precaution += " "
                        jsonResponse.safety_precaution += line.startsWith('-') ? line.substring(1).trim() : line
                    }
                }
            }
            
            jsonResponse.technical_diagnosis = diagnosisText.trim()
            jsonResponse.tools_required = toolsList.filter(Boolean)
            
            if (!jsonResponse.technical_diagnosis) {
                jsonResponse.technical_diagnosis = suggestionText.substring(0, 500) + (suggestionText.length > 500 ? "..." : "")
            }
            if (jsonResponse.tools_required.length === 0) {
                jsonResponse.tools_required = ["Review task details for necessary tools"]
            }
            if (!jsonResponse.safety_precaution) {
                jsonResponse.safety_precaution = "Follow standard safety protocols for this type of maintenance."
            }
            
            jsonResponse.technical_diagnosis = jsonResponse.technical_diagnosis.substring(0, 2000)
            jsonResponse.tools_required = jsonResponse.tools_required.slice(0, 15)
            jsonResponse.safety_precaution = jsonResponse.safety_precaution.substring(0, 1000)
            
        } catch (_e) {
            throw new Error(`Failed to parse AI response: ${suggestionText.substring(0, 100)}`);
        }

        return new Response(JSON.stringify(jsonResponse), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error("Suggest Fix Edge Function Error:", errMsg)
        console.error("Full error object:", error)
        
        return new Response(JSON.stringify({
            error: errMsg,
            message: "AI suggestion failed. Please try again later."
        }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 200
        })
    }
})
