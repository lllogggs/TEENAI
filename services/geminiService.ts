export const GeminiService = {
  chat: async () => {
    throw new Error('Client-side Gemini access is disabled. Use /api/chat serverless endpoint instead.');
  },
};
