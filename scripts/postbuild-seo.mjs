/**
 * Post-build SEO pass. Runs after `vite build` (see package.json).
 *
 * 1. Generates dist/sitemap.xml from src/lib/tools-meta.json.
 * 2. Prerenders one static HTML page per tool route (dist/<route>/index.html)
 *    with route-specific <title>, meta description, canonical, Open Graph,
 *    Twitter, and JSON-LD tags — so crawlers that don't execute JavaScript
 *    (most LLM crawlers: GPTBot, ClaudeBot, PerplexityBot, CCBot, …) still
 *    see correct, unique metadata and content for every page.
 * 3. Injects a static, crawlable tool list into the home page body.
 *
 * React replaces the static body content on mount, so users see the app;
 * crawlers without JS see real HTML instead of an empty <div id="root">.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");

const meta = JSON.parse(
	await readFile(path.join(rootDir, "src/lib/tools-meta.json"), "utf8"),
);
const { site, tools } = meta;

const esc = (s) =>
	s
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

// ---------------------------------------------------------------- sitemap
const today = new Date().toISOString().slice(0, 10);
const urlEntry = (loc, priority) => `	<url>
		<loc>${loc}</loc>
		<lastmod>${today}</lastmod>
		<changefreq>monthly</changefreq>
		<priority>${priority}</priority>
	</url>`;

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[urlEntry(`${site.url}/`, "1.0"), ...tools.map((t) => urlEntry(`${site.url}${t.route}`, "0.8"))].join("\n")}
</urlset>
`;
await writeFile(path.join(distDir, "sitemap.xml"), sitemap);

// -------------------------------------------------------------- prerender
const template = await readFile(path.join(distDir, "index.html"), "utf8");
const SEO_REGION = /<!-- seo:start[\s\S]*?seo:end -->/;
const ROOT_DIV = /<div id="root">\s*<\/div>/;

if (!SEO_REGION.test(template) || !ROOT_DIV.test(template)) {
	throw new Error(
		"dist/index.html is missing the <!-- seo:start --> markers or an empty #root div — check index.html",
	);
}

function headFor(tool) {
	const title = tool ? `${tool.name} | ${site.name}` : site.title;
	const description = tool ? tool.description : site.description;
	const canonical = tool ? `${site.url}${tool.route}` : `${site.url}/`;
	const ogImage = `${site.url}${site.ogImage}`;
	const jsonLd = tool
		? {
				"@context": "https://schema.org",
				"@type": "WebApplication",
				name: tool.name,
				description: tool.description,
				url: canonical,
				applicationCategory: "DeveloperApplication",
				operatingSystem: "Any",
				browserRequirements: "Requires JavaScript",
				offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
				isPartOf: { "@type": "WebSite", name: site.name, url: `${site.url}/` },
			}
		: {
				"@context": "https://schema.org",
				"@type": "WebSite",
				name: site.name,
				url: `${site.url}/`,
				description: site.description,
			};

	return `<title>${esc(title)}</title>
		<meta name="description" content="${esc(description)}" />
		${tool ? `<meta name="keywords" content="${esc(tool.keywords.join(", "))}" />\n\t\t` : ""}<link rel="canonical" href="${canonical}" />
		<meta property="og:title" content="${esc(title)}" />
		<meta property="og:description" content="${esc(description)}" />
		<meta property="og:type" content="website" />
		<meta property="og:url" content="${canonical}" />
		<meta property="og:site_name" content="${esc(site.name)}" />
		<meta property="og:image" content="${ogImage}" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="${esc(title)}" />
		<meta name="twitter:description" content="${esc(description)}" />
		<meta name="twitter:image" content="${ogImage}" />
		<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;
}

const toolLinks = tools
	.map((t) => `<li><a href="${t.route}">${esc(t.name)}</a> — ${esc(t.description)}</li>`)
	.join("\n\t\t\t\t");

function bodyFor(tool) {
	// Static fallback content, replaced by React on mount. Real HTML for
	// non-JS crawlers; minimal inline styling so the pre-hydration flash
	// matches the app's dark theme.
	const inner = tool
		? `<h1>${esc(tool.name)}</h1>
				<p>${esc(tool.description)}</p>
				<p>Free, open source, and runs entirely in your browser — no signup, no tracking, your data never leaves your machine.</p>
				<p><a href="/">← All ${tools.length} developer tools</a></p>`
		: `<h1>${esc(site.title)}</h1>
				<p>${esc(site.description)}</p>
				<ul>
				${toolLinks}
				</ul>`;

	return `<div id="root"><main style="font-family:system-ui,sans-serif;background:#09090b;color:#fafafa;min-height:100vh;padding:2rem;box-sizing:border-box">
				${inner}
			</main></div>`;
}

function pageFor(tool) {
	return template
		.replace(SEO_REGION, headFor(tool))
		.replace(ROOT_DIV, bodyFor(tool));
}

// Home page: keep the (already correct) head, add crawlable body content.
await writeFile(
	path.join(distDir, "index.html"),
	template.replace(SEO_REGION, headFor(null)).replace(ROOT_DIV, bodyFor(null)),
);

for (const tool of tools) {
	const dir = path.join(distDir, tool.route.slice(1));
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, "index.html"), pageFor(tool));
}

console.log(
	`postbuild-seo: sitemap.xml + ${tools.length} prerendered routes written to dist/`,
);
