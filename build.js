// The Other Side — static site builder
// Reads entries/*.json + site.config.json and writes a complete static site to dist/.
//
// Usage:  node build.js

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");
const ENTRIES_DIR = path.join(ROOT, "entries");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "site.config.json"), "utf8"));

// ---------- helpers ----------
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const slugify = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

function write(rel, content) {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// "Politics / Elections" or "Politics: Elections" -> { parent: "Politics", sub: "Elections" }
function splitCategory(cat) {
  const [parent, sub] = String(cat || "General").split(/\s*[\/:>]\s*/);
  return { parent: parent.trim(), sub: sub ? sub.trim() : null };
}

// Empty, clearly marked ad slot. Never place inside or between camp cards.
const adSlot = (id) =>
  `\n<!-- AD SLOT: ${id} — empty for now. Never move this inside or between camp cards. -->\n<div class="ad-slot" data-ad-slot="${id}" aria-hidden="true"></div>\n`;

// ---------- load entries ----------
const entries = fs.existsSync(ENTRIES_DIR)
  ? fs
      .readdirSync(ENTRIES_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const data = JSON.parse(fs.readFileSync(path.join(ENTRIES_DIR, f), "utf8"));
        return { ...data, slug: path.basename(f, ".json"), cat: splitCategory(data.category) };
      })
      .sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)))
  : [];

const bySlug = Object.fromEntries(entries.map((e) => [e.slug, e]));
const categoryOf = (name) =>
  config.categories.find((c) => c.name.toLowerCase() === String(name).toLowerCase());

// ---------- layout ----------
const SITE_URL = config.siteUrl.replace(/\/$/, "");

function layout({ title, description, body, bodyClass = "", path: pagePath = "/" }) {
  const fullTitle = title ? `${title} · ${config.siteName}` : `${config.siteName} — ${config.tagline}`;
  const url = SITE_URL + pagePath;
  const desc = description || config.tagline;
  // On the home page, tell Google the site's name so results show "The Other Side"
  const siteSchema =
    pagePath === "/"
      ? `<script type="application/ld+json">${JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: config.siteName,
          url: SITE_URL + "/",
          potentialAction: {
            "@type": "SearchAction",
            target: SITE_URL + "/search/?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        })}</script>`
      : "";
  return `<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:site_name" content="${esc(config.siteName)}">
<meta property="og:title" content="${esc(title || config.siteName)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
${siteSchema}
<script>document.documentElement.classList.replace("no-js","js")</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🪞</text></svg>">
</head>
<body class="${bodyClass}">
<header class="site-header">
  <div class="wrap header-inner">
    <a class="logo" href="/"><span class="logo-mark">◐</span> ${esc(config.siteName)}</a>
    <a class="header-search" href="/search/" aria-label="Search">Search</a>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p>${esc(config.siteName)} shows you the views your feed hides. It never tells you which one to pick.</p>
    <p class="muted">No accounts. Your answers stay in your own browser.</p>
  </div>
</footer>
<script src="/app.js" defer></script>
</body>
</html>`;
}

const topicCard = (e) => `
<a class="topic-card" href="/topic/${e.slug}/">
  <span class="topic-card-cat">${esc(e.cat.sub ? `${e.cat.parent} · ${e.cat.sub}` : e.cat.parent)}</span>
  <span class="topic-card-title">${esc(e.topic)}</span>
  <span class="topic-card-hook">${esc(e.hook)}</span>
  <span class="topic-card-meta">${(e.camps || []).length} sides</span>
</a>`;

const searchForm = (value = "", autofocus = false) => `
<form class="search-form" action="/search/" method="get" role="search">
  <input type="search" name="q" value="${esc(value)}" placeholder="Try “aliens”, “AI jobs”, “free will”…" aria-label="Search topics" ${autofocus ? "autofocus" : ""}>
  <button type="submit">Search</button>
</form>`;

// ---------- home ----------
function buildHome() {
  const trending = config.trending.map((s) => bySlug[s]).filter(Boolean);
  // Fill trending with newest entries if the hand-picked list is short
  for (const e of entries) {
    if (trending.length >= 6) break;
    if (!trending.includes(e)) trending.push(e);
  }

  const tiles = config.categories
    .map((c) => {
      const count = entries.filter((e) => e.cat.parent.toLowerCase() === c.name.toLowerCase()).length;
      const subs = c.subcategories
        ? `<span class="tile-subs">${c.subcategories.map(esc).join(" · ")}</span>`
        : "";
      return `
<a class="tile" href="/category/${slugify(c.name)}/">
  <span class="tile-emoji" aria-hidden="true">${c.emoji || "💬"}</span>
  <span class="tile-name">${esc(c.name)}</span>
  <span class="tile-blurb">${esc(c.blurb || "")}</span>
  ${subs}
  <span class="tile-count">${count} ${count === 1 ? "topic" : "topics"}</span>
</a>`;
    })
    .join("");

  const body = `
<section class="hero">
  <h1>Your feed shows you <em>one</em> side.<br>Here are the rest.</h1>
  <p class="lede">Pick a topic, tell us (privately) where you stand, and see every major view explained fairly — including the ones your algorithm keeps from you. Keep your view or change it. We genuinely don't mind.</p>
  ${searchForm("", false)}
</section>

<section class="section">
  <h2 class="section-title">🔥 Trending</h2>
  ${
    trending.length
      ? `<div class="row-scroll">${trending.map(topicCard).join("")}</div>`
      : `<p class="muted">No topics yet. Run the generator to add your first one.</p>`
  }
</section>
${adSlot("home-mid")}
<section class="section">
  <h2 class="section-title">Browse by category</h2>
  <div class="tiles">${tiles}</div>
</section>`;

  write("index.html", layout({ body }));
}

// ---------- category ----------
function buildCategories() {
  for (const c of config.categories) {
    const list = entries.filter((e) => e.cat.parent.toLowerCase() === c.name.toLowerCase());
    let content;
    if (c.subcategories) {
      const groups = [...c.subcategories, null].map((sub) => {
        const items = list.filter((e) =>
          sub ? (e.cat.sub || "").toLowerCase() === sub.toLowerCase()
              : !c.subcategories.some((s) => s.toLowerCase() === (e.cat.sub || "").toLowerCase())
        );
        if (!sub && !items.length) return "";
        return `
<section class="section" id="${slugify(sub || "other")}">
  <h2 class="section-title">${esc(sub || "Other")}</h2>
  ${items.length ? `<div class="grid">${items.map(topicCard).join("")}</div>` : `<p class="muted">Nothing here yet.</p>`}
</section>`;
      });
      const chips = c.subcategories
        .map((s) => `<a class="chip" href="#${slugify(s)}">${esc(s)}</a>`)
        .join("");
      content = `<nav class="chips" aria-label="Subcategories">${chips}</nav>${groups.join("")}`;
    } else {
      content = list.length
        ? `<div class="grid">${list.map(topicCard).join("")}</div>`
        : `<p class="muted">Nothing here yet — <a href="/search/">request a topic</a>.</p>`;
    }

    const body = `
<p class="crumbs"><a href="/">Home</a> / ${esc(c.name)}</p>
<h1 class="page-title"><span aria-hidden="true">${c.emoji || ""}</span> ${esc(c.name)}</h1>
<p class="lede">${esc(c.blurb || "")}</p>
${content}
${adSlot(`category-${slugify(c.name)}-bottom`)}`;
    write(`category/${slugify(c.name)}/index.html`, layout({ title: c.name, description: c.blurb, body, path: `/category/${slugify(c.name)}/` }));
  }
}

// ---------- topic ----------
function argList(items) {
  return `<ul class="arg-list">${(items || [])
    .map((a) => `<li><strong>${esc(a.point)}</strong><span>${esc(a.explanation)}</span></li>`)
    .join("")}</ul>`;
}

// Every camp uses this exact markup: same size, colour and type. Do not vary it per camp.
function campCard(camp, i) {
  return `
<article class="camp" data-camp="${i}" id="camp-${i}">
  <h3 class="camp-name">${esc(camp.name)}</h3>
  <p class="camp-oneliner">“${esc(camp.one_liner)}”</p>
  <h4>Why people believe this</h4>
  <p>${esc(camp.why_people_believe_this)}</p>
  <div class="args">
    <div class="args-col">
      <h4>Strongest arguments</h4>
      ${argList(camp.strongest_arguments)}
    </div>
    <div class="args-col">
      <h4>Weakest arguments</h4>
      ${argList(camp.weakest_arguments)}
    </div>
  </div>
</article>`;
}

function buildTopic(e) {
  const camps = e.camps || [];
  const catLink = categoryOf(e.cat.parent)
    ? `<a href="/category/${slugify(e.cat.parent)}/">${esc(e.cat.parent)}</a>`
    : esc(e.cat.parent);
  const disclaimer = `<aside class="disclaimer"><span aria-hidden="true">🤖</span> ${esc(e.disclaimer)}</aside>`;

  const options = camps
    .map(
      (c, i) => `
  <button type="button" class="pick" data-choice="${i}">
    <span class="pick-name">${esc(c.name)}</span>
    <span class="pick-line">${esc(c.one_liner)}</span>
  </button>`
    )
    .join("");

  const audit = e.audit || {};
  const problems = Array.isArray(audit.problems_fixed) ? audit.problems_fixed : [];
  const auditBlock = `
<details class="audit">
  <summary>How this page was made</summary>
  <p>An AI wrote a first draft explaining every camp. A second AI was then told to assume the draft was biased, hunt for unfairness, and rewrite it.
  ${audit.balance_score_of_draft ? `It scored the first draft <strong>${esc(audit.balance_score_of_draft)}/10</strong> for even-handedness` : ""}${problems.length ? ` and fixed ${problems.length} problem${problems.length === 1 ? "" : "s"}:` : "."}</p>
  ${problems.length ? `<ul>${problems.map((p) => `<li>${esc(p.issue)} <span class="muted">— fix: ${esc(p.fix)}</span></li>`).join("")}</ul>` : ""}
  ${audit.note ? `<p class="muted">${esc(audit.note)}</p>` : ""}
  <p class="muted">Generated ${esc(String(e.generated_at || "").slice(0, 10))}.</p>
</details>`;

  const body = `
<p class="crumbs"><a href="/">Home</a> / ${catLink}${e.cat.sub ? ` / ${esc(e.cat.sub)}` : ""}</p>
${disclaimer}
<h1 class="page-title">${esc(e.topic)}</h1>
<p class="lede">${esc(e.hook)}</p>
${adSlot("topic-top")}
<section class="picker" id="picker" data-slug="${e.slug}">
  <h2>Which of these is closest to what you believe?</h2>
  <p class="muted small">Your answer is saved only in this browser. We never see it.</p>
  <div class="picks">
    ${options}
    <button type="button" class="pick pick-alt" data-choice="unsure"><span class="pick-name">Not sure</span><span class="pick-line">Honestly, I haven't made up my mind.</span></button>
    <button type="button" class="pick pick-alt" data-choice="other"><span class="pick-name">Something else</span><span class="pick-line">None of these quite fit me.</span></button>
  </div>
</section>

<section class="results" id="results" tabindex="-1">
  <div class="results-bar">
    <span id="choice-label"></span>
    <button type="button" class="link-btn" id="change-choice">Change my answer</button>
  </div>
  <p class="choice-note" id="choice-note" hidden></p>

  <section class="side" id="your-side" hidden>
    <h2 class="side-title">Your side</h2>
    <div class="side-cards" id="your-side-cards"></div>
  </section>

  <section class="side" id="other-sides">
    <h2 class="side-title" id="other-sides-title">The other sides</h2>
    <div class="side-cards" id="other-sides-cards">
      ${camps.map(campCard).join("")}
    </div>
  </section>

  <section class="section common">
    <h2 class="section-title">🤝 Where most people agree</h2>
    <p>${esc(e.common_ground)}</p>
  </section>

  <section class="section">
    <h2 class="section-title">💭 Questions to sit with</h2>
    <ol class="questions">${(e.questions_to_sit_with || []).map((q) => `<li>${esc(q)}</li>`).join("")}</ol>
  </section>

  ${auditBlock}
</section>
${adSlot("topic-bottom")}
${disclaimer}`;

  write(`topic/${e.slug}/index.html`, layout({ title: e.topic, description: e.hook, body, bodyClass: "page-topic", path: `/topic/${e.slug}/` }));
}

// ---------- search ----------
function buildSearch() {
  const body = `
<h1 class="page-title">Search</h1>
${searchForm("", true)}
<div id="search-results" class="grid" aria-live="polite"></div>

<section class="not-covered" id="not-covered" hidden>
  <h2>We haven't covered this yet</h2>
  <p>Want us to? Request it and we'll add it to the list.</p>
  <!-- Request list: stored by Netlify Forms when deployed, and in requests.json when running locally. Only the topic text is sent. -->
  <form name="topic-request" method="POST" data-netlify="true" netlify-honeypot="bot-field" id="request-form" action="/search/?requested=1">
    <input type="hidden" name="form-name" value="topic-request">
    <p hidden><label>Leave this empty <input name="bot-field"></label></p>
    <label class="sr-only" for="request-topic">Topic</label>
    <input id="request-topic" name="topic" required maxlength="200" placeholder="What topic should we cover?">
    <button type="submit">Request this topic</button>
  </form>
  <p class="request-thanks" id="request-thanks" hidden>Thanks! It's on the list. 🙌</p>
</section>
${adSlot("search-bottom")}`;
  write("search/index.html", layout({ title: "Search", body, path: "/search/" }));

  const index = entries.map((e) => ({
    slug: e.slug,
    topic: e.topic,
    hook: e.hook,
    category: e.cat.sub ? `${e.cat.parent} · ${e.cat.sub}` : e.cat.parent,
    camps: (e.camps || []).map((c) => c.name),
    text: [e.topic, e.category, e.hook, ...(e.camps || []).flatMap((c) => [c.name, c.one_liner])].join(" ").toLowerCase(),
  }));
  write("search-index.json", JSON.stringify(index));
}

function build404() {
  const body = `
<h1 class="page-title">Hmm, nothing on this side.</h1>
<p class="lede">That page doesn't exist. Try searching instead.</p>
${searchForm()}`;
  const html = layout({ title: "Not found", body, path: "/404" });
  write("404.html", html.replace("<head>", '<head>\n<meta name="robots" content="noindex">'));
}

// sitemap.xml + robots.txt so search engines can find every page
function buildSeoFiles() {
  const paths = [
    "/",
    "/search/",
    ...config.categories.map((c) => `/category/${slugify(c.name)}/`),
    ...entries.map((e) => `/topic/${e.slug}/`),
  ];
  const lastmod = (p) => {
    const e = entries.find((x) => p === `/topic/${x.slug}/`);
    return e?.generated_at ? `<lastmod>${String(e.generated_at).slice(0, 10)}</lastmod>` : "";
  };
  write(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths
      .map((p) => `  <url><loc>${esc(SITE_URL + p)}</loc>${lastmod(p)}</url>`)
      .join("\n")}\n</urlset>\n`
  );
  write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
}

// ---------- run ----------
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const f of ["styles.css", "app.js"]) fs.copyFileSync(path.join(ROOT, "src", f), path.join(DIST, f));
buildHome();
buildCategories();
entries.forEach(buildTopic);
buildSearch();
build404();
buildSeoFiles();

const unknown = entries.filter((e) => !categoryOf(e.cat.parent));
console.log(`Built ${entries.length} topic page(s) into dist/`);
if (unknown.length)
  console.warn(`Note: these entries use a category not in site.config.json: ${unknown.map((e) => `${e.slug} (${e.category})`).join(", ")}`);
