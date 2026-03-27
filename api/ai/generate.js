import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { sanitizeInput } from '../../src/config/security.js';

/**
 * AI Gateway API Route
 * Uses Vercel AI Gateway for model routing with proper model fetching
 * Requires AI_GATEWAY_API_KEY environment variable
 */

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.PUBLIC_APP_URL,
  process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null,
].filter(Boolean);

// Rate limiting store (in production, use Redis or database)
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 10;

// Fetch available models from AI Gateway
async function fetchAvailableModels() {
  try {
    const response = await fetch('https://ai-gateway.vercel.sh/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch models');
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching models:', error);
    }
    return [];
  }
}

// Create provider with AI Gateway
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
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin || '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

// Security headers
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none';",
};

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

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
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
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  // Check content type
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    return res.status(400).json({ error: 'Invalid content type' });
  }

  // Check request size (prevent large payload attacks)
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > 10000) { // 10KB limit
    return res.status(413).json({ error: 'Request entity too large' });
  }

  try {
    const { prompt, model = 'anthropic/claude-sonnet-4.6' } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required and must be a string' });
    }

    // Sanitize and validate prompt
    const trimmedPrompt = prompt.trim();
    if (trimmedPrompt.length === 0) {
      return res.status(400).json({ error: 'Prompt cannot be empty' });
    }
    if (trimmedPrompt.length > 4000) {
      return res.status(400).json({ error: 'Prompt exceeds maximum length of 4000 characters' });
    }

    // Additional prompt sanitization to prevent prompt injection
    const sanitizedPrompt = sanitizeInput(trimmedPrompt, 'text');

    if (!process.env.AI_GATEWAY_API_KEY) {
      return res.status(500).json({ error: 'Service temporarily unavailable' });
    }

    const provider = createAIGatewayProvider();
    
    const { text } = await generateText({
      model: provider.chatModel(model),
      prompt: sanitizedPrompt,
      maxTokens: 2000,
    });

    return res.status(200).json({ 
      text,
      model,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('AI Gateway error:', error);
    }
    return res.status(500).json({ 
      error: 'Failed to generate response',
    });
  }
}

// GET /api/ai/models - List available models
export async function modelsHandler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const models = await fetchAvailableModels();
    return res.status(200).json({ models });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error listing models:', error);
    }
    return res.status(500).json({ error: 'Failed to fetch models' });
  }
}
