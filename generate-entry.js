// The Other Side — topic entry generator
// Generates a balanced, multi-camp entry for a topic, runs an adversarial
// bias audit on it, and saves the audited entry as JSON.
//
// Usage:
//   npm install @anthropic-ai/sdk
//   ANTHROPIC_API_KEY=your_key node generate-entry.js "Do aliens exist?" "Aliens"
//   (Windows PowerShell:  $env:ANTHROPIC_API_KEY="your_key"; node generate-entry.js "Do aliens exist?" "Aliens")

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const MODEL = "claude-sonnet-5-5";
const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const DISCLAIMER =
  "Written by AI and checked by AI for bias. AI can get things wrong or miss viewpoints. " +
  "This page isn't telling you what to believe — it's showing you what other people believe and why.";

// ---------- PROMPT 1: GENERATE ----------
function generatePrompt(topic, category) {
  return `You are the writer for "The Other Side", a site that shows people the views their social media algorithm hides from them.

Topic: "${topic}"
Category: ${category}

Your job is NOT to decide who is right. Your job is to explain every major viewpoint so fairly that a person who holds it would say "yes, that's exactly why I believe this."

Rules:
- Identify the main camps of opinion (usually 2–5). Real debates are rarely just two sides.
- For EACH camp give its strongest arguments AND its weakest arguments. Every camp gets both — no camp is spared its weak points.
- Explain WHY people believe each view: the values, experiences, and fears behind it, not just the facts.
- Tone: warm, curious, a bit quirky — like a smart friend explaining it over a beer. No lecturing, no sneering at any camp.
- Use the same length, warmth and effort for every camp.
- Do not invent statistics, studies, quotes or sources. If you mention evidence, describe it generally.
- Never label a camp "right", "wrong", "fringe" or "mainstream".

Return ONLY valid JSON, no other text, in exactly this shape:
{
  "topic": "string",
  "category": "string",
  "hook": "one or two quirky sentences that make someone want to read on",
  "camps": [
    {
      "name": "short name for this camp",
      "one_liner": "their view in one sentence",
      "why_people_believe_this": "2-4 sentences on the values and experiences behind it",
      "strongest_arguments": [{ "point": "string", "explanation": "string" }],
      "weakest_arguments": [{ "point": "string", "explanation": "string" }]
    }
  ],
  "common_ground": "what most camps actually agree on",
  "questions_to_sit_with": ["2-3 open questions with no right answer"]
}`;
}

// ---------- PROMPT 2: SOURCED FACTS (uses web search) ----------
function factsPrompt(topic, campNames) {
  return `You are the fact researcher for "The Other Side", a site that explains every major viewpoint on a topic without taking sides.

Topic: "${topic}"
The camps on this topic: ${campNames.map((n) => `"${n}"`).join(", ")}

Use web search to find 4-6 key facts that frame this debate — the shared starting points that people in EVERY camp would accept as accurate, even if they interpret them differently.

Rules:
- Every fact must come from a page you actually found with web search. Copy its URL exactly.
- Prefer primary or widely trusted sources (official bodies, scientific institutions, encyclopedias, major reference works) over opinion pieces or advocacy sites.
- A fact must not be chosen to support one camp. If a camp would dispute it, leave it out.
- State each fact plainly in one or two sentences, in a neutral tone. No adjectives that take sides.
- Numbers are fine only if they appear in the source. Never estimate or round in a way that changes meaning.
- If you can't find enough facts that meet these rules, return fewer. Zero is acceptable.

After researching, reply with ONLY valid JSON, no other text, in exactly this shape:
{
  "key_facts": [
    { "fact": "string", "source_title": "string", "source_url": "string" }
  ]
}`;
}

// ---------- PROMPT 3: ADVERSARIAL AUDIT ----------
function auditPrompt(entryJson) {
  return `You are a hostile bias auditor for "The Other Side". Assume the entry below is secretly biased and your job is to prove it.

Argue as hard as you can that it unfairly favours one camp. Hunt for:
- Loaded or emotional words used for one camp but not others
- One camp getting stronger arguments, more detail, or a warmer tone
- Weak arguments that are actually strawmen (no real believer would make them)
- A missing camp that real people hold
- Any sentence that quietly implies which camp is correct
- Any invented statistic, study or quote
- Any item in "key_facts" that is cherry-picked to help one camp, that some camp would reasonably dispute, or whose wording leans one way

Then fix every problem you found and return a rewritten, balanced entry in the SAME JSON shape.
For "key_facts": you may remove facts or reword them to be more neutral, but never add a new fact and never change a "source_url" or "source_title".

Entry:
${entryJson}

Return ONLY valid JSON, no other text, in exactly this shape:
{
  "problems_found": [{ "issue": "string", "favoured_camp": "string", "fix": "string" }],
  "balance_score": "1-10, where 10 is perfectly even-handed (score the ORIGINAL)",
  "revised_entry": { ...same shape as the entry... }
}`;
}

// ---------- HELPERS ----------
// If a safety check declines a request, the API retries it on a suitable fallback model.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

function checkStop(res) {
  if (res.stop_reason === "refusal") {
    throw new Error(`The model declined this topic (${res.stop_details?.category ?? "no category"}).`);
  }
  if (res.stop_reason === "max_tokens") throw new Error("The response was cut off (max_tokens). Try again.");
}

// Pull the JSON object out of the model's text (ignores code fences or a sentence before it)
function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The model didn't return JSON.");
  return JSON.parse(text.slice(start, end + 1));
}

async function ask(prompt) {
  const res = await client.beta.messages.create({
    ...FALLBACK,
    model: MODEL,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });
  checkStop(res);
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return parseJson(text);
}

// Runs the fact research with Anthropic's server-side web search.
// Returns the facts plus every URL the search actually returned, so we can drop any made-up source.
async function researchFacts(topic, campNames) {
  const messages = [{ role: "user", content: factsPrompt(topic, campNames) }];
  const seenUrls = new Set();
  let res;
  for (let turn = 0; turn < 5; turn++) {
    res = await client.beta.messages.create({
      ...FALLBACK,
      model: MODEL,
      max_tokens: 16000,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages,
    });
    for (const block of res.content) {
      // Success = a list of results; an error comes back as a single object
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) if (r.url) seenUrls.add(r.url);
      }
      if (block.type === "text") for (const c of block.citations ?? []) if (c.url) seenUrls.add(c.url);
    }
    // Long searches can pause; send the turn back to let it continue
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  checkStop(res);
  if (res.stop_reason === "pause_turn") throw new Error("Fact research didn't finish. Try again.");

  // The JSON answer comes after the last search result
  const lastResult = res.content.findLastIndex((b) => b.type.endsWith("_tool_result"));
  const text = res.content
    .slice(lastResult + 1)
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const { key_facts = [] } = parseJson(text);
  return { facts: key_facts, seenUrls };
}

const normaliseUrl = (u) => String(u).trim().replace(/#.*$/, "").replace(/\/$/, "");

// Keep only facts whose source URL really came back from web search
function keepVerifiedFacts(facts, seenUrls) {
  const seen = new Set([...seenUrls].map(normaliseUrl));
  const kept = (facts || []).filter(
    (f) => f && f.fact && /^https?:\/\//.test(f.source_url || "") && seen.has(normaliseUrl(f.source_url))
  );
  return { kept, dropped: (facts || []).length - kept.length };
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

// ---------- MAIN ----------
async function main() {
  const topic = process.argv[2];
  const category = process.argv[3] || "General";
  if (!topic) {
    console.error('Usage: node generate-entry.js "Topic question" "Category"');
    process.exit(1);
  }

  console.log(`1/4 Generating entry for: ${topic}`);
  const draft = await ask(generatePrompt(topic, category));

  console.log("2/4 Researching sourced key facts (web search)...");
  const { facts, seenUrls } = await researchFacts(topic, (draft.camps || []).map((c) => c.name));
  draft.key_facts = keepVerifiedFacts(facts, seenUrls).kept;

  console.log("3/4 Running adversarial bias audit...");
  const audit = await ask(auditPrompt(JSON.stringify(draft, null, 2)));

  // Check again after the audit, in case a source was altered
  const verified = keepVerifiedFacts(audit.revised_entry.key_facts, seenUrls);
  if (verified.dropped) console.warn(`Dropped ${verified.dropped} fact(s) whose source couldn't be verified.`);

  const final = {
    ...audit.revised_entry,
    key_facts: verified.kept,
    disclaimer: DISCLAIMER,
    generated_at: new Date().toISOString(),
    audit: {
      balance_score_of_draft: audit.balance_score,
      problems_fixed: audit.problems_found,
    },
  };

  console.log("4/4 Saving...");
  const dir = path.join(process.cwd(), "entries");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slugify(topic)}.json`);
  fs.writeFileSync(file, JSON.stringify(final, null, 2));

  console.log(`Done. Saved to ${file}`);
  console.log(`Draft balance score: ${audit.balance_score}/10 — ${audit.problems_found.length} problem(s) fixed.`);
  console.log(`${final.key_facts.length} sourced fact(s) included.`);
}

main().catch((err) => {
  console.error("Something went wrong:", err.message);
  process.exit(1);
});
