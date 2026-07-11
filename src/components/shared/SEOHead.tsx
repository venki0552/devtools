import { Helmet } from "react-helmet-async";
import type { Tool } from "@/lib/constants";
import {
	SITE_URL,
	SITE_NAME,
	SITE_TITLE,
	SITE_DESCRIPTION,
	OG_IMAGE_URL,
} from "@/lib/site";

interface SEOHeadProps {
	/** Tool page metadata. Omit for the home page. */
	tool?: Tool;
}

/**
 * Per-route SEO: title, description, canonical, Open Graph, Twitter
 * cards, and JSON-LD structured data. The same tags are baked into the
 * prerendered HTML at build time (scripts/postbuild-seo.mjs) so crawlers
 * that don't execute JavaScript see identical metadata.
 */
export function SEOHead({ tool }: SEOHeadProps) {
	const title = tool ? `${tool.name} | ${SITE_NAME}` : SITE_TITLE;
	const description = tool ? tool.description : SITE_DESCRIPTION;
	const canonical = tool ? `${SITE_URL}${tool.route}` : `${SITE_URL}/`;

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
				isPartOf: { "@type": "WebSite", name: SITE_NAME, url: `${SITE_URL}/` },
			}
		: {
				"@context": "https://schema.org",
				"@type": "WebSite",
				name: SITE_NAME,
				description: SITE_DESCRIPTION,
				url: `${SITE_URL}/`,
			};

	return (
		<Helmet>
			<title>{title}</title>
			<meta name='description' content={description} />
			{tool && <meta name='keywords' content={tool.keywords.join(", ")} />}
			<link rel='canonical' href={canonical} />
			{/* Open Graph */}
			<meta property='og:title' content={title} />
			<meta property='og:description' content={description} />
			<meta property='og:type' content='website' />
			<meta property='og:url' content={canonical} />
			<meta property='og:site_name' content={SITE_NAME} />
			<meta property='og:image' content={OG_IMAGE_URL} />
			{/* Twitter */}
			<meta name='twitter:card' content='summary_large_image' />
			<meta name='twitter:title' content={title} />
			<meta name='twitter:description' content={description} />
			<meta name='twitter:image' content={OG_IMAGE_URL} />
			{/* Structured data */}
			<script type='application/ld+json'>{JSON.stringify(jsonLd)}</script>
		</Helmet>
	);
}
