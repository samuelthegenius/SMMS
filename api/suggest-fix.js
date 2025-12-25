/**
 * @file api/suggest-fix.js
 * @description Serverless Function to interface with Google's Gemini AI.
 * @author System Administrator
 * 
 * Architecture Note:
 * This function runs in a secure server-side environment (Vercel Edge/Serverless Function).
 * It securely executes Google Gemini AI requests server-side to prevent exposing the API Key to the client.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Generative AI client using the secure server-side environment variable.
const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);
// Select the 'gemini-pro' model for general-purpose text generation.
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

export default async function handler(req, res) {
  // Enforce HTTP Method Validation to strictly allow only POST requests.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticketDescription, category } = req.body;

  // Input Validation to ensure prompt integrity.
  if (!ticketDescription || !category) {
    return res.status(400).json({ error: 'Missing ticket description or category' });
  }

  // Role-Playing Prompt Engineering:
  // Configures the AI to adopt the persona of a senior maintenance supervisor.
  const prompt = `You are a senior maintenance supervisor advising a junior technician.
      Category: ${category}
      Issue: ${ticketDescription}
      Return a STRICT JSON object (no markdown formatting) with these fields:
      - technical_diagnosis: (A concise technical explanation of the fault)
      - tools_required: (Array of strings)
      - safety_precaution: (One critical safety warning starting with "WARNING:")`;

  try {
    // Execute the AI inference asynchronously.
    const result = await model.generateContent(prompt);
    const response = await result.response;

    // Response sanitization: Removing potential markdown code fences to parse pure JSON.
    let text = response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonResponse = JSON.parse(text);

    res.status(200).json(jsonResponse);
  } catch (error) {
    console.error('Error with Gemini API:', error);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
}
