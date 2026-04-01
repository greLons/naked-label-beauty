// api/analyze.js — Vercel serverless function
// This is now a FALLBACK proxy. The main app calls Gemini directly from the browser.
// Use this if you want to hide your API key on the server side in production.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'No prompt provided' });
  }

  // Try Gemini first (free), fall back to Anthropic if key is set
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty Gemini response');
      return res.status(200).json({ text });
    } catch (err) {
      if (!anthropicKey) return res.status(500).json({ error: err.message });
      // fall through to Anthropic
    }
  }

  if (anthropicKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });
      return res.status(200).json({ text: data.content[0].text });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY in Vercel env vars)' });
}
