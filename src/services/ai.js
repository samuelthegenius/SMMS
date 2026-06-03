/**
 * AI Service Client
 * Uses Supabase Edge Functions for all AI features (free tier via Gemini Flash)
 */

import { supabase } from '../lib/supabase';


/**
 * Get maintenance fix suggestion from AI
 * Uses Supabase Edge Function with Google Gemini Flash (free tier, 1,500 requests/day)
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
 * AI-Powered Ticket Categorization & Department Assignment
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
 * Auto-categorize ticket - uses Supabase Edge Function (Gemini Flash, free tier)
 * Includes priority assessment.
 * @param {string} title - Ticket title
 * @param {string} description - Ticket description
 * @param {string} facilityType - Type of facility
 * @param {number} confidenceThreshold - Minimum confidence to accept AI suggestion (default 0.7)
 * @param {number} priorityThreshold - Minimum confidence to accept AI priority (default 0.6)
 * @returns {Promise<{category: string, department: string, priority: string, confidence: number, priorityConfidence: number, autoAssigned: boolean, autoPriorityAssigned: boolean, reasoning: string, priorityReasoning: string}>}
 */
export async function autoCategorizeWithFallback(title, description = '', facilityType = 'Other', confidenceThreshold = 0.7, priorityThreshold = 0.6) {
  try {
    const result = await categorizeTicket(title, description, facilityType);

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
      source: 'gemini-free'
    };
  } catch {
    // Fall back to keyword-based priority detection on failure
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
 * Smart AI chat - uses Supabase Edge Function (free Gemini tier)
 * @param {string} ticketId - The ticket ID
 * @param {string} message - The user's message
 * @param {Array} chatHistory - Recent chat history
 * @returns {Promise<{response: string, source: string}>}
 */
export async function smartAIChat(ticketId, message, chatHistory = []) {
  try {
    const result = await askAIAssistant(ticketId, message, chatHistory);
    return { ...result, source: 'gemini-free' };
  } catch {
    throw new Error('AI assistant temporarily unavailable');
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
