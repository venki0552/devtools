import toolsMeta from './tools-meta.json'

/**
 * Canonical site metadata — single source of truth shared with the
 * build scripts (scripts/postbuild-seo.mjs) via tools-meta.json.
 */
export const SITE_URL = toolsMeta.site.url
export const SITE_NAME = toolsMeta.site.name
export const SITE_TITLE = toolsMeta.site.title
export const SITE_DESCRIPTION = toolsMeta.site.description
export const SITE_REPOSITORY = toolsMeta.site.repository
export const OG_IMAGE_URL = `${SITE_URL}${toolsMeta.site.ogImage}`
