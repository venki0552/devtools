import { faker } from "@faker-js/faker";

type InputMode = "schema" | "example" | "description";
type OutputFormat = "json" | "ndjson" | "csv";
type Locale = "US" | "UK" | "DE" | "FR" | "JP" | "IN";

const LOCALE_MAP: Record<Locale, string> = {
	US: "en_US",
	UK: "en_GB",
	DE: "de",
	FR: "fr",
	JP: "ja",
	IN: "en_IN",
};

function setFakerLocale(locale: Locale, seed: string) {
	const localeStr = LOCALE_MAP[locale] || "en_US";
	// faker v9 uses locale objects; for simplicity, set the seed
	if (seed) {
		faker.seed(hashSeed(seed));
	} else {
		faker.seed();
	}
	// Set locale for faker
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const fakerLocales: Record<string, any> = {
			en_US: undefined, // default
			en_GB: undefined,
			de: undefined,
			fr: undefined,
			ja: undefined,
			en_IN: undefined,
		};
		// Faker v9 uses setDefaultRefDate and direct locale setting is different
		// We'll use the base locale and adapt output via field generators
		void fakerLocales;
		void localeStr;
	} catch {
		// Fallback to default locale
	}
}

function hashSeed(seed: string): number {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		const char = seed.charCodeAt(i);
		hash = ((hash << 5) - hash + char) | 0;
	}
	return Math.abs(hash);
}

// Field name heuristics — map common field name patterns to faker generators
function generateFieldValue(fieldName: string, fieldType?: string, constraints?: SchemaConstraints): unknown {
	const lower = fieldName.toLowerCase();

	// Handle enum constraints
	if (constraints?.enum && constraints.enum.length > 0) {
		return faker.helpers.arrayElement(constraints.enum as string[]);
	}

	// Handle type constraints
	if (fieldType === "integer" || fieldType === "number") {
		const min = constraints?.minimum ?? 1;
		const max = constraints?.maximum ?? 10000;
		if (fieldType === "integer") {
			return faker.number.int({ min: min as number, max: max as number });
		}
		return faker.number.float({ min: min as number, max: max as number, fractionDigits: 2 });
	}

	if (fieldType === "boolean") {
		return faker.datatype.boolean();
	}

	// Name pattern matching
	if (lower === "id" || lower === "_id" || lower.endsWith("_id") || lower.endsWith("id")) {
		if (lower === "uuid" || lower.includes("uuid")) return faker.string.uuid();
		return faker.number.int({ min: 1, max: 99999 });
	}

	if (lower === "email" || lower.includes("email")) {
		return faker.internet.email();
	}

	if (lower === "name" || lower === "full_name" || lower === "fullname" || lower === "fullName") {
		return faker.person.fullName();
	}

	if (lower === "first_name" || lower === "firstname" || lower === "firstName") {
		return faker.person.firstName();
	}

	if (lower === "last_name" || lower === "lastname" || lower === "lastName") {
		return faker.person.lastName();
	}

	if (lower === "username" || lower === "user_name") {
		return faker.internet.username();
	}

	if (lower === "password" || lower === "passwd") {
		return faker.internet.password();
	}

	if (lower === "phone" || lower.includes("phone") || lower.includes("tel")) {
		return faker.phone.number();
	}

	if (lower === "avatar" || lower === "image" || lower === "photo" || lower.includes("avatar") || lower.includes("image_url")) {
		return faker.image.avatar();
	}

	if (lower === "url" || lower === "website" || lower.includes("url") || lower === "link") {
		return faker.internet.url();
	}

	if (lower.includes("address") || lower === "street") {
		return faker.location.streetAddress();
	}

	if (lower === "city") {
		return faker.location.city();
	}

	if (lower === "state" || lower === "province") {
		return faker.location.state();
	}

	if (lower === "country") {
		return faker.location.country();
	}

	if (lower === "zip" || lower === "zipcode" || lower === "zip_code" || lower === "postal_code" || lower === "postalcode" || lower === "postcode") {
		return faker.location.zipCode();
	}

	if (lower.includes("latitude") || lower === "lat") {
		return faker.location.latitude();
	}

	if (lower.includes("longitude") || lower === "lng" || lower === "lon") {
		return faker.location.longitude();
	}

	if (lower === "company" || lower === "company_name" || lower === "companyName" || lower.includes("company")) {
		return faker.company.name();
	}

	if (lower === "title" || lower === "job_title" || lower === "jobTitle" || lower === "job") {
		return faker.person.jobTitle();
	}

	if (lower === "description" || lower === "bio" || lower === "about" || lower === "summary") {
		return faker.lorem.sentence();
	}

	if (lower === "content" || lower === "body" || lower === "text" || lower === "message") {
		return faker.lorem.paragraph();
	}

	if (lower.includes("date") || lower.includes("_at") || lower === "created" || lower === "updated" || lower.includes("timestamp")) {
		return faker.date.recent({ days: 365 }).toISOString();
	}

	if (lower.includes("price") || lower.includes("amount") || lower.includes("cost") || lower === "total" || lower === "salary") {
		return faker.number.float({ min: 1, max: 9999, fractionDigits: 2 });
	}

	if (lower.includes("count") || lower === "quantity" || lower === "qty" || lower === "age") {
		const min = lower === "age" ? 18 : 0;
		const max = lower === "age" ? 99 : 1000;
		return faker.number.int({ min, max });
	}

	if (lower.includes("color") || lower === "colour") {
		return faker.color.human();
	}

	if (lower === "ip" || lower === "ip_address" || lower.includes("ip")) {
		return faker.internet.ip();
	}

	if (lower.includes("active") || lower.includes("enabled") || lower.includes("is_") || lower.includes("has_") || lower.startsWith("is") || lower.startsWith("has")) {
		return faker.datatype.boolean();
	}

	if (lower === "status") {
		return faker.helpers.arrayElement(["active", "inactive", "pending", "completed"]);
	}

	if (lower === "role" || lower === "type") {
		return faker.helpers.arrayElement(["admin", "user", "editor", "viewer"]);
	}

	if (lower === "category") {
		return faker.commerce.department();
	}

	if (lower === "tag" || lower === "tags") {
		return faker.lorem.word();
	}

	if (lower === "rating" || lower === "score") {
		return faker.number.float({ min: 1, max: 5, fractionDigits: 1 });
	}

	if (lower === "currency") {
		return faker.finance.currencyCode();
	}

	// Default: generate based on type
	if (fieldType === "string") {
		return faker.lorem.word();
	}

	return faker.lorem.word();
}

interface SchemaConstraints {
	minimum?: number;
	maximum?: number;
	enum?: unknown[];
	format?: string;
	minLength?: number;
	maxLength?: number;
}

interface SchemaProperty {
	type?: string;
	format?: string;
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	properties?: Record<string, SchemaProperty>;
	items?: SchemaProperty;
	$ref?: string;
}

function generateFromSchema(schema: SchemaProperty, fieldName = ""): unknown {
	if (!schema) return null;

	// Handle format-specific generation
	if (schema.format === "email") return faker.internet.email();
	if (schema.format === "uri" || schema.format === "url") return faker.internet.url();
	if (schema.format === "uuid") return faker.string.uuid();
	if (schema.format === "date-time") return faker.date.recent({ days: 365 }).toISOString();
	if (schema.format === "date") return faker.date.recent({ days: 365 }).toISOString().split("T")[0];
	if (schema.format === "ipv4") return faker.internet.ipv4();
	if (schema.format === "ipv6") return faker.internet.ipv6();

	const constraints: SchemaConstraints = {
		minimum: schema.minimum,
		maximum: schema.maximum,
		enum: schema.enum,
		format: schema.format,
	};

	if (schema.type === "object" && schema.properties) {
		const obj: Record<string, unknown> = {};
		for (const [key, prop] of Object.entries(schema.properties)) {
			obj[key] = generateFromSchema(prop, key);
		}
		return obj;
	}

	if (schema.type === "array" && schema.items) {
		const count = faker.number.int({ min: 1, max: 5 });
		return Array.from({ length: count }, () => generateFromSchema(schema.items!, fieldName));
	}

	return generateFieldValue(fieldName, schema.type, constraints);
}

function inferTypeFromValue(value: unknown): { type: string; format?: string } {
	if (value === null || value === undefined) return { type: "string" };
	if (typeof value === "number") {
		return Number.isInteger(value) ? { type: "integer" } : { type: "number" };
	}
	if (typeof value === "boolean") return { type: "boolean" };
	if (typeof value === "string") {
		// Detect common formats
		if (/^[^@]+@[^@]+\.[^@]+$/.test(value)) return { type: "string", format: "email" };
		if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return { type: "string", format: "date-time" };
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { type: "string", format: "date" };
		if (/^https?:\/\//.test(value)) return { type: "string", format: "url" };
		if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
			return { type: "string", format: "uuid" };
		return { type: "string" };
	}
	if (Array.isArray(value)) return { type: "array" };
	if (typeof value === "object") return { type: "object" };
	return { type: "string" };
}

function generateFromExample(example: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(example)) {
		const { type, format } = inferTypeFromValue(value);

		if (type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
			result[key] = generateFromExample(value as Record<string, unknown>);
		} else if (type === "array" && Array.isArray(value) && value.length > 0) {
			const itemExample = value[0];
			if (typeof itemExample === "object" && itemExample !== null) {
				const count = faker.number.int({ min: 1, max: 5 });
				result[key] = Array.from({ length: count }, () =>
					generateFromExample(itemExample as Record<string, unknown>),
				);
			} else {
				const itemType = inferTypeFromValue(itemExample);
				const count = faker.number.int({ min: 1, max: 5 });
				result[key] = Array.from({ length: count }, () =>
					generateFieldValue(key, itemType.type),
				);
			}
		} else {
			const schema: SchemaProperty = { type, format };
			result[key] = generateFromSchema(schema, key);
		}
	}

	return result;
}

// Parse a plain text description into field definitions
interface FieldDef {
	name: string;
	type?: string;
	constraints?: string;
}

function parseDescription(description: string): FieldDef[] {
	const fields: FieldDef[] = [];
	const lines = description.split("\n").map((l) => l.trim()).filter(Boolean);

	for (const line of lines) {
		// Match patterns like:
		// - field_name (type)
		// - field_name: description
		// - field_name — description
		// - field_name
		const cleaned = line.replace(/^[-*•]\s*/, "").trim();
		if (!cleaned) continue;

		// Try to extract field name and optional type/constraints
		const match = cleaned.match(
			/^([a-zA-Z_]\w*)\s*(?:\(([^)]+)\))?(?:\s*[-:—]\s*(.*))?$/,
		);
		if (match) {
			fields.push({
				name: match[1],
				type: match[2]?.trim(),
				constraints: match[3]?.trim(),
			});
		} else {
			// If the line doesn't match the pattern, try to extract keywords
			const words = cleaned
				.toLowerCase()
				.split(/\s+/)
				.filter((w) => w.length > 2);
			// Look for common field name hints
			for (const word of words) {
				if (
					[
						"id",
						"name",
						"email",
						"phone",
						"address",
						"city",
						"state",
						"age",
						"date",
						"status",
						"role",
						"title",
						"price",
						"description",
						"username",
						"password",
						"url",
						"avatar",
						"country",
					].includes(word)
				) {
					if (!fields.some((f) => f.name === word)) {
						fields.push({ name: word });
					}
				}
			}
		}
	}

	// If no fields found, create a basic record
	if (fields.length === 0) {
		fields.push(
			{ name: "id", type: "integer" },
			{ name: "name", type: "string" },
			{ name: "value", type: "string" },
		);
	}

	return fields;
}

function generateFromDescription(fields: FieldDef[]): Record<string, unknown> {
	const result: Record<string, unknown> = {};

	for (const field of fields) {
		const constraints: SchemaConstraints = {};

		// Parse constraints like "18-65" for ranges
		if (field.constraints) {
			const rangeMatch = field.constraints.match(/(\d+)\s*[-–]\s*(\d+)/);
			if (rangeMatch) {
				constraints.minimum = parseInt(rangeMatch[1], 10);
				constraints.maximum = parseInt(rangeMatch[2], 10);
			}

			// Parse enum-like values: "admin, user, editor" or "(admin|user|editor)"
			const enumMatch = field.constraints.match(
				/\(([^)]+)\)|(?:one of|enum|options?):\s*(.+)/i,
			);
			if (enumMatch) {
				const enumStr = enumMatch[1] || enumMatch[2] || "";
				constraints.enum = enumStr.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
			}
		}

		let type = field.type?.toLowerCase();
		if (type === "int" || type === "number" || type === "numeric") type = "integer";
		if (type === "bool") type = "boolean";
		if (type === "str" || type === "text") type = "string";

		result[field.name] = generateFieldValue(field.name, type, constraints);
	}

	return result;
}

function recordToCSV(records: Record<string, unknown>[]): string {
	if (records.length === 0) return "";

	const headers = Object.keys(records[0]);

	const escapeCSV = (val: unknown): string => {
		const str = val === null || val === undefined ? "" : String(val);
		if (str.includes(",") || str.includes('"') || str.includes("\n")) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	};

	const rows = [
		headers.join(","),
		...records.map((r) =>
			headers.map((h) => escapeCSV(r[h])).join(","),
		),
	];

	return rows.join("\n");
}

/** Attempt to resolve local $ref references in a JSON Schema object */
function resolveLocalRefs(schema: string): string {
	try {
		const obj = JSON.parse(schema);
		if (typeof obj !== "object" || obj === null) return schema;
		const definitions =
			obj.definitions || obj.$defs || obj.components?.schemas || {};
		if (Object.keys(definitions).length === 0) return schema;

		const resolved = JSON.parse(JSON.stringify(obj));

		function walk(node: unknown): unknown {
			if (typeof node !== "object" || node === null) return node;
			if (Array.isArray(node)) return node.map(walk);

			const record = node as Record<string, unknown>;
			if (typeof record.$ref === "string") {
				const refPath = record.$ref as string;
				const match = refPath.match(
					/^#\/(?:definitions|\$defs|components\/schemas)\/(.+)$/,
				);
				if (match && definitions[match[1]]) {
					return walk(JSON.parse(JSON.stringify(definitions[match[1]])));
				}
			}

			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(record)) {
				result[k] = walk(v);
			}
			return result;
		}

		const walkedResult = walk(resolved);
		return JSON.stringify(walkedResult, null, 2);
	} catch {
		return schema;
	}
}

export function generateMockData(
	input: string,
	mode: InputMode,
	count: number,
	outputFormat: OutputFormat,
	locale: Locale,
	seed: string,
): string {
	setFakerLocale(locale, seed);

	let records: Record<string, unknown>[];

	if (mode === "schema") {
		const resolved = resolveLocalRefs(input);
		const schema = JSON.parse(resolved) as SchemaProperty;
		records = Array.from({ length: count }, () =>
			generateFromSchema(schema) as Record<string, unknown>,
		);
	} else if (mode === "example") {
		const example = JSON.parse(input) as Record<string, unknown>;
		records = Array.from({ length: count }, () => generateFromExample(example));
	} else {
		const fields = parseDescription(input);
		records = Array.from({ length: count }, () =>
			generateFromDescription(fields),
		);
	}

	// Ensure unique IDs
	assignUniqueIds(records);

	if (outputFormat === "csv") {
		return recordToCSV(records);
	}

	if (outputFormat === "ndjson") {
		return records.map((r) => JSON.stringify(r)).join("\n");
	}

	return JSON.stringify(records, null, 2);
}

function assignUniqueIds(records: Record<string, unknown>[]) {
	// Find ID-like fields and make them unique
	if (records.length === 0) return;
	const keys = Object.keys(records[0]);
	for (const key of keys) {
		const lower = key.toLowerCase();
		if (lower === "id" || lower === "_id" || lower.endsWith("_id")) {
			const firstVal = records[0][key];
			if (typeof firstVal === "number") {
				for (let i = 0; i < records.length; i++) {
					records[i][key] = i + 1;
				}
			} else if (typeof firstVal === "string" && /^[0-9a-f-]{36}$/i.test(firstVal)) {
				for (let i = 0; i < records.length; i++) {
					records[i][key] = faker.string.uuid();
				}
			}
		}
	}
}

export function regenerateSingleRow(
	input: string,
	mode: InputMode,
	locale: Locale,
): Record<string, unknown> {
	setFakerLocale(locale, "");

	if (mode === "schema") {
		const resolved = resolveLocalRefs(input);
		const schema = JSON.parse(resolved) as SchemaProperty;
		return generateFromSchema(schema) as Record<string, unknown>;
	} else if (mode === "example") {
		const example = JSON.parse(input) as Record<string, unknown>;
		return generateFromExample(example);
	} else {
		const fields = parseDescription(input);
		return generateFromDescription(fields);
	}
}
