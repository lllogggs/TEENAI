const GEMINI_KEY_CANDIDATES = [
  process.env.GEMINI_API_KEY,
  process.env.GOOGLE_API_KEY,
  process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  process.env.NEXT_PUBLIC_GEMINI_API_KEY,
  process.env.VITE_GEMINI_API_KEY,
];

export const getGeminiApiKey = () => {
  for (const candidate of GEMINI_KEY_CANDIDATES) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
};

export const getGeminiApiKeyOrThrow = () => {
  const key = getGeminiApiKey();
  if (!key) {
    throw new Error('Missing Gemini API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY).');
  }
  return key;
};
