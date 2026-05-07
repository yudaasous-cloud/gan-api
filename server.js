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
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 }
            },
            {
              type: 'text',
              text: `׳–׳•׳”׳™ ׳§׳‘׳׳” ׳׳• ׳—׳©׳‘׳•׳ ׳™׳×. ׳§׳¨׳ ׳׳•׳×׳” ׳‘׳¢׳™׳•׳ ׳•׳”׳—׳–׳¨ JSON ׳‘׳׳‘׳“, ׳׳׳ markdown, ׳׳׳ ׳”׳¡׳‘׳¨׳™׳, ׳׳׳ ׳˜׳§׳¡׳˜ ׳ ׳•׳¡׳£.

׳₪׳•׳¨׳׳˜ ׳׳“׳•׳™׳§:
{"date":"YYYY-MM-DD","amount":0.00,"description":"׳©׳ ׳”׳¢׳¡׳§","items":"׳₪׳¨׳™׳˜ ׳, ׳₪׳¨׳™׳˜ ׳‘, ׳₪׳¨׳™׳˜ ׳’"}

׳”׳ ׳—׳™׳•׳× ׳׳›׳ ׳©׳“׳”:

date ג€” ׳×׳׳¨׳™׳ ׳”׳§׳‘׳׳” ׳‘׳₪׳•׳¨׳׳˜ YYYY-MM-DD ׳‘׳׳‘׳“.
  ׳“׳•׳’׳׳׳•׳×: 17/04/2026 ג†’ "2026-04-17" | 09/02/26 ג†’ "2026-02-09"

amount ג€” ׳”׳¡׳›׳•׳ ׳”׳›׳•׳׳ ׳׳×׳©׳׳•׳ ׳›׳׳¡׳₪׳¨ ׳¢׳©׳¨׳•׳ ׳™ ׳‘׳׳‘׳“ (׳׳ ׳׳—׳¨׳•׳–׳×).
  ׳—׳₪׳©: "׳׳×׳©׳׳•׳", "׳¡׳”׳´׳›", "total", "׳¡׳›׳•׳". ׳“׳•׳’׳׳”: 44.04

description ג€” ׳©׳ ׳”׳¢׳¡׳§ ׳‘׳“׳™׳•׳§ ׳›׳₪׳™ ׳©׳›׳×׳•׳‘ ׳‘׳¨׳׳© ׳”׳§׳‘׳׳”.
  ׳›׳׳•׳ ׳¡׳™׳•׳׳•׳× ׳›׳׳• ׳‘׳¢"׳ / ׳‘׳¢"׳© / ׳‘׳¢"׳¨.
  ׳׳ ׳×׳•׳¡׳™׳£ ׳›׳×׳•׳‘׳×, ׳׳ ׳×׳©׳ ׳”, ׳׳ ׳×׳₪׳¨׳© ג€” ׳”׳¢׳×׳§ ׳‘׳“׳™׳•׳§.

items ג€” ׳¨׳©׳™׳׳× ׳©׳׳•׳× ׳”׳₪׳¨׳™׳˜׳™׳ ׳©׳ ׳¨׳›׳©׳•, ׳׳•׳₪׳¨׳“׳™׳ ׳‘׳₪׳¡׳™׳§.
  ׳—׳©׳•׳‘ ׳׳׳•׳“: ׳–׳” ׳—׳™׳™׳‘ ׳׳”׳™׳•׳× ׳׳—׳¨׳•׳–׳× ׳˜׳§׳¡׳˜ ׳¨׳’׳™׳׳” ׳‘׳׳‘׳“ ג€” ׳׳ ׳׳¢׳¨׳, ׳׳ ׳׳•׳‘׳™׳™׳§׳˜ JSON.
  ׳“׳•׳’׳׳” ׳ ׳›׳•׳ ׳”: "׳©׳•׳§׳•׳׳“ ׳¦׳™׳₪׳¡ ׳׳“׳™׳¨, ׳׳׳— ׳™׳ ׳“׳§ 500 ׳’׳¨׳, ׳‘׳™׳¦׳™׳ 12L"
  ׳“׳•׳’׳׳” ׳©׳’׳•׳™׳”: [{"name":"׳©׳•׳§׳•׳׳“"}]

׳׳ ׳©׳“׳” ׳›׳׳©׳”׳• ׳׳ ׳ ׳™׳×׳ ׳׳§׳¨׳™׳׳” ג€” ׳”׳©׳×׳׳© ׳‘-null.
׳”׳—׳–׳¨ JSON ׳‘׳׳‘׳“.`
            }
          ]
        }]
      })
    });

    const rawText = await response.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch(e) {
      return res.status(500).json({ error: 'Bad Anthropic response: ' + rawText.slice(0, 300) });
    }

    if (data.error) {
      return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });
    }

    const text = (data.content || []).map(c => c.text || '').join('');
    let parsed;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(clean);
    } catch(e) {
      return res.status(500).json({ error: 'Parse error: ' + text.slice(0, 200) });
    }

    // Safety: ensure items is always a plain string
    if (parsed.items !== null && parsed.items !== undefined && typeof parsed.items !== 'string') {
      if (Array.isArray(parsed.items)) {
        parsed.items = parsed.items.map(i => {
          if (typeof i === 'string') return i;
          if (typeof i === 'object' && i !== null) {
            return i.name || i.description || i.item || i.text || Object.values(i)[0] || '';
          }
          return String(i);
        }).filter(Boolean).join(', ');
      } else if (typeof parsed.items === 'object') {
        parsed.items = Object.values(parsed.items).join(', ');
      } else {
        parsed.items = String(parsed.items);
      }
    }

    res.json(parsed);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.send('gan-api ok'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('listening on', PORT));
