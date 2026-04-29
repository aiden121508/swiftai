const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const ANTHROPIC_API_KEY = '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';
const UNDETECTABLE_API_KEY = 'ea02a5ab-da67-4ab3-8050-77ebe23c1cb6';

// ── CLAUDE for chat and all other tools ──
async function askClaude(system, messages, maxTokens = 2048) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      system: system,
      messages: messages
    })
  });
  const data = await response.json();
  console.log('CLAUDE:', JSON.stringify(data).substring(0, 150));
  if (data.error) throw new Error(data.error.message);
  if (!data.content || !data.content[0]) throw new Error('No response');
  return data.content[0].text;
}

// ── UNDETECTABLE.AI for humanizing ──
async function humanizeWithUndetectable(text, readability, purpose) {
  // Step 1: Submit document
  const submitRes = await fetch('https://humanize.undetectable.ai/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': UNDETECTABLE_API_KEY
    },
    body: JSON.stringify({
      content: text,
      readability: readability || 'High School',
      purpose: purpose || 'General Writing',
      strength: 'More Human'
    })
  });
  const submitData = await submitRes.json();
  console.log('UNDETECTABLE SUBMIT:', JSON.stringify(submitData));
  if (!submitData.id) throw new Error('Undetectable.ai submit failed: ' + JSON.stringify(submitData));

  // Step 2: Poll for result (retry up to 10 times)
  const docId = submitData.id;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000)); // wait 3 seconds
    const docRes = await fetch('https://humanize.undetectable.ai/document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': UNDETECTABLE_API_KEY
      },
      body: JSON.stringify({ id: docId })
    });
    const docData = await docRes.json();
    console.log('UNDETECTABLE POLL:', JSON.stringify(docData).substring(0, 200));
    if (docData.output) return docData.output;
  }
  throw new Error('Undetectable.ai timed out. Try again.');
}

// ── HUMANIZE ROUTE ──
app.post('/humanize', async (req, res) => {
  if (!req.body.text) return res.json({ error: 'No text provided' });

  // Map tone to Undetectable readability/purpose
  const toneMap = {
    casual:        { readability: 'High School',  purpose: 'General Writing' },
    professional:  { readability: 'University',   purpose: 'Business Material' },
    energetic:     { readability: 'High School',  purpose: 'Marketing Material' },
    storytelling:  { readability: 'High School',  purpose: 'Story' },
    persuasive:    { readability: 'University',   purpose: 'Marketing Material' },
    witty:         { readability: 'High School',  purpose: 'General Writing' },
    formal:        { readability: 'Doctorate',    purpose: 'Business Material' },
    empathetic:    { readability: 'High School',  purpose: 'General Writing' }
  };

  const tone = toneMap[req.body.tone] || toneMap.casual;

  // Try Undetectable.ai first
  if (UNDETECTABLE_API_KEY && UNDETECTABLE_API_KEY !== 'YOUR_UNDETECTABLE_API_KEY_HERE') {
    try {
      const output = await humanizeWithUndetectable(req.body.text, tone.readability, tone.purpose);
      return res.json({ output });
    } catch(e) {
      console.log('Undetectable failed, falling back to Claude:', e.message);
    }
  }

  // Fallback to Claude if no Undetectable key
  try {
    const output = await askClaude(
      `You are an expert at rewriting AI text to sound completely human. Rewrite the text below so it passes all AI detectors. Use varied sentence lengths, contractions, natural imperfections, and avoid all AI buzzwords. Return only the rewritten text.`,
      [{ role: 'user', content: req.body.text }]
    );
    res.json({ output });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// ── CHAT ROUTE ──
app.post('/chat', async (req, res) => {
  if (!req.body.messages) return res.json({ error: 'No messages provided' });
  if (ANTHROPIC_API_KEY === 'YOUR_ANTHROPIC_API_KEY_HERE') return res.json({ error: 'Add your Anthropic API key to server.js' });
  try {
    const output = await askClaude(
      'You are Swift AI, a world-class AI assistant, copywriter, and marketing strategist. Help with writing, marketing, emails, social media, and any questions. Be direct, practical, and genuinely useful. Never say "Certainly!" or "Great question!" — just deliver excellent answers.',
      req.body.messages
    );
    res.json({ output });
  } catch(e) { res.json({ error: e.message }); }
});

// ── TOOLS ROUTE ──
const TOOL_SYSTEMS = {
  paraphrase: 'You are an elite rewriting specialist. Rewrite the given text so it communicates the same ideas in a completely fresh way — different words, different structure, same meaning. Change at least 80% of the wording. Output only the rewritten text.',
  summarize: 'You are an expert at distilling complex information into clear, compelling summaries. Capture every key point. Use clear direct language. Output only the summary — no preamble.',
  email: 'You are a world-class email copywriter. Write emails with a hook opener (never "I hope this email finds you well"), short paragraphs, single clear CTA. Include subject line. Output the complete email ready to send.',
  tone: 'You are an expert linguist and communication analyst. Analyze: 1) Primary tone 2) Sentiment with % breakdown 3) Formality level 1-10 4) Writing style 5) Target audience 6) Emotional triggers 7) Strengths 8) Improvement suggestions. Reference specific words from the text.',
  expand: 'You are a master content developer. Expand the given text into fully-developed content with a hook opening, specific examples and detail, varied paragraph lengths, and a memorable ending. Every sentence earns its place.',
  headline: 'You are a legendary headline copywriter. Generate 10 compelling headlines using different frameworks (curiosity gap, specific number, how-to, contrarian, bold claim). Label each with its framework. Be specific not vague.',
  bio: 'You are an expert personal brand strategist. Write bios that open with the most compelling specific thing about the person — not their job title. Balance credibility with personality. Match the platform length precisely.',
  grammar: 'You are an expert editor. Fix all grammar, spelling, and punctuation errors. Improve clarity where confusing. Preserve the author\'s voice completely. Output only the corrected text.',
  hashtag: 'You are a social media growth expert. Provide hashtags mixing massive (1M+ posts), medium (100K-1M), and niche (under 100K) tags. Format ready to copy-paste. Include brief platform strategy.',
  caption: 'You are a top social media copywriter. Write 3 caption options using different approaches. Open with a scroll-stopping hook. End with a natural CTA. Use strategic line breaks for mobile readability.',
  adcopy: 'You are a direct response copywriter. Lead with customer pain or desire. Use AIDA naturally. Write headline, body, and CTA separately. Include social proof elements.',
  productdesc: 'You are an e-commerce conversion specialist. Convert features into benefits immediately. Use sensory language. Address top objections. End with a buying trigger.',
  seo: 'You are an SEO specialist. Provide: meta title (50-60 chars), meta description (150-160 chars), primary keyword, 5-8 secondary keywords, H1 suggestion, content structure with H2/H3 headings, featured snippet opportunity.',
  pressrelease: 'You are a veteran PR professional. Write press releases in AP style with: compelling headline, subheadline, dateline, inverted pyramid body, 2 attributed quotes, boilerplate, contact placeholders, ### end mark.',
  jobdesc: 'You are a talent acquisition specialist. Write job descriptions that open with what makes the role exciting, describe real day-to-day work, separate must-haves from nice-to-haves, use inclusive language.',
  review: 'You are a customer experience expert. Write personalized review responses that reference specific details. For negative: acknowledge, apologize sincerely, offer concrete resolution. Always maintain brand trust.',
  coldoutreach: 'You are an elite outreach specialist. Open with something specific about THEM. Get to value in 1-2 sentences. Make a small easy ask. Under 150 words. Provide 2-3 variations.',
  faqs: 'You are a customer success expert. Create FAQs that address real questions including ones customers are embarrassed to ask. Answer completely but concisely. Include pricing, support, and limitation questions. Format: Q: / A:'
};

app.post('/tool', async (req, res) => {
  if (!req.body.text || !req.body.tool) return res.json({ error: 'Missing text or tool' });
  if (ANTHROPIC_API_KEY === 'YOUR_ANTHROPIC_API_KEY_HERE') return res.json({ error: 'Add your Anthropic API key to server.js' });
  try {
    const system = TOOL_SYSTEMS[req.body.tool] || TOOL_SYSTEMS.paraphrase;
    const userMsg = req.body.option ? `Style/Option: ${req.body.option}\n\nText:\n${req.body.text}` : req.body.text;
    const output = await askClaude(system, [{ role: 'user', content: userMsg }]);
    res.json({ output });
  } catch(e) { res.json({ error: e.message }); }
});

app.get('/', (req, res) => res.json({ status: 'Swift AI running' }));
app.listen(process.env.PORT || 3000, () => console.log('\n🚀 Swift AI running on http://localhost:3000\n'));
