/**
 * AI Service Client
 * Hybrid architecture: FREE Supabase Edge Function + PAID AI Gateway
 */

import { supabase } from '../lib/supabase';

const API_BASE = '/api';

/**
 * Generate text using AI Gateway
 * @param {string} prompt - The prompt to send
 * @param {string} model - Model to use (default: anthropic/claude-sonnet-4.6)
 * @returns {Promise<{text: string, model: string}>} Generated text
 */
export async function generateText(prompt, model = 'anthropic/claude-sonnet-4.6') {
  const response = await fetch(`${API_BASE}/ai/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, model }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to generate text');
  }

  return response.json();
}

/**
 * Fetch available AI models from the gateway
 * @returns {Promise<Array>} List of available models
 */
export async function fetchAvailableModels() {
  const response = await fetch(`${API_BASE}/ai/models`);

  if (!response.ok) {
    throw new Error('Failed to fetch models');
  }

  const data = await response.json();
  return data.models || [];
}

/**
 * Check AI service health
 * @returns {Promise<boolean>} Service status
 */
export async function checkAIService() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = await response.json();
    return data.services?.aiGateway === true;
  } catch {
    return false;
  }
}

/**
 * Predefined model options
 */
export const MODEL_OPTIONS = {
  CLAUDE_SONNET: 'anthropic/claude-sonnet-4.6',
  CLAUDE_HAIKU: 'anthropic/claude-haiku-4.6',
  GPT4O: 'openai/gpt-4o',
  GPT4O_MINI: 'openai/gpt-4o-mini',
};

/**
 * Get maintenance fix suggestion from AI - FREE TIER
 * Uses Supabase Edge Function with Google Gemini Flash
 * Cost: $0 (1,500 requests/day limit)
 * 
 * @param {string} ticketDescription - Description of the maintenance issue
 * @param {string} ticketCategory - Category of the ticket
 * @param {string} image_url - Optional image URL
 * @returns {Promise<{technical_diagnosis: string, tools_required: string[], safety_precaution: string}>} Fix suggestion
 */
export async function suggestFix(ticketDescription, ticketCategory = 'General', image_url = null) {
  const { data, error } = await supabase.functions.invoke('suggest-fix', {
    body: {
      ticketDescription,
      ticketCategory,
      image_url,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to get fix suggestion');
  }

  return data;
}

/**
 * Get maintenance fix suggestion from AI - PREMIUM TIER
 * Uses Vercel AI Gateway with Claude Sonnet (higher quality, costs money)
 * Use this if Gemini free tier is insufficient or for fallback
 * 
 * @param {string} ticketDescription - Description of the maintenance issue
 * @param {string} ticketCategory - Category of the ticket
 * @param {string} image_url - Optional image URL
 * @returns {Promise<{technical_diagnosis: string, tools_required: string[], safety_precaution: string}>} Fix suggestion
 */
export async function suggestFixViaGateway(ticketDescription, ticketCategory = 'General', image_url = null) {
  const body = { ticketDescription, ticketCategory };
  if (image_url) body.image_url = image_url;

  const response = await fetch(`${API_BASE}/ai/suggest-fix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get fix suggestion from AI Gateway');
  }

  return response.json();
}

/**
 * Smart suggest fix - tries FREE first, falls back to PAID if needed
 * @param {string} ticketDescription - Description of the maintenance issue
 * @param {string} ticketCategory - Category of the ticket
 * @param {string} image_url - Optional image URL
 * @param {boolean} preferGateway - If true, uses AI Gateway directly
 * @returns {Promise<{technical_diagnosis: string, tools_required: string[], safety_precaution: string, source: string}>} Fix suggestion with source info
 */
export async function smartSuggestFix(ticketDescription, ticketCategory = 'General', image_url = null, preferGateway = false) {
  if (preferGateway) {
    const result = await suggestFixViaGateway(ticketDescription, ticketCategory, image_url);
    return { ...result, source: 'ai-gateway' };
  }

  try {
    // Try free tier first
    const result = await suggestFix(ticketDescription, ticketCategory, image_url);
    return { ...result, source: 'gemini-free' };
  } catch {
    // If free tier fails (rate limit, etc.), fallback to AI Gateway
    if (import.meta.env.DEV) {
      console.warn('Free tier failed, falling back to AI Gateway');
    }
    const result = await suggestFixViaGateway(ticketDescription, ticketCategory, image_url);
    return { ...result, source: 'ai-gateway-fallback' };
  }
}
