const { GoogleGenAI } = require('@google/genai');

const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_OUTPUT_TOKENS = 400;
// Low: these are summaries of facts, not creative writing
const DEFAULT_TEMPERATURE = 0.2;

const TRANSIENT_RETRY_DELAY_MS = 700;

function isTransient(reason) {
  const text = String(reason).toLowerCase();
  return (
    text.includes('unavailable') ||
    text.includes('high demand') ||
    text.includes('overloaded') ||
    text.includes('503') ||
    text.includes('timeout')
  );
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class GeminiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeminiError';
  }
}

let client = null;

function modelName() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function isConfigured() {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
}

function getClient() {
  if (!isConfigured()) {
    throw new GeminiError(
      'Gemini is not configured on this server. Add GEMINI_API_KEY to server/.env to use this feature.'
    );
  }

  if (!client) {
    client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { timeout: Number(process.env.GEMINI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS },
    });
  }

  return client;
}


function toPlainText(value) {
  return value
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toGeminiError(reason) {
  const text = String(reason).toLowerCase();

  if (text.includes('timeout')) {
    return new GeminiError('Gemini did not respond in time. Please try again.');
  }


  if (text.includes('resource_exhausted') || text.includes('quota') || text.includes('rate limit')) {
    return new GeminiError('Gemini has reached its request limit for now. Please try again in a minute.');
  }

  return new GeminiError('Gemini could not be reached. Please try again later.');
}

function callModel({ systemInstruction, prompt }) {
  return getClient().models.generateContent({
    model: modelName(),
    contents: prompt,
    config: {
      systemInstruction,
      temperature: DEFAULT_TEMPERATURE,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      responseMimeType: 'text/plain',
    },
  });
}

async function generateText({ systemInstruction, prompt }) {
  let response;

  try {
    response = await callModel({ systemInstruction, prompt });
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error;
    }

    const reason = error?.message || 'unknown error';

    if (!isTransient(reason)) {
      console.warn('Gemini request failed:', reason.split('\n')[0]);
      throw toGeminiError(reason);
    }

    console.warn('Gemini request failed, retrying once:', reason.split('\n')[0]);
    await delay(TRANSIENT_RETRY_DELAY_MS);

    try {
      response = await callModel({ systemInstruction, prompt });
    } catch (retryError) {
      if (retryError instanceof GeminiError) {
        throw retryError;
      }

      const retryReason = retryError?.message || 'unknown error';
      console.warn('Gemini request failed again:', retryReason.split('\n')[0]);
      throw toGeminiError(retryReason);
    }
  }

  let text;
  try {
    text = response?.text;
  } catch (error) {
    console.warn('Gemini response could not be read:', error.message);
    throw new GeminiError('Gemini returned a response that could not be read.');
  }

  if (!text || !text.trim()) {
    throw new GeminiError('Gemini returned an empty response. Please try again.');
  }

  return { text: toPlainText(text.trim()), model: modelName() };
}

module.exports = {
  generateText,
  isConfigured,
  modelName,
  GeminiError,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
};
