import type { ReactNode } from "react";

interface SEOHeadProps {
	title: string;
	description: string;
	keywords?: string[];
	canonical?: string;
	children?: ReactNode;
}

export function SEOHead({
	title,
	description,
	keywords,
	canonical,
	children,
}: SEOHeadProps) {
	const fullTitle = `${title} | DevTools`;

	return (
		<>
			<title>{fullTitle}</title>
			<meta name='description' content={description} />
			{keywords && <meta name='keywords' content={keywords.join(", ")} />}
			{canonical && <link rel='canonical' href={canonical} />}
			{/* Open Graph */}
			<meta property='og:title' content={fullTitle} />
			<meta property='og:description' content={description} />
			<meta property='og:type' content='website' />
			{canonical && <meta property='og:url' content={canonical} />}
			{/* Twitter */}
			<meta name='twitter:card' content='summary' />
			<meta name='twitter:title' content={fullTitle} />
			<meta name='twitter:description' content={description} />
			{children}
		</>
	);
}
