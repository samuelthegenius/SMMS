
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    // 1. Handle CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // @ts-ignore: Deno namespace
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
        if (!GEMINI_API_KEY) {
            throw new Error('Server Config Error: Missing GEMINI_API_KEY')
        }

        // 2. Parse Input (Text + Optional Image)
        const { ticketDescription, ticketCategory, image_url } = await req.json()

        if (!ticketDescription) {
            throw new Error('Missing ticketDescription')
        }

        console.log(`[suggest-fix] Processing request for: ${ticketCategory}`)

        // 3. Construct Gemini Payload Parts
        const parts: any[] = []

        // Step A: Handle Image Processing if URL is provided
        if (image_url) {
            console.log(`[suggest-fix] Fetching image from: ${image_url}`)
            try {
                const imageResponse = await fetch(image_url)
                if (!imageResponse.ok) {
                    console.warn(`[suggest-fix] Failed to fetch image: ${imageResponse.statusText}`)
                } else {
                    const blob = await imageResponse.blob()
                    const arrayBuffer = await blob.arrayBuffer()

                    // Convert ArrayBuffer to Base64 manually to avoid stack overflow on large files
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
            } catch (imgError) {
                console.error("[suggest-fix] Error processing image:", imgError)
                // We proceed without the image if it fails, rather than crashing the whole request
            }
        }

        // Step B: Add Text Prompts
        const role = "You are a senior maintenance supervisor advising a junior technician."
        const task = `
            Category: ${ticketCategory || 'General'}
            Issue: ${ticketDescription}
            
            Return a STRICT JSON object (no markdown formatting, no code blocks) with these fields:
            - technical_diagnosis: (A concise technical explanation of the fault)
            - tools_required: (Array of strings)
            - safety_precaution: (One critical safety warning starting with "WARNING:")
        `

        parts.push({
            text: `${role}\n${task}`
        })

        // 4. Call Gemini API (gemini-flash-latest)
        console.log("[suggest-fix] Calling Gemini Flash Latest...")
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: parts
                }]
            }),
        })

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

        // Clean up markdown code blocks if Gemini adds them
        suggestionText = suggestionText.replace(/```json/g, '').replace(/```/g, '').trim();

        // Parse JSON
        let jsonResponse;
        try {
            jsonResponse = JSON.parse(suggestionText);
        } catch (e) {
            console.error("Failed to parse AI JSON:", suggestionText);
            throw new Error("AI Response was not valid JSON");
        }

        // 5. Return Success Response
        return new Response(JSON.stringify(jsonResponse), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error(`[suggest-fix] Failed: ${error.message}`)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
