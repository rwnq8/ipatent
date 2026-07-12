/**
 * ipatent.me API Worker — v2.0
 * Dedicated D1 (ipatent-db) + Vectorize (ipatent-disclosures) + R2 (ipatent)
 *
 * Endpoints:
 *   POST /api/submit        — Submit disclosure → D1 + Vectorize embed + R2
 *   GET  /api/submissions    — List submissions (paginated)
 *   GET  /api/submissions/:id — Get single submission
 *   POST /api/search         — Vector-based semantic search
 *   POST /api/analytics      — Event tracking (pageview, form_focus, etc.)
 *   GET  /api/stats          — Aggregate analytics
 *   GET  /api/health         — Health check
 *
 * Architecture:
 *   Every submission is stored VERBATIM in D1.
 *   Simultaneously embedded via Workers AI (bge-base-en-v1.5) → Vectorize.
 *   Generated document HTML stored in R2 for permanence.
 *   All analytics events stream to D1 for reconstruction of any session.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function cors(r) {
  const h = new Headers(r.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) h.set(k, v);
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
}

function json(data, status = 200) {
  return cors(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}

function html(body, status = 200, extra = {}) {
  const h = new Headers({ 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS });
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(body, { status, headers: h });
}

function subId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = crypto.randomUUID().split('-')[0].toUpperCase();
  return `USP-${ts}-${rnd}`;
}

function sanitize(s, max = 100000) {
  return String(s || '').slice(0, max).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// ── Disclosure Document Generator (Professional Format) ──

function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function formatClaims(text) {
  if (!text || !text.trim()) return '';
  // Split on newlines, format numbered claims
  const lines = text.trim().split('\n').filter(l => l.trim());
  return lines.map(line => {
    const trimmed = line.trim();
    // Check if it's a numbered claim
    if (/^\d+\./.test(trimmed)) {
      return `<p class="claim"><strong>${escHtml(trimmed)}</strong></p>`;
    }
    return `<p class="claim-cont">${escHtml(trimmed)}</p>`;
  }).join('\n');
}

function generateDocHTML(data) {
  const d = new Date().toISOString().split('T')[0];
  const esc = escHtml;
  const hasClaims = data.claims && data.claims.trim();
  const hasAbstract = data.abstract && data.abstract.trim();
  const hasTechnicalField = data.technical_field && data.technical_field.trim();
  const hasBackground = data.background && data.background.trim();
  const hasSummary = data.summary && data.summary.trim();
  const userTypeLabel = {'inventor':'Independent Inventor','pro-se':'Pro Se Filer','attorney':'Working with Patent Attorney'}[data.user_type] || '';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>US Provisional Patent Disclosure — ${esc(data.title || 'Untitled')}</title>
<style>
  @page { margin: 1in; size: letter; }
  body{
    font-family: 'Georgia', 'Times New Roman', serif;
    max-width: 7.5in;
    margin: 0 auto;
    padding: 0.75in 0.5in;
    color: #1a1a1a;
    line-height: 1.8;
    font-size: 11.5pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1{font-size:14pt;text-align:center;font-weight:700;margin-bottom:18pt;text-transform:uppercase;letter-spacing:1pt;border-bottom:2pt solid #1a1a1a;padding-bottom:8pt}
  h2{font-size:12pt;color:#1a1a1a;margin-top:22pt;margin-bottom:8pt;border-bottom:1pt solid #ccc;padding-bottom:4pt}
  h3{font-size:11pt;color:#333;margin-top:16pt;margin-bottom:6pt}
  .meta-section{background:#f8f8f8;border:1px solid #ddd;padding:12pt 16pt;margin:16pt 0;font-size:10pt;line-height:1.5;border-radius:4pt}
  .meta-section p{margin:2pt 0}
  .section-label{font-weight:700;font-size:10pt;color:#555;text-transform:uppercase;letter-spacing:.5pt;margin-top:18pt;margin-bottom:4pt}
  .disclosure-body{white-space:pre-wrap;text-align:justify;margin:8pt 0}
  .claim{font-family:'Georgia',serif;margin:6pt 0;padding:2pt 0;text-indent:-20pt;padding-left:20pt;line-height:1.6}
  .claim-cont{font-family:'Georgia',serif;margin:2pt 0;padding-left:20pt;line-height:1.6}
  .abstract-box{border:1px solid #ccc;padding:10pt 14pt;margin:14pt 0;font-size:10.5pt;background:#fafafa}
  .abstract-box .abstract-label{font-weight:700;text-transform:uppercase;font-size:9pt;color:#666;letter-spacing:.5pt}
  .footer{border-top:1px solid #ccc;padding-top:12pt;margin-top:30pt;font-size:8.5pt;color:#888;text-align:center}
  .watermark{position:fixed;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-20deg);font-size:72pt;color:rgba(0,0,0,.025);pointer-events:none;z-index:-1;white-space:nowrap;font-weight:700}
  .page-break{page-break-before:always}
  .sig-line{border-top:1px solid #1a1a1a;width:250pt;margin-top:36pt;font-size:9pt;color:#666}
  @media print{
    body{padding:0}
    .watermark{display:none}
    .meta-section{background:#f8f8f8!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
</style>
</head>
<body>
<div class="watermark">DRAFT</div>

<h1>UNITED STATES PROVISIONAL PATENT DISCLOSURE</h1>

<!-- Meta Information -->
<div class="meta-section">
  <p><strong>Submission ID:</strong> ${esc(data.submission_id)}</p>
  <p><strong>Date Generated:</strong> ${d}</p>
  <p><strong>Inventor(s):</strong> ${esc(data.inventor_name || 'Not provided')}</p>
  <p><strong>Contact:</strong> ${esc(data.inventor_email || 'Not provided')}</p>
  ${userTypeLabel ? `<p><strong>Filed By:</strong> ${esc(userTypeLabel)}</p>` : ''}
  <p><strong>Status:</strong> <em>DRAFT — NOT YET FILED WITH USPTO</em></p>
  <p style="margin-top:6pt;font-size:9pt;color:#888">This document is a draft provisional patent disclosure generated for internal review. It does not constitute a filed patent application and no USPTO filing date has been established. File a provisional application (Forms SB/16, specification, drawings, and fee) to establish a priority date under 35 USC §119(e). You must file a non-provisional application within 12 months.</p>
</div>

<!-- Title -->
<h2>1. TITLE OF INVENTION</h2>
<p style="font-size:12pt;font-weight:600">${esc(data.title || '[No title provided]')}</p>

<!-- Technical Field -->
${hasTechnicalField ? `
<h2>2. TECHNICAL FIELD</h2>
<div class="disclosure-body">${esc(data.technical_field)}</div>` : ''}

<!-- Background -->
${hasBackground ? `
<h2>3. BACKGROUND OF THE INVENTION</h2>
<div class="disclosure-body">${esc(data.background)}</div>` : ''}

<!-- Summary -->
${hasSummary ? `
<h2>4. SUMMARY OF THE INVENTION</h2>
<div class="disclosure-body">${esc(data.summary)}</div>` : ''}

<!-- Detailed Description -->
<h2>${hasBackground || hasSummary ? '5' : '2'}. DETAILED DESCRIPTION</h2>
<div class="disclosure-body">${esc(data.disclosure_text || '[No detailed description provided]')}</div>

<!-- Claims -->
${hasClaims ? `
<div class="page-break"></div>
<h2>${hasBackground || hasSummary ? '6' : '3'}. CLAIMS</h2>
<p style="font-size:9pt;color:#888;font-style:italic;margin-bottom:10pt">What is claimed is:</p>
${formatClaims(data.claims)}
` : `
<div class="page-break"></div>
<h2>${hasBackground || hasSummary ? '6' : '3'}. CLAIMS</h2>
<p style="color:#999;font-style:italic">[No claims drafted. Claims are optional in a provisional application but are strongly recommended to establish a clear priority date. Add claims before filing.]</p>
`}

<!-- Abstract -->
${hasAbstract ? `
<h2>${hasBackground || hasSummary ? '7' : '4'}. ABSTRACT</h2>
<div class="abstract-box">
  <span class="abstract-label">Abstract</span>
  <div class="disclosure-body" style="margin-top:6pt">${esc(data.abstract)}</div>
</div>` : `
<h2>${hasBackground || hasSummary ? '7' : '4'}. ABSTRACT</h2>
<div class="abstract-box">
  <span class="abstract-label">Abstract</span>
  <div class="disclosure-body" style="margin-top:6pt;color:#999;font-style:italic">[Abstract not provided. An abstract of 150 words or fewer should be included before filing.]</div>
</div>`}

<!-- Declaration -->
<h2>INVENTOR DECLARATION</h2>
<div class="disclosure-body">
  <p>I, <strong>${esc(data.inventor_name || '[Inventor name not provided]')}</strong>, hereby declare that:</p>
  <ol style="margin-left:20pt">
    <li>I am the original inventor, or an original joint inventor, of the subject matter disclosed above;</li>
    <li>I have reviewed and understand the contents of this disclosure;</li>
    <li>I believe the invention described herein to be novel, useful, and non-obvious;</li>
    <li>This document is a <strong>draft disclosure</strong> and does not constitute a filed patent application with the United States Patent and Trademark Office (USPTO);</li>
    <li>I understand that no patent rights are established until a complete application is filed with the USPTO and a patent is granted;</li>
    <li>I understand that public disclosure of this invention before filing may affect patent rights in certain jurisdictions.</li>
  </ol>
  <div class="sig-line">
    <p>Signature of Inventor</p>
    <p>Date: ____________________</p>
  </div>
</div>

<!-- Next Steps -->
<h2>NEXT STEPS — Filing Checklist</h2>
<div class="disclosure-body">
  <ol>
    <li><strong>Review &amp; Refine:</strong> Carefully review this disclosure for completeness, accuracy, and clarity. Ensure the description would enable a person of ordinary skill in the art to make and use the invention.</li>
    <li><strong>Add Drawings:</strong> Prepare formal drawings, diagrams, flowcharts, or schematics. Each figure should be numbered and referenced in the detailed description. Drawings are required if necessary to understand the invention (37 CFR §1.81).</li>
    <li><strong>Draft Claims:</strong> If not already included, draft formal patent claims defining the legal scope of protection sought. Include both independent and dependent claims.</li>
    <li><strong>Prepare USPTO Forms:</strong> Complete Form SB/16 (Provisional Application Cover Sheet) and the applicable fee transmittal form.</li>
    <li><strong>File with USPTO:</strong> Submit the complete provisional application (specification, drawings, cover sheet, and filing fee) to the USPTO via EFS-Web or by mail.</li>
    <li><strong>Mark Your Calendar:</strong> You have <strong>12 months</strong> from the provisional filing date to file a non-provisional (utility) application claiming priority under 35 USC §119(e).</li>
    <li><strong>Consult a Patent Professional:</strong> Patent law is complex. Strongly consider consulting a registered patent attorney or agent (find one at <a href="https://www.uspto.gov" style="color:#2563eb">USPTO.gov</a>).</li>
  </ol>
</div>

<div class="footer">
  <p><strong>Generated by ipatent.me</strong> — Provisional Patent Disclosure Tool</p>
  <p style="margin-top:4pt"><strong>IMPORTANT:</strong> This is a DRAFT document generated for informational purposes. It is NOT a filed patent application. No USPTO filing date has been established. No patent protection is in effect. This document does not constitute legal advice. Consult a registered patent attorney or agent before filing.</p>
  <p style="margin-top:4pt">Generated: ${d} | Submission ID: ${esc(data.submission_id)} | ipatent.me</p>
</div>

</body>
</html>`;
}

// ── Request Helpers ──

function reqMeta(request) {
  return {
    ip: request.headers.get('CF-Connecting-IP') || 'unknown',
    ua: (request.headers.get('User-Agent') || 'unknown').slice(0, 500),
    country: request.headers.get('CF-IPCountry') || 'unknown',
    referrer: (request.headers.get('Referer') || '').slice(0, 500),
  };
}

async function trackAnalytics(env, eventType, pageUrl, sessionId, meta, extraMeta = {}) {
  try {
    const m = { ...extraMeta, ...meta };
    // Upsert session
    await env.DB.prepare(
      `INSERT INTO sessions (session_id, ip_address, user_agent, country, last_seen, total_events)
       VALUES (?, ?, ?, ?, datetime('now'), 1)
       ON CONFLICT(session_id) DO UPDATE SET last_seen = datetime('now'),
         total_events = total_events + 1, page_views = page_views + (CASE WHEN ? = 'pageview' THEN 1 ELSE 0 END)`
    ).bind(sessionId, m.ip, m.ua, m.country, eventType).run();

    // Insert event
    await env.DB.prepare(
      `INSERT INTO analytics (event_type, page_url, referrer, ip_address, user_agent, country, session_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(eventType, pageUrl, meta.referrer, m.ip, m.ua, m.country, sessionId, JSON.stringify(m)).run();
  } catch (e) { console.error('analytics:', e.message); }
}

// ── Vectorize Embedding ──

async function embedText(env, text) {
  try {
    const { data } = await env.AI.run('@cf/baai/bge-large-en-v1.5', { text: [text.slice(0, 8000)] });
    return data[0]; // Float32Array of 768 dims
  } catch (e) {
    console.error('embed failed:', e.message);
    return null;
  }
}

// ── POST /api/submit ──

async function handleSubmit(request, env) {
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const inventor_name = sanitize(body.inventor_name, 500);
  const inventor_email = sanitize(body.inventor_email, 500);
  const title = sanitize(body.title, 1000);
  const disclosure_text = sanitize(body.disclosure_text, 50000);
  const claims = sanitize(body.claims, 20000);
  const abstract = sanitize(body.abstract, 2000);
  const technical_field = sanitize(body.technical_field, 1000);
  const background = sanitize(body.background, 20000);
  const summary = sanitize(body.summary, 10000);
  const user_type = sanitize(body.user_type, 100);
  const sessionId = sanitize(body.session_id, 200) || crypto.randomUUID();

  if (!title || !disclosure_text) {
    return json({ error: 'title and disclosure_text are required' }, 400);
  }

  const sid = subId();
  const meta = reqMeta(request);

  // 1. Generate the disclosure document HTML
  const docHTML = generateDocHTML({
    submission_id: sid,
    inventor_name, inventor_email, title, disclosure_text,
    claims, abstract, technical_field, background, summary, user_type,
  });

  // 2. Store document HTML in R2
  const r2Key = `disclosures/${sid}.html`;
  try {
    await env.BUCKET.put(r2Key, docHTML, {
      httpMetadata: { contentType: 'text/html', cacheControl: 'public, max-age=86400' },
      customMetadata: { submission_id: sid, title, inventor: inventor_name },
    });
  } catch (e) { console.error('R2 put failed:', e.message); }

  // 3. Store VERBATIM in D1
  try {
    await env.DB.prepare(
      `INSERT INTO submissions (submission_id, inventor_name, inventor_email, title, disclosure_text, claims, abstract, technical_field, background, summary, user_type, document_html, r2_key, status, ip_address, user_agent, country, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`
    ).bind(sid, inventor_name, inventor_email, title, disclosure_text, claims, abstract, technical_field, background, summary, user_type, docHTML, r2Key, meta.ip, meta.ua, meta.country, sessionId).run();
  } catch (e) {
    console.error('D1 insert failed:', e.message);
    return json({ error: 'Database error. Please try again.' }, 500);
  }

  // 4. Embed disclosure text → Vectorize
  const embedding = await embedText(env, `${title}\n\n${disclosure_text}`);
  if (embedding) {
    try {
      await env.VECTORIZE.upsert([{
        id: sid,
        values: embedding,
        metadata: {
          submission_id: sid,
          title,
          inventor: inventor_name,
          country: meta.country,
          created_at: new Date().toISOString(),
        },
      }]);
    } catch (e) { console.error('Vectorize upsert failed:', e.message); }
  }

  // 5. Track analytics
  await trackAnalytics(env, 'submission', '/api/submit', sessionId, meta, { submission_id: sid, title });

  return html(docHTML, 201, { 'X-Submission-ID': sid });
}

// ── GET /api/submissions ──

async function handleListSubmissions(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 100);
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  try {
    const rows = await env.DB.prepare(
      `SELECT submission_id, inventor_name, title, status, country, created_at
       FROM submissions ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(limit, offset).all();

    const total = await env.DB.prepare('SELECT COUNT(*) as count FROM submissions').first();

    return json({ total: total?.count || 0, offset, limit, results: rows.results });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ── GET /api/submissions/:id ──

async function handleGetSubmission(request, env, id) {
  try {
    const row = await env.DB.prepare(
      'SELECT * FROM submissions WHERE submission_id = ?'
    ).bind(id).first();

    if (!row) return json({ error: 'Not found' }, 404);
    return html(row.document_html || generateDocHTML(row));
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ── POST /api/search ──

async function handleSearch(request, env) {
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const query = sanitize(body.query, 2000);
  const limit = Math.min(parseInt(body.limit) || 10, 50);

  if (!query) return json({ error: 'query is required' }, 400);

  // 1. Embed query
  const qEmbedding = await embedText(env, query);
  if (!qEmbedding) return json({ error: 'Embedding failed' }, 500);

  // 2. Vector search
  let vectorResults = [];
  try {
    const vr = await env.VECTORIZE.query(qEmbedding, {
      topK: limit,
      returnValues: false,
      returnMetadata: true,
    });
    vectorResults = vr.matches || [];
  } catch (e) { console.error('Vectorize query failed:', e.message); }

  // 3. Enrich with D1 data
  const enriched = [];
  for (const match of vectorResults) {
    const meta = match.metadata || {};
    try {
      const row = await env.DB.prepare(
        'SELECT submission_id, title, inventor_name, status, created_at FROM submissions WHERE submission_id = ?'
      ).bind(meta.submission_id || match.id).first();
      if (row) {
        enriched.push({ ...row, score: Math.round(match.score * 1000) / 1000, vector_id: match.id });
      } else {
        enriched.push({ submission_id: match.id, title: meta.title || '(unknown)', score: Math.round(match.score * 1000) / 1000, vector_id: match.id });
      }
    } catch { enriched.push({ submission_id: match.id, title: meta.title || '(unknown)', score: Math.round(match.score * 1000) / 1000 }); }
  }

  // Track search
  await trackAnalytics(env, 'search', '/api/search', body.session_id || '', reqMeta(request), { query, results: enriched.length });

  return json({ query, results: enriched, total: enriched.length });
}

// ── POST /api/analytics ──

async function handleAnalytics(request, env) {
  if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

  let body = {};
  if (request.method === 'POST') {
    try { body = await request.json(); } catch { /* OK */ }
  }

  const eventType = body.event_type || 'pageview';
  const pageUrl = body.page_url || request.headers.get('Referer') || '/';
  const sessionId = body.session_id || crypto.randomUUID();
  const meta = reqMeta(request);

  await trackAnalytics(env, eventType, pageUrl, sessionId, meta, body.metadata || {});

  return json({ success: true, session_id: sessionId });
}

// ── GET /api/stats ──

async function handleStats(request, env) {
  try {
    const [totalSub, totalEvents, totalSessions, recentSubs, byCountry, byEvent] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as c FROM submissions').first(),
      env.DB.prepare('SELECT COUNT(*) as c FROM analytics').first(),
      env.DB.prepare('SELECT COUNT(*) as c FROM sessions').first(),
      env.DB.prepare('SELECT submission_id, title, inventor_name, status, country, created_at FROM submissions ORDER BY created_at DESC LIMIT 20').all(),
      env.DB.prepare('SELECT country, COUNT(*) as c FROM analytics WHERE country IS NOT NULL AND country != "unknown" GROUP BY country ORDER BY c DESC LIMIT 20').all(),
      env.DB.prepare('SELECT event_type, COUNT(*) as c FROM analytics GROUP BY event_type ORDER BY c DESC').all(),
    ]);

    return json({
      submissions: { total: totalSub?.c || 0, recent: recentSubs?.results || [] },
      analytics: { total: totalEvents?.c || 0, by_country: byCountry?.results || [], by_event: byEvent?.results || [] },
      sessions: { total: totalSessions?.c || 0 },
    });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ── GET /api/health ──

async function handleHealth(env) {
  let d1Ok = false, r2Ok = false, vecOk = false;
  try { await env.DB.prepare('SELECT 1').first(); d1Ok = true; } catch {}
  try { await env.VECTORIZE.describe(); vecOk = true; } catch {}
  try { await env.BUCKET.head('health-check'); r2Ok = true; } catch { /* bucket may be empty */ r2Ok = true; }

  return json({
    status: 'ok',
    service: 'ipatent-api',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    bindings: { d1: d1Ok, vectorize: vecOk, r2: r2Ok },
  });
}

// ── POST /api/chat ── Interactive drafting dialog

async function handleChat(request, env) {
  if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const messages = body.messages || [];
  if (!messages.length) return json({ error: 'messages array required' }, 400);

  // Build the conversation for AI
  const systemPrompt = `You are a friendly, encouraging assistant helping someone protect their invention idea. This person may have no experience with patents — they just have an idea they're excited about.

Your job: ask warm, simple questions to help them explain their idea more fully. Think of yourself as a curious, supportive friend who wants to understand their invention.

Guidelines:
- Ask ONE simple question at a time. Keep it short and conversational.
- Use everyday language. NEVER use words like "prior art," "embodiment," "enablement," or "claims" unless they use them first.
- Help them explain: what problem it solves, how it works, what makes it special, how someone would make it, different ways it could work.
- Be genuinely encouraging. Say things like "That's a great idea!" or "I love that!" when they share something clever.
- If they've given you a clear picture of their invention, let them know they're ready and suggest they click the "Create My Disclosure" button.
- NEVER write a formal document — just have a friendly conversation.

Keep your responses to 2-3 short sentences. Be warm!`;

  // Convert messages to AI format (exclude system messages to save tokens)
  const aiMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.slice(-6).map(m => ({ role: m.role === 'system' ? 'assistant' : m.role, content: m.content }))
  ];

  try {
    const result = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: aiMessages,
      max_tokens: 400,
      temperature: 0.7,
    });

    const response = result.response || result.choices?.[0]?.message?.content || 'I understand. Could you tell me more about how your invention works?';
    return json({ content: response.trim() });
  } catch (e) {
    console.error('AI chat error:', e.message);
    // Fallback: ask a generic clarifying question based on message count
    const questionCount = messages.filter(m => m.role === 'assistant').length;
    const fallbacks = [
      "Thanks for sharing your idea! 😊 To help me understand better — what problem does your invention solve? What frustrated you that made you think of this?",
      "That's really interesting! Could you walk me through how it works, step by step? Don't worry about using technical words — just describe it like you'd explain it to a friend.",
      "I love where this is going! Are there other ways someone could build or use your idea? Thinking about variations is helpful.",
      "Almost ready! Is there anything else special or unique about your idea that you haven't mentioned yet?",
      "I think we have a great picture of your invention now! 🎉 Click \"Create My Disclosure\" to turn this into a professional document, or tell me anything else you'd like to add."
    ];
    const idx = Math.min(questionCount, fallbacks.length - 1);
    return json({ content: fallbacks[idx] });
  }
}

// ── Router ──

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));

    try {
      // API routes
      if (path === '/api/submit')         return handleSubmit(request, env);
      if (path === '/api/submissions')    return handleListSubmissions(request, env);
      if (path.match(/^\/api\/submissions\/([A-Za-z0-9_-]+)$/)) {
        return handleGetSubmission(request, env, RegExp.$1);
      }
      if (path === '/api/search')         return handleSearch(request, env);
      if (path === '/api/analytics')      return handleAnalytics(request, env);
      if (path === '/api/stats')          return handleStats(request, env);
      if (path === '/api/health')         return handleHealth(env);
      if (path === '/api/chat')           return handleChat(request, env);

      // Catch-all
      return Response.redirect('https://ipatent.me', 302);
    } catch (e) {
      console.error('Unhandled:', e);
      return json({ error: 'Internal error', detail: e.message }, 500);
    }
  },
};
