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
    const result = await suggestFixViaGateway(ticketDescription, ticketCategory, image_url);
    return { ...result, source: 'ai-gateway-fallback' };
  }
}

/**
 * AI-Powered Ticket Categorization & Department Assignment - FREE TIER
 * Uses Supabase Edge Function with Gemini Flash (1,500 requests/day free)
 * 
 * @param {string} title - Ticket title
 * @param {string} description - Ticket description
 * @param {string} facilityType - Type of facility
 * @returns {Promise<{category: string, department: string, confidence: number, reasoning: string, suggested: boolean}>} Categorization result
 */
export async function categorizeTicket(title, description = '', facilityType = 'Other') {
  const { data, error } = await supabase.functions.invoke('categorize-ticket', {
    body: {
      title,
      description,
      facilityType,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to categorize ticket');
  }

  return data;
}

/**
 * AI-Powered Ticket Categorization - PREMIUM TIER (Fallback)
 * Uses Vercel AI Gateway when Supabase free tier is unavailable
 * 
 * @param {string} title - Ticket title
 * @param {string} description - Ticket description
 * @param {string} facilityType - Type of facility
 * @returns {Promise<{category: string, department: string, confidence: number, reasoning: string, suggested: boolean}>} Categorization result
 */
export async function categorizeTicketViaGateway(title, description = '', facilityType = 'Other') {
  const response = await fetch(`${API_BASE}/ai/categorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, description, facilityType }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to categorize ticket');
  }

  return response.json();
}

/**
 * Auto-categorize with fallback - tries Supabase (FREE) first, falls back to Vercel (PAID) if needed
 * Now includes priority assessment!
 * @param {string} title - Ticket title
 * @param {string} description - Ticket description
 * @param {string} facilityType - Type of facility
 * @param {number} confidenceThreshold - Minimum confidence to accept AI suggestion (default 0.7)
 * @param {number} priorityThreshold - Minimum confidence to accept AI priority (default 0.6)
 * @returns {Promise<{category: string, department: string, priority: string, confidence: number, priorityConfidence: number, autoAssigned: boolean, autoPriorityAssigned: boolean, reasoning: string, priorityReasoning: string}>}
 */
export async function autoCategorizeWithFallback(title, description = '', facilityType = 'Other', confidenceThreshold = 0.7, priorityThreshold = 0.6) {
  try {
    // Try free tier (Supabase Edge Function with Gemini) first
    const result = await categorizeTicket(title, description, facilityType);

    // Only auto-assign category if confidence is high enough
    const autoAssigned = result.confidence >= confidenceThreshold && result.suggested;
    // Auto-assign priority if confidence is high enough
    const autoPriorityAssigned = (result.priorityConfidence || 0) >= priorityThreshold && result.suggested;

    return {
      category: result.category,
      department: result.department,
      priority: result.priority,
      confidence: result.confidence,
      priorityConfidence: result.priorityConfidence || 0.5,
      autoAssigned,
      autoPriorityAssigned,
      reasoning: result.reasoning,
      priorityReasoning: result.priorityReasoning,
      source: 'gemini-free'
    };
  } catch {
    // Fallback to Vercel AI Gateway (paid)
    try {
      const result = await categorizeTicketViaGateway(title, description, facilityType);
      const autoAssigned = result.confidence >= confidenceThreshold && result.suggested;
      const autoPriorityAssigned = (result.priorityConfidence || 0) >= priorityThreshold && result.suggested;

      return {
        category: result.category,
        department: result.department,
        priority: result.priority,
        confidence: result.confidence,
        priorityConfidence: result.priorityConfidence || 0.5,
        autoAssigned,
        autoPriorityAssigned,
        reasoning: result.reasoning,
        priorityReasoning: result.priorityReasoning,
        source: 'ai-gateway-fallback'
      };
    } catch {
      // Return defaults with keyword-based priority detection
      const keywordPriority = detectPriorityFromText(title, description);
      return {
        category: null,
        department: null,
        priority: keywordPriority.priority,
        confidence: 0,
        priorityConfidence: 0.5,
        autoAssigned: false,
        autoPriorityAssigned: false,
        reasoning: 'AI categorization unavailable',
        priorityReasoning: keywordPriority.reason,
        source: 'failed'
      };
    }
  }
}

// Keyword-based priority detection (client-side fallback)
function detectPriorityFromText(title, description) {
  const text = (title + ' ' + description).toLowerCase();

  const highKeywords = [
    'emergency', 'urgent', 'critical', 'dangerous', 'hazard', 'safety', 'fire', 'flood', 'leak', 'water leak',
    'power outage', 'no electricity', 'electrical hazard', 'shock', 'sparking', 'smoke', 'burning',
    'gas leak', 'carbon monoxide', 'broken glass', 'injury', 'fallen', 'collapsed', 'blocked exit',
    'no heat', 'no heating', 'freezing', 'extreme cold', 'no ac', 'no cooling', 'extreme heat',
    'security', 'intruder', 'break-in', 'theft', 'vandalism', 'broken lock', 'door stuck'
  ];

  const highMatches = highKeywords.filter(kw => text.includes(kw.toLowerCase()));
  if (highMatches.length > 0) {
    return { priority: 'High', reason: `Urgency detected: ${highMatches[0]}` };
  }

  return { priority: 'Medium', reason: 'No urgent indicators detected' };
}

// ============================================================================
// AI CHAT ASSISTANT FUNCTIONS
// ============================================================================

/**
 * Send a message to the AI chat assistant
 * @param {string} ticketId - The ticket ID for context
 * @param {string} message - The user's message
 * @param {Array} chatHistory - Recent chat history for context
 * @returns {Promise<{response: string, message_id: string, context: object}>}
 */
export async function askAIAssistant(ticketId, message, chatHistory = []) {
  const { data, error } = await supabase.functions.invoke('ai-chat-assistant', {
    body: {
      ticket_id: ticketId,
      message,
      chat_history: chatHistory,
      action: 'chat',
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to get AI response');
  }

  return data;
}

/**
 * Get AI fix suggestion for a ticket via chat interface
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<{suggestion: string}>}
 */
export async function getAIFixSuggestion(ticketId) {
  const { data, error } = await supabase.functions.invoke('ai-chat-assistant', {
    body: {
      ticket_id: ticketId,
      message: 'suggest_fix',
      action: 'suggest_fix',
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to get AI fix suggestion');
  }

  return data;
}

/**
 * Summarize chat history with AI
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<{summary: string}>}
 */
export async function summarizeChat(ticketId) {
  const { data, error } = await supabase.functions.invoke('ai-chat-assistant', {
    body: {
      ticket_id: ticketId,
      action: 'summarize',
      message: 'Summarize chat',
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to summarize chat');
  }

  return data;
}

/**
 * Smart AI chat with fallback
 * Tries Supabase Edge Function first, falls back to API route if needed
 * @param {string} ticketId - The ticket ID
 * @param {string} message - The user's message
 * @param {Array} chatHistory - Recent chat history
 * @param {boolean} preferGateway - Use AI Gateway directly
 * @returns {Promise<{response: string, source: string}>}
 */
export async function smartAIChat(ticketId, message, chatHistory = [], preferGateway = false) {
  if (preferGateway) {
    // Use API route directly
    const response = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ticketId, message, chatHistory }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to get AI response');
    }

    const result = await response.json();
    return { ...result, source: 'ai-gateway' };
  }

  try {
    // Try free tier first
    const result = await askAIAssistant(ticketId, message, chatHistory);
    return { ...result, source: 'gemini-free' };
  } catch {
    // Fallback to API route
    try {
      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ticketId, message, chatHistory }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to get AI response');
      }

      const result = await response.json();
      return { ...result, source: 'api-fallback' };
    } catch {
      throw new Error('AI assistant temporarily unavailable');
    }
  }
}

// ============================================================================
// TICKET MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Update ticket category with AI suggestion
 * @param {string} ticketId - The ticket ID
 * @param {string} newCategory - New category
 * @param {string} reason - Reason for change
 * @param {string} aiSuggestion - AI suggestion context
 * @returns {Promise<{success: boolean, ticket: object, new_repair_guide?: object}>}
 */
export async function updateTicketCategory(ticketId, newCategory, reason = '', aiSuggestion = '') {
  const response = await fetch(`${API_BASE}/tickets`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: ticketId,
      category: newCategory,
      reason,
      ai_suggestion: aiSuggestion,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update ticket category');
  }

  return response.json();
}

/**
 * Update ticket priority
 * @param {string} ticketId - The ticket ID
 * @param {string} newPriority - New priority (Low, Medium, High)
 * @param {string} reason - Reason for change
 * @returns {Promise<{success: boolean, ticket: object}>}
 */
export async function updateTicketPriority(ticketId, newPriority, reason = '') {
  const response = await fetch(`${API_BASE}/tickets`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: ticketId,
      priority: newPriority,
      reason,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update ticket priority');
  }

  return response.json();
}

/**
 * Update ticket status
 * @param {string} ticketId - The ticket ID
 * @param {string} newStatus - New status
 * @param {string} reason - Reason for change
 * @returns {Promise<{success: boolean, ticket: object}>}
 */
export async function updateTicketStatus(ticketId, newStatus, reason = '') {
  const response = await fetch(`${API_BASE}/tickets`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: ticketId,
      status: newStatus,
      reason,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update ticket status');
  }

  return response.json();
}

/**
 * Get AI suggestion for ticket categorization
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<{suggestion: string, action_type: string}>}
 */
export async function getAICategorizationSuggestion(ticketId) {
  const { data, error } = await supabase.functions.invoke('ai-chat-assistant', {
    body: {
      ticket_id: ticketId,
      action: 'suggest_categorization',
      message: 'Suggest categorization',
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to get AI categorization suggestion');
  }

  return data;
}

/**
 * Get AI suggestion for status change
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<{suggestion: string, action_type: string}>}
 */
export async function getAIStatusSuggestion(ticketId) {
  const { data, error } = await supabase.functions.invoke('ai-chat-assistant', {
    body: {
      ticket_id: ticketId,
      action: 'suggest_status_change',
      message: 'Suggest status change',
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to get AI status suggestion');
  }

  return data;
}

/**
 * Get AI suggestion for priority change
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<{suggestion: string, action_type: string}>}
 */
export async function getAIPrioritySuggestion(ticketId) {
  const { data, error } = await supabase.functions.invoke('ai-chat-assistant', {
    body: {
      ticket_id: ticketId,
      action: 'suggest_priority',
      message: 'Suggest priority',
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to get AI priority suggestion');
  }

  return data;
}
