import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

/**
 * AI-Powered Ticket Categorization & Department Assignment
 * 
 * POST /api/ai/categorize
 * 
 * Body: {
 *   title: string,
 *   description: string,
 *   facilityType?: string
 * }
 * 
 * Response: {
 *   category: string,
 *   department: string,
 *   confidence: number,
 *   reasoning: string
 * }
 */

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.PUBLIC_APP_URL,
  process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null,
].filter(Boolean);

// Security headers
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
};

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 15;

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
];

// Category to Department mapping
const CATEGORY_TO_DEPARTMENT = {
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
};

// Facility context hints
const FACILITY_CONTEXT = {
  "Hostel": "Student residential accommodation",
  "Lecture Hall": "Educational teaching space",
  "Laboratory": "Scientific/technical research space",
  "Office": "Administrative workspace",
  "Sports Complex": "Athletic and recreational facility",
  "Chapel": "Religious worship space",
  "Staff Quarters": "Staff residential housing",
  "Cafeteria": "Food service and dining area",
  "Other": "General facility"
};

// Create AI Gateway provider
function createAIGatewayProvider() {
  return createOpenAICompatible({
    name: 'vercel-ai-gateway',
    baseURL: 'https://ai-gateway.vercel.sh/v1',
    headers: {
      'Authorization': `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
    },
  });
}

// Get CORS headers
function getCorsHeaders(origin) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Rate limit check
function checkRateLimit(clientId) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  
  for (const [key, data] of requestCounts.entries()) {
    if (data.timestamp < windowStart) {
      requestCounts.delete(key);
    }
  }
  
  const clientData = requestCounts.get(clientId);
  if (!clientData || clientData.timestamp < windowStart) {
    requestCounts.set(clientId, { count: 1, timestamp: now });
    return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - 1 };
  }
  
  if (clientData.count >= MAX_REQUESTS_PER_MINUTE) {
    return { allowed: false, remaining: 0 };
  }
  
  clientData.count++;
  return { allowed: true, remaining: MAX_REQUESTS_PER_MINUTE - clientData.count };
}

// Input sanitization
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '')
    .substring(0, 2000);
}

// Parse AI response
function parseCategorizationResponse(text) {
  const result = {
    category: null,
    confidence: 0.8,
    reasoning: ''
  };
  
  try {
    // Try to find category in response
    const categoryMatch = text.match(/Category:\s*(.+)/i);
    if (categoryMatch) {
      const extracted = categoryMatch[1].trim();
      // Find closest valid category
      result.category = VALID_CATEGORIES.find(c => 
        c.toLowerCase() === extracted.toLowerCase() ||
        extracted.toLowerCase().includes(c.toLowerCase()) ||
        c.toLowerCase().includes(extracted.toLowerCase().split(' ')[0])
      ) || "General Maintenance";
    }
    
    // Extract confidence
    const confidenceMatch = text.match(/Confidence:\s*(\d+)/i);
    if (confidenceMatch) {
      result.confidence = Math.min(1, Math.max(0, parseInt(confidenceMatch[1]) / 100));
    }
    
    // Extract reasoning
    const reasoningMatch = text.match(/Reasoning:\s*(.+)/is);
    if (reasoningMatch) {
      result.reasoning = reasoningMatch[1].trim().substring(0, 200);
    }
    
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Parse error:', error);
    }
  }
  
  // Default fallback
  if (!result.category) {
    result.category = "General Maintenance";
    result.reasoning = "Default categorization applied";
  }
  
  return result;
}

// Determine department from category
function getDepartmentForCategory(category) {
  return CATEGORY_TO_DEPARTMENT[category] || "General Facilities";
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'CORS origin forbidden' });
  }

  const corsHeaders = getCorsHeaders(origin);
  
  Object.entries({ ...corsHeaders, ...SECURITY_HEADERS }).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientId = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientId);
  
  if (!rateLimit.allowed) {
    return res.status(429).json({ 
      error: 'Too many requests. Please try again later.',
      retryAfter: 60
    });
  }

  // Check content type
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return res.status(400).json({ error: 'Invalid content type. Expected application/json' });
  }

  // Check request size
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 10000) { // 10KB limit
    return res.status(413).json({ error: 'Request entity too large' });
  }

  try {
    const { title, description, facilityType } = req.body;

    // Validate inputs
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title is required and must be a string' });
    }

    const sanitizedTitle = sanitizeInput(title);
    const sanitizedDescription = sanitizeInput(description || '');
    const sanitizedFacility = sanitizeInput(facilityType || 'Other');

    if (sanitizedTitle.length < 3) {
      return res.status(400).json({ error: 'Title too short (min 3 characters)' });
    }

    if (!process.env.AI_GATEWAY_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    const facilityContext = FACILITY_CONTEXT[sanitizedFacility] || FACILITY_CONTEXT['Other'];

    // Build categorization prompt
    const systemPrompt = `You are a facility maintenance categorization expert. Analyze maintenance requests and categorize them accurately.

Available categories:
${VALID_CATEGORIES.map(c => `- ${c}`).join('\n')}

Respond in this exact format:
Category: [exact category name from list]
Confidence: [0-100]
Reasoning: [brief explanation in 1-2 sentences]`;

    const userPrompt = `Facility Type: ${sanitizedFacility} (${facilityContext})
Title: ${sanitizedTitle}
Description: ${sanitizedDescription || 'No description provided'}

Categorize this maintenance request:`;

    const provider = createAIGatewayProvider();
    
    // Use fast, cheap model for categorization
    const { text } = await generateText({
      model: provider.chatModel('anthropic/claude-sonnet-4-6'),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      maxTokens: 300,
      temperature: 0.1, // Low temperature for consistent categorization
    });

    // Parse the response
    const categorization = parseCategorizationResponse(text);
    const department = getDepartmentForCategory(categorization.category);

    return res.status(200).json({
      category: categorization.category,
      department: department,
      confidence: categorization.confidence,
      reasoning: categorization.reasoning,
      suggested: true
    });

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Categorization error:', error);
    }
    
    // Return safe fallback
    return res.status(500).json({ 
      category: "General Maintenance",
      department: "General Facilities",
      confidence: 0,
      reasoning: "AI categorization unavailable - using default",
      suggested: false,
      error: 'Failed to categorize'
    });
  }
}
