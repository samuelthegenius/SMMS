import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';

/**
 * AI-Powered Maintenance Fix Suggestion API
 * Uses Vercel AI Gateway for optimal performance and reliability
 * 
 * POST /api/ai/suggest-fix
 * 
 * Body: {
 *   ticketDescription: string,
 *   ticketCategory: string,
 *   image_url?: string (optional)
 * }
 * 
 * Response: {
 *   technical_diagnosis: string,
 *   tools_required: string[],
 *   safety_precaution: string
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
const MAX_REQUESTS_PER_MINUTE = 10;

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
  
  // Clean up old entries
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
    .replace(/ignore previous|system prompt|you are/gi, '')
    .replace(/[<>]/g, '')
    .substring(0, 2000);
}

// Validate image URL
function validateImageUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:' && 
           (urlObj.hostname.includes('supabase.co') || 
            urlObj.hostname.includes('vercel-storage.com'));
  } catch {
    return false;
  }
}

// Fetch and encode image
async function fetchAndEncodeImage(imageUrl) {
  try {
    const response = await fetch(imageUrl, {
      headers: { 'Accept': 'image/*' },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error('Invalid content type');
    }
    
    const buffer = Buffer.from(await response.arrayBuffer());
    
    // Check size (max 5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error('Image too large');
    }
    
    // Convert to base64
    const base64 = buffer.toString('base64');
    return { data: base64, mimeType: contentType };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Image fetch error:', error);
    }
    return null;
  }
}

// Parse structured response
function parseStructuredResponse(text) {
  const result = {
    technical_diagnosis: '',
    tools_required: [],
    safety_precaution: ''
  };
  
  try {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    
    let currentSection = '';
    let diagnosisText = '';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      
      if (lowerLine.includes('technical diagnosis:')) {
        diagnosisText = line.replace(/technical diagnosis:/gi, '').trim();
        let j = i + 1;
        while (j < lines.length && 
               !lines[j].toLowerCase().includes('tools required:') && 
               !lines[j].toLowerCase().includes('safety precaution:')) {
          diagnosisText += ' ' + lines[j].trim();
          j++;
        }
        result.technical_diagnosis = diagnosisText.trim();
        i = j - 1;
      } else if (lowerLine.includes('tools required:')) {
        currentSection = 'tools';
      } else if (lowerLine.includes('safety precaution:')) {
        result.safety_precaution = line.replace(/safety precaution:/gi, '').trim();
        currentSection = 'safety';
      } else if ((line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) && currentSection === 'tools') {
        const tool = line.replace(/^[•\-*]\s*/, '').trim();
        if (tool) result.tools_required.push(tool);
      }
    }
    
    // Validation and fallbacks
    if (!result.technical_diagnosis) {
      result.technical_diagnosis = 'Technical issue identified - analysis in progress.';
    }
    if (result.tools_required.length === 0) {
      result.tools_required = ['Basic toolkit', 'Safety equipment', 'Testing devices'];
    }
    if (!result.safety_precaution) {
      result.safety_precaution = 'WARNING: Always follow proper safety procedures.';
    }
    
    // Ensure safety warning prefix
    if (!result.safety_precaution.toUpperCase().startsWith('WARNING:')) {
      result.safety_precaution = `WARNING: ${result.safety_precaution}`;
    }
    
    // Clean up lengths
    result.technical_diagnosis = result.technical_diagnosis.substring(0, 500);
    result.tools_required = result.tools_required.slice(0, 10);
    result.safety_precaution = result.safety_precaution.substring(0, 200);
    
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Parse error:', error);
    }
    // Fallback response
    result.technical_diagnosis = 'Maintenance issue detected. Professional assessment required.';
    result.tools_required = ['Basic tools', 'Safety equipment', 'Testing devices'];
    result.safety_precaution = 'WARNING: Always follow proper safety procedures.';
  }
  
  return result;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'CORS origin forbidden' });
  }

  const corsHeaders = getCorsHeaders(origin);
  
  // Set CORS and security headers
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
  if (contentLength > 50000) { // 50KB limit
    return res.status(413).json({ error: 'Request entity too large' });
  }

  try {
    const { ticketDescription, ticketCategory, image_url } = req.body;

    // Validate inputs
    if (!ticketDescription || typeof ticketDescription !== 'string') {
      return res.status(400).json({ error: 'ticketDescription is required and must be a string' });
    }

    const sanitizedDescription = sanitizeInput(ticketDescription);
    const sanitizedCategory = sanitizeInput(ticketCategory || 'General');

    if (sanitizedDescription.length < 10) {
      return res.status(400).json({ error: 'Ticket description too short (min 10 characters)' });
    }

    if (!process.env.AI_GATEWAY_API_KEY) {
      return res.status(500).json({ error: 'AI service not configured' });
    }

    // Build the prompt
    const systemPrompt = 'You are a senior maintenance supervisor advising a junior technician.';
    const userPrompt = `Analyze this maintenance issue:
Category: ${sanitizedCategory}
Description: ${sanitizedDescription}

Provide a response in this exact format:

Technical Diagnosis: [your technical explanation here]

Tools Required:
• [tool 1]
• [tool 2]
• [tool 3]

Safety Precaution: WARNING: [your safety warning here]

Keep responses concise and professional.`;

    // Prepare messages
    let messages = [{ role: 'system', content: systemPrompt }];
    
    // Handle image if provided
    if (image_url && !validateImageUrl(image_url)) {
      return res.status(400).json({
        error: 'Invalid image URL. Only HTTPS URLs from Supabase or Vercel Blob are allowed.'
      });
    }

    if (image_url) {
      const imageData = await fetchAndEncodeImage(image_url);
      if (imageData) {
        messages.push({
          role: 'user',
          content: [
            { type: 'image', image: `data:${imageData.mimeType};base64,${imageData.data}` },
            { type: 'text', text: userPrompt }
          ]
        });
      } else {
        return res.status(400).json({
          error: 'Could not process provided image. Please upload a valid image and try again.'
        });
      }
    } else {
      messages.push({ role: 'user', content: userPrompt });
    }

    // Use AI Gateway
    const provider = createAIGatewayProvider();
    
    // Best model for structured maintenance analysis: Claude Sonnet
    const { text } = await generateText({
      model: provider.chatModel('anthropic/claude-sonnet-4-6'),
      messages,
      maxTokens: 1000,
      temperature: 0.3,
    });

    // Parse structured response
    const result = parseStructuredResponse(text);

    return res.status(200).json(result);

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Suggest-fix error:', error);
    }
    
    // Determine appropriate status code
    const statusCode = error.message?.includes('safety') ? 403 : 
                       error.message?.includes('timeout') ? 504 : 500;
    
    return res.status(statusCode).json({ 
      error: 'Failed to generate suggestion',
      technical_diagnosis: 'Analysis temporarily unavailable.',
      tools_required: ['Basic toolkit', 'Safety equipment'],
      safety_precaution: 'WARNING: Always follow proper safety procedures.'
    });
  }
}
