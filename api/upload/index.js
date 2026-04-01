import { put, del, list } from '@vercel/blob';
import { waitUntil } from '@vercel/functions';
import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Blob Upload API
 * Handles file uploads using Vercel Blob storage with security checks
 * 
 * POST /api/upload - Upload a file
 * GET /api/upload - List files (admin only)
 * DELETE /api/upload - Delete a file
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
};

// File upload constraints
const FILE_CONSTRAINTS = {
  maxSize: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  dangerousPatterns: [
    /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i,
    /\.php$/i, /\.asp$/i, /\.jsp$/i, /\.sh$/i,
    /\.com$/i, /\.pif$/i, /\.vbs$/i, /\.js$/i,
    /\.jar$/i, /\.app$/i, /\.deb$/i, /\.rpm$/i,
  ]
};

// Rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_UPLOADS_PER_MINUTE = 5;

// Get CORS headers
function getCorsHeaders(origin) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : null;
  return {
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
    return { allowed: true };
  }
  
  if (clientData.count >= MAX_UPLOADS_PER_MINUTE) {
    return { allowed: false };
  }
  
  clientData.count++;
  return { allowed: true };
}

// Validate filename
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return { valid: false, error: 'Invalid filename' };
  }
  
  // Check for path traversal
  if (filename.includes('../') || filename.includes('..\\') || filename.includes('%2e%2e')) {
    return { valid: false, error: 'Invalid filename: path traversal detected' };
  }
  
  // Check for null bytes
  if (filename.includes('\x00')) {
    return { valid: false, error: 'Invalid filename' };
  }
  
  // Check extension
  const lowerFilename = filename.toLowerCase();
  const hasAllowedExt = FILE_CONSTRAINTS.allowedExtensions.some(ext => 
    lowerFilename.endsWith(ext)
  );
  
  if (!hasAllowedExt) {
    return { valid: false, error: 'Invalid file type. Allowed: JPG, PNG, WEBP, GIF' };
  }
  
  // Check for dangerous patterns
  for (const pattern of FILE_CONSTRAINTS.dangerousPatterns) {
    if (pattern.test(lowerFilename)) {
      return { valid: false, error: 'Invalid file type' };
    }
  }
  
  return { valid: true };
}

// Validate MIME type
function validateMimeType(contentType) {
  if (!contentType) return false;
  return FILE_CONSTRAINTS.allowedMimeTypes.includes(contentType.toLowerCase());
}

// Extract and validate auth token from request
async function validateAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid authorization header' };
  }
  
  const token = authHeader.substring(7);
  if (!token) {
    return { valid: false, error: 'Missing token' };
  }
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Upload API missing server-side Supabase configuration');
      }
      return { valid: false, error: 'Upload service misconfigured' };
    }

    // Create a Supabase client to validate the token
    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        }
      }
    );
    
    // Verify the token by getting the user
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return { valid: false, error: 'Invalid or expired token' };
    }
    
    return { valid: true, userId: user.id, user };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Auth validation error:', error);
    }
    return { valid: false, error: 'Authentication failed' };
  }
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

  // Rate limiting based on IP
  const clientId = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const rateLimit = checkRateLimit(clientId);
  
  if (!rateLimit.allowed) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    switch (req.method) {
      case 'POST':
        return await handleUpload(req, res);
      case 'GET':
        return await handleList(req, res);
      case 'DELETE':
        return await handleDelete(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Blob API error:', error);
    }
    return res.status(500).json({ 
      error: 'Internal server error',
    });
  }
}

async function handleUpload(req, res) {
  // Validate authentication
  const auth = await validateAuth(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }

  const { filename, content, contentType = 'application/octet-stream' } = req.body;

  if (!filename || !content) {
    return res.status(400).json({ error: 'Filename and content are required' });
  }

  // Validate filename
  const filenameValidation = validateFilename(filename);
  if (!filenameValidation.valid) {
    return res.status(400).json({ error: filenameValidation.error });
  }

  // Validate content type
  if (!validateMimeType(contentType)) {
    return res.status(400).json({ error: 'Invalid content type. Allowed: image/jpeg, image/png, image/webp, image/gif' });
  }

  // Check content size (base64 encoded)
  const contentSize = Buffer.from(content, 'base64').length;
  if (contentSize > FILE_CONSTRAINTS.maxSize) {
    return res.status(413).json({ error: 'File size exceeds 5MB limit' });
  }

  try {
    // Generate a safe filename with user prefix to prevent collisions
    const safeFilename = `${auth.userId.slice(0, 8)}_${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    
    const buffer = Buffer.from(content, 'base64');
    
    const blob = await put(safeFilename, buffer, {
      contentType,
      access: 'public',
    });

    return res.status(200).json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      contentDisposition: blob.contentDisposition,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Upload error:', error);
    }
    return res.status(500).json({ error: 'Failed to upload file' });
  }
}

async function handleList(req, res) {
  // Validate authentication
  const auth = await validateAuth(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }

  try {
    const { blobs, cursor } = await list({
      limit: 100,
      cursor: req.query.cursor,
    });

    return res.status(200).json({
      files: blobs,
      cursor,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('List error:', error);
    }
    return res.status(500).json({ error: 'Failed to list files' });
  }
}

async function handleDelete(req, res) {
  // Validate authentication
  const auth = await validateAuth(req);
  if (!auth.valid) {
    return res.status(401).json({ error: auth.error });
  }

  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'File URL is required' });
  }

  // Validate URL format
  try {
    const urlObj = new URL(url);
    // Only allow blob URLs from vercel storage
    if (!urlObj.hostname.endsWith('.public.blob.vercel-storage.com') && 
        !urlObj.hostname.endsWith('.vercel-storage.com')) {
      return res.status(400).json({ error: 'Invalid URL' });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    await del(url);
    
    // Use waitUntil for any post-delete cleanup
    waitUntil(
      Promise.resolve().then(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`File deleted: ${url}`);
        }
      })
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Delete error:', error);
    }
    return res.status(500).json({ error: 'Failed to delete file' });
  }
}
