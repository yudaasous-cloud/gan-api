const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ── Cloudinary upload ──────────────────────────────────────
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

// ── Receipt OCR ────────────────────────────────────────────
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
                text: `קרא את הקבלה והחזר JSON בלבד. אסור backticks, אסור markdown, אסור הסברים.

{"date":"YYYY-MM-DD","amount":0.00,"description":"שם העסק","items":"פריט א, פריט ב"}

date: תאריך בפורמט YYYY-MM-DD. דוגמה: 17/04/2026 → 2026-04-17
חשוב מאוד: כל הטקסט בתשובה חייב להיות בעברית בלבד. אל תתרגם לאנגלית.
amount: סכום לתשלום כמספר בלבד
description: שם העסק בדיוק כפי שכתוב בראש הקבלה כולל בע"מ
items: שמות הפריטים כמחרוזת טקסט רגילה מופרדים בפסיק — לא מערך JSON`
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
      // Clean the text - remove markdown, trim
      let clean = text.replace(/```json|```/g, '').trim();
      
      // Find JSON object in the text (between first { and last })
      const firstBrace = clean.indexOf('{');
      const lastBrace = clean.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        clean = clean.slice(firstBrace, lastBrace + 1);
      } else if (!clean.startsWith('{')) {
        // Prefill mode: prepend '{'
        clean = '{' + clean;
        const lb = clean.lastIndexOf('}');
        if (lb > 0) clean = clean.slice(0, lb + 1);
      }
      
      parsed = JSON.parse(clean);
    } catch(e) {
      return res.status(500).json({ error: 'Parse error: ' + text.slice(0, 200) });
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



// ── Excel export with pie chart (using jszip) ─────────────
app.post('/export-excel', async (req, res) => {
  try {
    const { receipts, payers } = req.body;
    const JSZip = require('jszip');
    
    const payerName = p => { const f = payers?.find(x=>x.key===p); return f ? f.name : p||''; };
    const refundLabel = s => ({pending:'ממתין',refunded:'הוחזר',partial:'חלקי',na:'לא רלוונטי'}[s]||s||'');
    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    const byCat = {};
    receipts.forEach(r => {
      const cat = r.category||'שונות';
      if (!byCat[cat]) byCat[cat] = { total:0, count:0, pending:0 };
      byCat[cat].total += r.amount||0; byCat[cat].count++;
      if (r.refundStatus==='pending'||r.refundStatus==='partial') byCat[cat].pending += (r.amount||0)-(r.refundedAmount||0);
    });
    const catEntries = Object.entries(byCat).sort((a,b)=>b[1].total-a[1].total);
    const grandTotal = receipts.reduce((s,r)=>s+(r.amount||0),0);
    const byPayer = {};
    receipts.forEach(r => { const p=payerName(r.payer); if(!byPayer[p]) byPayer[p]={total:0,count:0}; byPayer[p].total+=r.amount||0; byPayer[p].count++; });

    // Shared strings
    const strs = []; const si = v => { const s=String(v||''); const i=strs.indexOf(s); if(i>=0)return i; strs.push(s); return strs.length-1; };
    const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const cs = (col,row,val) => `<c r="${col}${row}" t="s"><v>${si(String(val))}</v></c>`;
    const cn = (col,row,val) => `<c r="${col}${row}"><v>${parseFloat(Number(val).toFixed(2))}</v></c>`;

    // Sheet 1
    const h1 = ['תאריך','תיאור','פריטים','סכום','קטגוריה','משלם','סטטוס החזר','סכום שהוחזר','הוסף על ידי','הערות'];
    h1.forEach(h=>si(h));
    let s1r = `<row r="1">${h1.map((h,i)=>cs(cols[i],1,h)).join('')}</row>`;
    receipts.forEach((r,ri) => {
      const row=[r.date||'',r.desc||'',r.items||'',r.amount||0,r.category||'',payerName(r.payer),refundLabel(r.refundStatus),r.refundedAmount||0,r.addedBy||'',r.notes||''];
      s1r+=`<row r="${ri+2}">${row.map((c,ci)=>(ci===3||ci===7)?cn(cols[ci],ri+2,c):cs(cols[ci],ri+2,c)).join('')}</row>`;
    });

    // Sheet 2
    const h2=['קטגוריה','סהכ','קבלות','ממתין להחזר']; h2.forEach(h=>si(h));
    catEntries.forEach(([c])=>si(c)); si('סהכ');
    let s2r=`<row r="1">${h2.map((h,i)=>cs(cols[i],1,h)).join('')}</row>`;
    catEntries.forEach(([cat,d],ri)=>{ s2r+=`<row r="${ri+2}">${cs('A',ri+2,cat)}${cn('B',ri+2,d.total)}${cn('C',ri+2,d.count)}${cn('D',ri+2,d.pending)}</row>`; });
    const tr=catEntries.length+2; s2r+=`<row r="${tr}">${cs('A',tr,'סהכ')}${cn('B',tr,grandTotal)}${cn('C',tr,receipts.length)}${cn('D',tr,0)}</row>`;

    // Sheet 3
    const h3=['משלם','סהכ','קבלות']; h3.forEach(h=>si(h));
    Object.keys(byPayer).forEach(p=>si(p));
    let s3r=`<row r="1">${h3.map((h,i)=>cs(cols[i],1,h)).join('')}</row>`;
    Object.entries(byPayer).forEach(([p,d],ri)=>{ s3r+=`<row r="${ri+2}">${cs('A',ri+2,p)}${cn('B',ri+2,d.total)}${cn('C',ri+2,d.count)}</row>`; });

    const n=catEntries.length;
    const zip = new JSZip();

    zip.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    zip.file('_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="קבלות" sheetId="1" r:id="rId1"/><sheet name="סיכום" sheetId="2" r:id="rId2"/><sheet name="משלמים" sheetId="3" r:id="rId3"/></sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`);
    zip.file('xl/worksheets/sheet1.xml',`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetView rightToLeft="1" workbookViewId="0"/><sheetData>${s1r}</sheetData></worksheet>`);
    zip.file('xl/worksheets/sheet2.xml',`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetView rightToLeft="1" workbookViewId="0"/><sheetData>${s2r}</sheetData><drawing r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></worksheet>`);
    zip.file('xl/worksheets/sheet3.xml',`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetView rightToLeft="1" workbookViewId="0"/><sheetData>${s3r}</sheetData></worksheet>`);
    zip.file('xl/sharedStrings.xml',`<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strs.length}" uniqueCount="${strs.length}">${strs.map(s=>`<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`);
    zip.file('xl/worksheets/_rels/sheet2.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
    zip.file('xl/drawings/drawing1.xml',`<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor><xdr:from><xdr:col>5</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>14</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`);
    zip.file('xl/drawings/_rels/drawing1.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`);
    zip.file('xl/charts/chart1.xml',`<?xml version="1.0" encoding="UTF-8"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>הוצאות לפי קטגוריה</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:plotArea><c:pieChart><c:ser><c:idx val="0"/><c:order val="0"/><c:cat><c:strRef><c:f>סיכום!$A$2:$A$${n+1}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>סיכום!$B$2:$B$${n+1}</c:f></c:numRef></c:val><c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/></c:dLbls></c:ser><c:firstSliceAng val="0"/></c:pieChart></c:plotArea><c:legend><c:legendPos val="r"/></c:legend></c:chart></c:chartSpace>`);

    const buf = await zip.generateAsync({ type:'nodebuffer' });
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition','attachment; filename="gan_ofarim.xlsx"');
    res.send(buf);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});


app.get('/', (req, res) => res.send('gan-api ok'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('listening on', PORT));
