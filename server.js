const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ג”€ג”€ Cloudinary upload ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
app.post('/upload-image', async (req, res) => {
  try {
    const { imageBase64, receiptId } = req.body;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey    = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret)
      return res.status(500).json({ error: 'Cloudinary not configured' });

    const timestamp = Math.round(Date.now() / 1000);
    const publicId  = 'receipts/' + receiptId;

    // Build signature
    const crypto = require('crypto');
    const sigStr = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(sigStr).digest('hex');

    // POST to Cloudinary
    const formData = new URLSearchParams();
    formData.append('file', imageBase64);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('public_id', publicId);
    formData.append('signature', signature);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    res.json({ url: data.secure_url, publicId: data.public_id });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ג”€ג”€ Receipt OCR ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
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
        model: 'claude-opus-4-5',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 }
              },
              {
                type: 'text',
                text: `׳§׳¨׳ ׳׳× ׳”׳§׳‘׳׳” ׳•׳”׳—׳–׳¨ JSON ׳‘׳׳‘׳“. ׳׳¡׳•׳¨ backticks, ׳׳¡׳•׳¨ markdown, ׳׳¡׳•׳¨ ׳”׳¡׳‘׳¨׳™׳.

{"date":"YYYY-MM-DD","amount":0.00,"description":"׳©׳ ׳”׳¢׳¡׳§","items":"׳₪׳¨׳™׳˜ ׳, ׳₪׳¨׳™׳˜ ׳‘"}

date: ׳×׳׳¨׳™׳ ׳‘׳₪׳•׳¨׳׳˜ YYYY-MM-DD. ׳“׳•׳’׳׳”: 17/04/2026 ג†’ 2026-04-17
׳—׳©׳•׳‘ ׳׳׳•׳“: ׳›׳ ׳”׳˜׳§׳¡׳˜ ׳‘׳×׳©׳•׳‘׳” ׳—׳™׳™׳‘ ׳׳”׳™׳•׳× ׳‘׳¢׳‘׳¨׳™׳× ׳‘׳׳‘׳“. ׳׳ ׳×׳×׳¨׳’׳ ׳׳׳ ׳’׳׳™׳×.
amount: ׳¡׳›׳•׳ ׳׳×׳©׳׳•׳ ׳›׳׳¡׳₪׳¨ ׳‘׳׳‘׳“
description: ׳©׳ ׳”׳¢׳¡׳§ ׳‘׳“׳™׳•׳§ ׳›׳₪׳™ ׳©׳›׳×׳•׳‘ ׳‘׳¨׳׳© ׳”׳§׳‘׳׳” ׳›׳•׳׳ ׳‘׳¢"׳
items: ׳©׳׳•׳× ׳”׳₪׳¨׳™׳˜׳™׳ ׳›׳׳—׳¨׳•׳–׳× ׳˜׳§׳¡׳˜ ׳¨׳’׳™׳׳” ׳׳•׳₪׳¨׳“׳™׳ ׳‘׳₪׳¡׳™׳§ ג€” ׳׳ ׳׳¢׳¨׳ JSON`
              }
            ]
          },
          {
            role: 'assistant',
            content: '{'
          }
        ]
      })
    });

    const rawText = await response.text();
    let data;
    try { data = JSON.parse(rawText); }
    catch(e) { return res.status(500).json({ error: 'Bad response: ' + rawText.slice(0, 200) }); }

    if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) });

    const text = (data.content || []).map(c => c.text || '').join('');
    let parsed;
    try {
      // The assistant prefill adds '{', so prepend it and try to parse
      let jsonStr = '{' + text.replace(/```json|```/g, '').trim();
      // Remove trailing content after the closing brace
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace > 0) jsonStr = jsonStr.slice(0, lastBrace + 1);
      parsed = JSON.parse(jsonStr);
    } catch(e) {
      try {
        // Try without prefill
        const clean = text.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch(e2) {
        return res.status(500).json({ error: 'Parse error: ' + text.slice(0, 200) });
      }
    }

    // Ensure items is always a plain string
    if (parsed.items !== null && parsed.items !== undefined && typeof parsed.items !== 'string') {
      if (Array.isArray(parsed.items)) {
        parsed.items = parsed.items.map(i => {
          if (typeof i === 'string') return i;
          if (typeof i === 'object' && i !== null)
            return i.name || i.description || i.item || i.text || Object.values(i)[0] || '';
          return String(i);
        }).filter(Boolean).join(', ');
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


// ג”€ג”€ Excel export with chart ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
app.post('/export-excel', async (req, res) => {
  try {
    const { receipts, payers } = req.body;
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = '׳’׳ ׳¢׳•׳₪׳¨׳™׳';

    // ג”€ג”€ Sheet 1: All receipts ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
    const ws1 = wb.addWorksheet('׳§׳‘׳׳•׳×');
    ws1.views = [{ rightToLeft: true }];

    const headers = ['׳×׳׳¨׳™׳','׳×׳™׳׳•׳¨','׳₪׳¨׳™׳˜׳™׳','׳¡׳›׳•׳','׳§׳˜׳’׳•׳¨׳™׳”','׳׳©׳׳','׳¡׳˜׳˜׳•׳¡ ׳”׳—׳–׳¨','׳¡׳›׳•׳ ׳©׳”׳•׳—׳–׳¨','׳”׳•׳¡׳£ ׳¢׳ ׳™׳“׳™','׳”׳¢׳¨׳•׳×'];
    const refundLabel = s => ({pending:'׳׳׳×׳™׳',refunded:'׳”׳•׳—׳–׳¨',partial:'׳—׳׳§׳™',na:'׳׳ ׳¨׳׳•׳•׳ ׳˜׳™'}[s]||s||'');
    const payerName = p => { const f = payers?.find(x=>x.key===p); return f ? f.name : p || ''; };

    ws1.addRow(headers);
    ws1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3DAA7A' } };

    receipts.forEach(r => {
      ws1.addRow([r.date||'', r.desc||'', r.items||'', r.amount||0, r.category||'', payerName(r.payer), refundLabel(r.refundStatus), r.refundedAmount||0, r.addedBy||'', r.notes||'']);
    });

    [20,30,40,12,18,14,14,14,14,20].forEach((w,i) => ws1.getColumn(i+1).width = w);
    ws1.getColumn(4).numFmt = 'ג‚×#,##0.00';
    ws1.getColumn(8).numFmt = 'ג‚×#,##0.00';

    // ג”€ג”€ Sheet 2: Category summary + pie chart ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
    const ws2 = wb.addWorksheet('׳¡׳™׳›׳•׳ ׳§׳˜׳’׳•׳¨׳™׳•׳×');
    ws2.views = [{ rightToLeft: true }];
    ws2.addRow(['׳§׳˜׳’׳•׳¨׳™׳”', '׳¡׳”"׳› ׳”׳•׳¦׳׳•׳×', '׳׳¡׳₪׳¨ ׳§׳‘׳׳•׳×', '׳׳׳×׳™׳ ׳׳”׳—׳–׳¨']);
    ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3DAA7A' } };

    const byCat = {};
    receipts.forEach(r => {
      const cat = r.category || '׳©׳•׳ ׳•׳×';
      if (!byCat[cat]) byCat[cat] = { total: 0, count: 0, pending: 0 };
      byCat[cat].total += r.amount || 0;
      byCat[cat].count++;
      if (r.refundStatus === 'pending' || r.refundStatus === 'partial')
        byCat[cat].pending += (r.amount||0) - (r.refundedAmount||0);
    });

    const catEntries = Object.entries(byCat).sort((a,b) => b[1].total - a[1].total);
    catEntries.forEach(([cat, d]) => {
      ws2.addRow([cat, parseFloat(d.total.toFixed(2)), d.count, parseFloat(d.pending.toFixed(2))]);
    });
    ws2.addRow(['׳¡׳”"׳›', parseFloat(receipts.reduce((s,r)=>s+(r.amount||0),0).toFixed(2)), receipts.length, '']);
    ws2.lastRow.font = { bold: true };

    [30, 18, 14, 18].forEach((w,i) => ws2.getColumn(i+1).width = w);
    ws2.getColumn(2).numFmt = 'ג‚×#,##0.00';
    ws2.getColumn(4).numFmt = 'ג‚×#,##0.00';

    // Pie chart
    const lastDataRow = catEntries.length + 1;
    const chart = wb.addChart('pie', { style: 10 });
    chart.title.name = '׳”׳•׳¦׳׳•׳× ׳׳₪׳™ ׳§׳˜׳’׳•׳¨׳™׳”';
    chart.addSeries({
      name: { sheet: '׳¡׳™׳›׳•׳ ׳§׳˜׳’׳•׳¨׳™׳•׳×', row: 1, col: 2 },
      labels: { sheet: '׳¡׳™׳›׳•׳ ׳§׳˜׳’׳•׳¨׳™׳•׳×', fromRow: 2, fromCol: 1, toRow: lastDataRow, toCol: 1 },
      values: { sheet: '׳¡׳™׳›׳•׳ ׳§׳˜׳’׳•׳¨׳™׳•׳×', fromRow: 2, fromCol: 2, toRow: lastDataRow, toCol: 2 },
      dataLabels: { showPercent: true, showCatName: true }
    });
    chart.setPosition('F2', 'O22');
    ws2.addChart(chart);

    // ג”€ג”€ Sheet 3: Payer summary ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
    const ws3 = wb.addWorksheet('׳¡׳™׳›׳•׳ ׳׳©׳׳׳™׳');
    ws3.views = [{ rightToLeft: true }];
    ws3.addRow(['׳׳©׳׳', '׳¡׳”"׳›', '׳׳¡׳₪׳¨ ׳§׳‘׳׳•׳×']);
    ws3.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws3.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3DAA7A' } };

    const byPayer = {};
    receipts.forEach(r => {
      const p = payerName(r.payer);
      if (!byPayer[p]) byPayer[p] = { total: 0, count: 0 };
      byPayer[p].total += r.amount||0;
      byPayer[p].count++;
    });
    Object.entries(byPayer).forEach(([p, d]) => {
      ws3.addRow([p, parseFloat(d.total.toFixed(2)), d.count]);
    });
    [20,16,14].forEach((w,i) => ws3.getColumn(i+1).width = w);
    ws3.getColumn(2).numFmt = 'ג‚×#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="gan_ofarim.xlsx"');
    await wb.xlsx.write(res);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
