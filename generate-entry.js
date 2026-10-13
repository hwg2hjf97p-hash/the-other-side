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

// ---------- PROMPT 2: ADVERSARIAL AUDIT ----------
function auditPrompt(entryJson) {
  return `You are a hostile bias auditor for "The Other Side". Assume the entry below is secretly biased and your job is to prove it.

Argue as hard as you can that it unfairly favours one camp. Hunt for:
- Loaded or emotional words used for one camp but not others
- One camp getting stronger arguments, more detail, or a warmer tone
- Weak arguments that are actually strawmen (no real believer would make them)
- A missing camp that real people hold
- Any sentence that quietly implies which camp is correct
- Any invented statistic, study or quote

Then fix every problem you found and return a rewritten, balanced entry in the SAME JSON shape.

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
async function ask(prompt) {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  // Strip code fences if the model adds them
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned);
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

  console.log(`1/3 Generating entry for: ${topic}`);
  const draft = await ask(generatePrompt(topic, category));

  console.log("2/3 Running adversarial bias audit...");
  const audit = await ask(auditPrompt(JSON.stringify(draft, null, 2)));

  const final = {
    ...audit.revised_entry,
    disclaimer: DISCLAIMER,
    generated_at: new Date().toISOString(),
    audit: {
      balance_score_of_draft: audit.balance_score,
      problems_fixed: audit.problems_found,
    },
  };

  console.log("3/3 Saving...");
  const dir = path.join(process.cwd(), "entries");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slugify(topic)}.json`);
  fs.writeFileSync(file, JSON.stringify(final, null, 2));

  console.log(`Done. Saved to ${file}`);
  console.log(`Draft balance score: ${audit.balance_score}/10 — ${audit.problems_found.length} problem(s) fixed.`);
}

main().catch((err) => {
  console.error("Something went wrong:", err.message);
  process.exit(1);
});
