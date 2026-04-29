const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// Keys come from Render environment variables automatically
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const UNDETECTABLE_API_KEY = process.env.UNDETECTABLE_API_KEY;

console.log('Anthropic key loaded:', ANTHROPIC_API_KEY ? 'YES' : 'NO');
console.log('Undetectable key loaded:', UNDETECTABLE_API_KEY ? 'YES' : 'NO');

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

async function humanizeWithUndetectable(text, readability, purpose) {
  const submitRes = await fetch('https://humanize.undetectable.ai/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': UNDETECTABLE_API_KEY },
    body: JSON.stringify({ content: text, readability: readability || 'High School', purpose: purpose || 'General Writing', strength: 'More Human' })
  });
  const submitData = await submitRes.json();
  console.log('UNDETECTABLE SUBMIT:', JSON.stringify(submitData));
  if (!submitData.id) throw new Error('Undetectable submit failed');
  const docId = submitData.id;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const docRes = await fetch('https://humanize.undetectable.ai/document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': UNDETECTABLE_API_KEY },
      body: JSON.stringify({ id: docId })
    });
    const docData = await docRes.json();
    console.log('UNDETECTABLE POLL:', JSON.stringify(docData).substring(0, 200));
    if (docData.output) return docData.output;
  }
  throw new Error('Undetectable timed out');
}

app.post('/humanize', async (req, res) => {
  if (!req.body.text) return res.json({ error: 'No text provided' });
  const toneMap = {
    casual: { readability: 'High School', purpose: 'General Writing' },
    professional: { readability: 'University', purpose: 'Business Material' },
    energetic: { readability: 'High School', purpose: 'Marketing Material' },
    storytelling: { readability: 'High School', purpose: 'Story' },
    persuasive: { readability: 'University', purpose: 'Marketing Material' },
    witty: { readability: 'High School', purpose: 'General Writing' },
    formal: { readability: 'Doctorate', purpose: 'Business Material' },
    empathetic: { readability: 'High School', purpose: 'General Writing' }
  };
  const tone = toneMap[req.body.tone] || toneMap.casual;
  if (UNDETECTABLE_API_KEY) {
    try {
      const output = await humanizeWithUndetectable(req.body.text, tone.readability, tone.purpose);
      return res.json({ output });
    } catch(e) { console.log('Undetectable failed:', e.message); }
  }
  try {
    const output = await askClaude('Rewrite the text to sound natural and human. Remove AI buzzwords. Return only the rewritten text.', [{ role: 'user', content: req.body.text }]);
    res.json({ output });
  } catch(e) { res.json({ error: e.message }); }
});

app.post('/chat', async (req, res) => {
  if (!req.body.messages) return res.json({ error: 'No messages provided' });
  try {
    const output = await askClaude('You are Swift AI, a helpful assistant and expert copywriter. Help with writing, marketing, emails, social media, and answering any questions. Be friendly, clear and useful.', req.body.messages);
    res.json({ output });
  } catch(e) { res.json({ error: e.message }); }
});

const TOOL_SYSTEMS = {
  paraphrase: 'You are an elite rewriting specialist. Rewrite the given text so it communicates the same ideas in a completely fresh way. Change at least 80% of the wording. Output only the rewritten text.',
  summarize: 'You are an expert at distilling complex information into clear summaries. Capture every key point. Output only the summary.',
  email: 'You are a world-class email copywriter. Write emails with a hook opener, short paragraphs, single clear CTA. Include subject line. Output the complete email ready to send.',
  tone: 'You are an expert communication analyst. Analyze: 1) Primary tone 2) Sentiment % 3) Formality 1-10 4) Writing style 5) Target audience 6) Emotional triggers 7) Strengths 8) Improvements.',
  expand: 'You are a master content developer. Expand the given text into fully-developed content with a hook, specific examples, varied paragraphs, and memorable ending.',
  headline: 'You are a legendary headline copywriter. Generate 10 compelling headlines using different frameworks. Label each with its framework.',
  bio: 'You are an expert personal brand strategist. Write bios that open with the most compelling specific thing about the person. Match the platform length.',
  grammar: 'You are an expert editor. Fix all grammar, spelling, and punctuation errors. Preserve the author voice. Output only the corrected text.',
  hashtag: 'You are a social media growth expert. Provide hashtags mixing massive, medium, and niche tags. Format ready to copy-paste.',
  caption: 'You are a top social media copywriter. Write 3 caption options using different approaches with scroll-stopping hooks and natural CTAs.',
  adcopy: 'You are a direct response copywriter. Lead with customer pain. Use AIDA. Write headline, body, and CTA separately.',
  productdesc: 'You are an e-commerce conversion specialist. Convert features into benefits. Use sensory language. End with a buying trigger.',
  seo: 'You are an SEO specialist. Provide: meta title, meta description, primary keyword, secondary keywords, H1 suggestion, content structure.',
  pressrelease: 'You are a veteran PR professional. Write press releases in AP style with headline, subheadline, dateline, body, quotes, boilerplate.',
  jobdesc: 'You are a talent acquisition specialist. Write job descriptions that open with what makes the role exciting. Use inclusive language.',
  review: 'You are a customer experience expert. Write personalized review responses referencing specific details. Maintain brand trust.',
  coldoutreach: 'You are an elite outreach specialist. Open with something specific about THEM. Under 150 words. Provide 2-3 variations.',
  faqs: 'You are a customer success expert. Create FAQs including questions customers are embarrassed to ask. Format: Q: / A:'
};

app.post('/tool', async (req, res) => {
  if (!req.body.text || !req.body.tool) return res.json({ error: 'Missing text or tool' });
  try {
    const system = TOOL_SYSTEMS[req.body.tool] || TOOL_SYSTEMS.paraphrase;
    const userMsg = req.body.option ? `Style: ${req.body.option}\n\nText:\n${req.body.text}` : req.body.text;
    const output = await askClaude(system, [{ role: 'user', content: userMsg }]);
    res.json({ output });
  } catch(e) { res.json({ error: e.message }); }
});

app.get('/', (req, res) => res.json({ status: 'Swift AI running' }));
app.listen(process.env.PORT || 3000, () => console.log('\n🚀 Swift AI running on http://localhost:3000\n'));
