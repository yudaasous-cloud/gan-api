const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.post('/read-receipt', async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'missing api key' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: '׳—׳׳¥ ׳׳”׳§׳‘׳׳” JSON ׳‘׳׳‘׳“ ׳׳׳ markdown: {"date":"YYYY-MM-DD","amount":number,"description":"׳©׳ ׳”׳¢׳¡׳§","items":"׳₪׳¨׳™׳˜׳™׳"}. ׳׳ ׳©׳“׳” ׳׳ ׳‘׳¨׳•׳¨, ׳”׳©׳×׳׳© ׳‘-null.' }
          ]
        }]
      })
    });

    const data = await response.json();
    const text = (data.content || []).map(c => c.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.send('gan-api ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('listening on', PORT));
