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

// Valid categories from the system
const VALID_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "HVAC (Air Conditioning)",
  "Carpentry & Furniture",
  "IT & Networking",
  "General Maintenance",
  "Painting",
  "Civil Works",
  "Appliance Repair",
  "Cleaning Services"
]

// Category to Department mapping
const CATEGORY_TO_DEPARTMENT: Record<string, string> = {
  "Electrical": "Electrical Services",
  "Plumbing": "Plumbing & Waterworks",
  "HVAC (Air Conditioning)": "HVAC & Climate Control",
  "Carpentry & Furniture": "Carpentry & Joinery",
  "IT & Networking": "IT Support & Infrastructure",
  "General Maintenance": "General Facilities",
  "Painting": "Decorative & Painting Services",
  "Civil Works": "Civil Engineering & Construction",
  "Appliance Repair": "Appliance & Equipment Services",
  "Cleaning Services": "Janitorial & Cleaning"
}

// Facility context hints
const FACILITY_CONTEXT: Record<string, string> = {
  "Hostel": "Student residential accommodation",
  "Lecture Hall": "Educational teaching space",
  "Laboratory": "Scientific/technical research space",
  "Office": "Administrative workspace",
  "Sports Complex": "Athletic and recreational facility",
  "Chapel": "Religious worship space",
  "Staff Quarters": "Staff residential housing",
  "Cafeteria": "Food service and dining area",
  "Other": "General facility"
}

// Input sanitization
const sanitizeInput = (input: string): string => {
    if (!input) return ''
    return input
        .replace(/ignore previous|system prompt|you are/gi, '')
        .replace(/[<>]/g, '')
        .substring(0, 2000)
}

// Valid priority levels
const VALID_PRIORITIES = ["Low", "Medium", "High"]

// Priority context hints for AI
const PRIORITY_CONTEXT = {
  high_keywords: [
    'emergency', 'urgent', 'critical', 'dangerous', 'hazard', 'safety', 'fire', 'flood', 'leak', 'water leak',
    'power outage', 'no electricity', 'electrical hazard', 'shock', 'sparking', 'smoke', 'burning',
    'gas leak', 'carbon monoxide', 'broken glass', 'injury', 'fallen', 'collapsed', 'blocked exit',
    'no heat', 'no heating', 'freezing', 'extreme cold', 'no ac', 'no cooling', 'extreme heat',
    'security', 'intruder', 'break-in', 'theft', 'vandalism', 'broken lock', 'door stuck'
  ],
  medium_keywords: [
    'broken', 'not working', 'malfunction', 'repair needed', 'faulty', 'issue', 'problem',
    'clogged', 'slow drain', 'flickering', 'dim', 'noisy', 'squeaking', 'uncomfortable',
    'draft', 'minor leak', 'drip', 'stain', 'scratch', 'dent', 'chip'
  ]
}

// Parse AI response
const parseCategorizationResponse = (text: string) => {
  const result = {
    category: "General Maintenance" as string,
    priority: "Medium" as string,
    confidence: 0.8,
    priorityConfidence: 0.8,
    reasoning: '',
    priorityReasoning: ''
  }

  try {
    // Try to find category in response
    const categoryMatch = text.match(/Category:\s*(.+)/i)
    if (categoryMatch) {
      const extracted = categoryMatch[1].trim()
      // Find closest valid category
      result.category = VALID_CATEGORIES.find(c =>
        c.toLowerCase() === extracted.toLowerCase() ||
        extracted.toLowerCase().includes(c.toLowerCase()) ||
        c.toLowerCase().includes(extracted.toLowerCase().split(' ')[0])
      ) || "General Maintenance"
    }

    // Extract priority
    const priorityMatch = text.match(/Priority:\s*(Low|Medium|High)/i)
    if (priorityMatch) {
      const extractedPriority = priorityMatch[1].trim()
      result.priority = VALID_PRIORITIES.find(p =>
        p.toLowerCase() === extractedPriority.toLowerCase()
      ) || "Medium"
    }

    // Extract confidence
    const confidenceMatch = text.match(/Confidence:\s*(\d+)/i)
    if (confidenceMatch) {
      result.confidence = Math.min(1, Math.max(0, parseInt(confidenceMatch[1]) / 100))
    }

    // Extract priority confidence
    const priorityConfidenceMatch = text.match(/PriorityConfidence:\s*(\d+)/i)
    if (priorityConfidenceMatch) {
      result.priorityConfidence = Math.min(1, Math.max(0, parseInt(priorityConfidenceMatch[1]) / 100))
    }

    // Extract reasoning
    const reasoningMatch = text.match(/Reasoning:\s*(.+)/is)
    if (reasoningMatch) {
      result.reasoning = reasoningMatch[1].trim().substring(0, 200)
    }

    // Extract priority reasoning
    const priorityReasoningMatch = text.match(/PriorityReasoning:\s*(.+)/i)
    if (priorityReasoningMatch) {
      result.priorityReasoning = priorityReasoningMatch[1].trim().substring(0, 200)
    }

  } catch (_error) {
    // Parse error - will use default fallback
  }

  // Default fallback
  if (!result.category) {
    result.category = "General Maintenance"
    result.reasoning = "Default categorization applied"
  }
  if (!result.priority) {
    result.priority = "Medium"
    result.priorityReasoning = "Default priority applied"
  }

  return result
}

// Auto-detect priority from title/description (fallback)
const detectPriority = (title: string, description: string): { priority: string, reason: string } => {
  const text = (title + ' ' + description).toLowerCase()

  // Check for high priority keywords
  const highMatches = PRIORITY_CONTEXT.high_keywords.filter(kw => text.includes(kw.toLowerCase()))
  if (highMatches.length > 0) {
    return { priority: "High", reason: `High priority indicators: ${highMatches.slice(0, 3).join(', ')}` }
  }

  // Check for medium priority keywords
  const mediumMatches = PRIORITY_CONTEXT.medium_keywords.filter(kw => text.includes(kw.toLowerCase()))
  if (mediumMatches.length > 0) {
    return { priority: "Medium", reason: `Medium priority indicators: ${mediumMatches.slice(0, 3).join(', ')}` }
  }

  return { priority: "Low", reason: "No urgent indicators found - routine maintenance" }
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

    // Declare requestBody at higher scope for error handler access
    let requestBody: { title?: string; description?: string; facilityType?: string } = {}

    try {
        // @ts-ignore: Deno namespace
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

        if (!GEMINI_API_KEY) {
            throw new Error('Server Config Error: Missing GEMINI_API_KEY')
        }

        // Parse and validate request body
        try {
            const bodyText = await req.text()
            requestBody = JSON.parse(bodyText)
        } catch (_parseError) {
            throw new Error('Invalid JSON in request body')
        }

        const { title, description, facilityType } = requestBody

        // Validate required fields
        if (!title || typeof title !== 'string') {
            throw new Error('Missing or invalid title')
        }

        // Sanitize inputs
        const sanitizedTitle = sanitizeInput(title)
        const sanitizedDescription = sanitizeInput(description || '')
        const sanitizedFacility = sanitizeInput(facilityType || 'Other')

        if (sanitizedTitle.length < 3) {
            throw new Error('Title too short (min 3 characters)')
        }

        const facilityContext = FACILITY_CONTEXT[sanitizedFacility] || FACILITY_CONTEXT['Other']

        // Auto-detect priority as fallback/validation
        const fallbackPriority = detectPriority(sanitizedTitle, sanitizedDescription)

        // Build categorization prompt with priority
        const systemPrompt = `You are a facility maintenance categorization expert. Analyze maintenance requests and categorize them accurately.

Available categories:
${VALID_CATEGORIES.map(c => `- ${c}`).join('\n')}

Priority Guidelines:
- HIGH: Safety hazards, water leaks, power outages, security issues, no heating in winter, no cooling in extreme heat, systems affecting large numbers of people, any emergency or dangerous situation
- MEDIUM: Equipment malfunctions that impact work but have workarounds, single room issues, non-critical repairs, broken but functional items
- LOW: Cosmetic issues, preventive maintenance, minor inconveniences, nice-to-have improvements, routine scheduled work

Respond in this exact format:
Category: [exact category name from list]
Priority: [Low|Medium|High]
Confidence: [0-100]
PriorityConfidence: [0-100]
Reasoning: [brief explanation for category in 1-2 sentences]
PriorityReasoning: [brief explanation for priority in 1 sentence]`

        const userPrompt = `Facility Type: ${sanitizedFacility} (${facilityContext})
Title: ${sanitizedTitle}
Description: ${sanitizedDescription || 'No description provided'}

Categorize this maintenance request and assess its priority level:`

        // Call Gemini API with timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout for categorization

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
                            parts: [
                                { text: `${systemPrompt}\n${userPrompt}` }
                            ]
                        }],
                        generationConfig: {
                            temperature: 0.1, // Low temperature for consistent categorization
                            maxOutputTokens: 200,
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

            const responseText = candidate?.content?.parts?.[0]?.text
            if (!responseText) {
                throw new Error("AI returned no response content.")
            }

            // Parse the response
            const categorization = parseCategorizationResponse(responseText)
            const department = CATEGORY_TO_DEPARTMENT[categorization.category] || "General Facilities"

            // Validate priority - if AI returned Low but keywords suggest High, use keyword detection
            let finalPriority = categorization.priority
            let finalPriorityConfidence = categorization.priorityConfidence
            let finalPriorityReasoning = categorization.priorityReasoning

            if (fallbackPriority.priority === "High" && categorization.priority !== "High") {
              finalPriority = "High"
              finalPriorityConfidence = Math.max(categorization.priorityConfidence, 0.85)
              finalPriorityReasoning = fallbackPriority.reason
            }

            return new Response(JSON.stringify({
                category: categorization.category,
                department: department,
                priority: finalPriority,
                confidence: categorization.confidence,
                priorityConfidence: finalPriorityConfidence,
                reasoning: categorization.reasoning,
                priorityReasoning: finalPriorityReasoning,
                suggested: true
            }), {
                headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
                status: 200,
            })

        } catch (apiError: unknown) {
            const err = apiError as Error
            if (err.name === 'AbortError') {
                throw new Error("AI request timed out. Please try again.")
            }
            throw apiError
        }

    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error)

        // Return safe fallback with keyword-based priority detection (if inputs available)
        // Use requestBody values if they exist, otherwise use empty strings
        const titleForFallback = (typeof requestBody?.title === 'string') ? requestBody.title : ''
        const descForFallback = (typeof requestBody?.description === 'string') ? requestBody.description : ''
        const fallbackPriority = detectPriority(titleForFallback, descForFallback)

        return new Response(JSON.stringify({
            category: "General Maintenance",
            department: "General Facilities",
            priority: fallbackPriority.priority,
            confidence: 0,
            priorityConfidence: 0.5,
            reasoning: "AI categorization unavailable - using default",
            priorityReasoning: fallbackPriority.reason,
            suggested: false,
            error: errMsg || 'Internal server error'
        }), {
            headers: { ...corsHeaders(req.headers.get('origin') || ''), 'Content-Type': 'application/json' },
            status: 500
        })
    }
})
