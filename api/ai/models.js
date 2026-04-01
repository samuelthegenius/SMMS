/**
 * GET /api/ai/models
 * List available AI models from Vercel AI Gateway
 */

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.PUBLIC_APP_URL,
  process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : null,
].filter(Boolean);

// Get CORS headers
function getCorsHeaders(origin) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
};

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 20;

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
    return { allowed: true };
  }
  
  if (clientData.count >= MAX_REQUESTS_PER_MINUTE) {
    return { allowed: false };
  }
  
  clientData.count++;
  return { allowed: true };
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientId = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientId);
  
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests' });
  }

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
    
    return res.status(200).json({ 
      models: data.data || [],
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching models:', error);
    }
    return res.status(500).json({ 
      error: 'Failed to fetch models',
    });
  }
}
