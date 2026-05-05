const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.post('/read-receipt', async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: 'זוהי קבלה. חלץ ותחזיר JSON בלבד ללא markdown: {"date":"YYYY-MM-DD","amount":123.45,"description":"שם העסק","items":"פריטים"}. אם שדה לא ברור השתמש ב-null.' }
          ]
        }]
      })
    });

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); } catch(e) { return res.status(500).json({ error: 'Bad Anthropic response: ' + rawText.slice(0,300) }); }
    if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });

    const text = (data.content || []).map(c => c.text || '').join('');
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g,'').trim()); } catch(e) { return res.status(500).json({ error: 'Parse error: ' + text.slice(0,200) }); }

    res.json(parsed);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.send('gan-api ok'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('listening on', PORT));
