# The Other Side — Build Prompt

## Setup (PowerShell, Windows)
1. Make a new folder, e.g. `C:\the-other-side`, and put these three files in it (all NEW): `generate-entry.js`, `package.json`, this file.
2. Open PowerShell in that folder and run:
   ```
   npm install
   $env:ANTHROPIC_API_KEY="your_key_here"
   node generate-entry.js "Do aliens exist?" "Aliens"
   ```
3. Your first entry appears in `entries\do-aliens-exist.json`. Open it and sanity-check it.

Then paste everything below the line into Claude Code (or any AI coding tool) in that same folder.

---

I'm building a website called **The Other Side**. Social media algorithms show people only one side of every topic. This site does the opposite: a user logs what they believe about a topic, and the site shows them their own view AND every other major view, explained fairly.

**The site must never push anyone toward a side.** The goal is only to make other views visible. It's fine if the user reads everything and keeps their original belief.

## What already exists
`generate-entry.js` — a Node script that takes a topic, uses the Claude API to write a balanced multi-camp entry, runs an adversarial bias audit on it, and saves the audited result to `entries/<slug>.json`. Keep its prompts and JSON shape as they are.

## Entry JSON shape (from the script)
- `topic`, `category`, `hook`
- `camps[]` — each with `name`, `one_liner`, `why_people_believe_this`, `strongest_arguments[]`, `weakest_arguments[]` (each `{point, explanation}`)
- `common_ground`, `questions_to_sit_with[]`
- `disclaimer`, `generated_at`, `audit`

## Build these pages
1. **Home** — search bar, a "Trending" row, and category tiles (Aliens, AI, Politics with subcategories, Health, Science, Society, Conspiracies, Philosophy).
2. **Topic page** — before showing anything, ask: "Which of these is closest to what you believe?" listing each camp's `name` + `one_liner`, plus "Not sure" and "Something else".
   - After they pick: show their camp first, labelled "Your side", then every other camp, labelled "The other side(s)".
   - Each camp shows "Why people believe this", then "Strongest arguments" and "Weakest arguments" side by side.
   - Then "Where most people agree" (`common_ground`) and "Questions to sit with".
   - Show the AI `disclaimer` clearly at the top and bottom.
   - Every camp must get identical visual weight — same card size, colour treatment, font. No camp gets a warning colour.
3. **Search** — searches existing entries. If no entry exists, show "We haven't covered this yet" with a button to request it (save requests to a simple list for now).

## Rules
- Store the user's chosen side only in their own browser. No accounts, no tracking of beliefs on a server.
- Leave clearly marked empty slots for ads, but no ads yet. Ads must never sit inside or between camp cards.
- Mobile-first, clean, a bit playful in tone.
- Tell me exact step-by-step instructions for running it locally and deploying it, including every terminal command (I use PowerShell on Windows), and say for each file whether it's new or replacing something.

Start by proposing the folder structure and tech stack in a few lines, then build it.
