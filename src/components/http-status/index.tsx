import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { TOOLS } from "@/lib/constants";
import { useLocalStorage } from "@/lib/use-local-storage";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { ToolPageHeader } from "@/components/shared/ToolPageHeader";
import { Search, Star, X, Copy, Check, Table, LayoutGrid } from "lucide-react";

const tool = TOOLS.find((t) => t.id === "http-status")!;

interface StatusCode {
	code: number;
	name: string;
	description: string;
	detail: string;
	causes: string[];
	clientAction: string;
	related: number[];
	unofficial?: boolean;
	headers?: string[];
	example?: string;
}

const STATUS_CODES: StatusCode[] = [
	// 1xx Informational
	{
		code: 100,
		name: "Continue",
		description:
			"The server has received the request headers and the client should proceed to send the request body.",
		detail:
			"Indicates that the initial part of a request has been received and has not yet been rejected by the server.",
		causes: [
			"Client sent Expect: 100-continue header",
			"Server acknowledges the request can proceed",
		],
		clientAction: "Continue sending the request body.",
		related: [101, 417],
	},
	{
		code: 101,
		name: "Switching Protocols",
		description:
			"The server is switching protocols as requested by the client.",
		detail:
			"The server understands and is willing to comply with the client's request to switch protocols.",
		causes: ["WebSocket upgrade request", "HTTP/2 upgrade"],
		clientAction: "Switch to the new protocol as agreed.",
		related: [100, 426],
	},
	// 2xx Success
	{
		code: 200,
		name: "OK",
		description: "The request has succeeded.",
		detail:
			"Standard response for successful HTTP requests. The actual response depends on the request method used.",
		causes: ["Successful GET, POST, PUT, or DELETE request"],
		clientAction: "Process the response body as expected.",
		related: [201, 204],
		headers: ["Content-Type", "Content-Length"],
		example: 'GET /api/users/1 → 200 OK { "id": 1, "name": "Alice" }',
	},
	{
		code: 201,
		name: "Created",
		description:
			"The request has been fulfilled and a new resource has been created.",
		detail:
			"Typically sent after POST or PUT requests that result in a new resource being created.",
		causes: ["Successful resource creation via POST or PUT"],
		clientAction:
			"Use the Location header or response body to find the new resource.",
		related: [200, 204, 409],
		headers: ["Location", "Content-Type"],
		example:
			'POST /api/users { "name": "Alice" } → 201 Created Location: /api/users/42',
	},
	{
		code: 202,
		name: "Accepted",
		description:
			"The request has been accepted for processing, but the processing has not been completed.",
		detail:
			"The request might or might not eventually be acted upon, as it might be disallowed when processing actually takes place.",
		causes: ["Asynchronous processing accepted", "Batch job queued"],
		clientAction: "Poll for status or wait for a callback/webhook.",
		related: [200, 204],
	},
	{
		code: 203,
		name: "Non-Authoritative Information",
		description:
			"The returned metadata is not exactly the same as available from the origin server.",
		detail:
			"The request was successful but the enclosed payload has been modified by a transforming proxy.",
		causes: ["Response modified by a proxy or CDN"],
		clientAction:
			"Use the response data, but be aware it may have been transformed.",
		related: [200],
	},
	{
		code: 204,
		name: "No Content",
		description:
			"The server has fulfilled the request but there is no content to return.",
		detail:
			"The server successfully processed the request and is not returning any content.",
		causes: [
			"Successful DELETE request",
			"Successful PUT with no response body needed",
		],
		clientAction:
			"Do not expect a response body. Update local state as needed.",
		related: [200, 201, 304],
		example: "DELETE /api/users/42 → 204 No Content",
	},
	{
		code: 205,
		name: "Reset Content",
		description:
			"The server has fulfilled the request and the client should reset the document view.",
		detail: "Tells the client to reset the document which sent this request.",
		causes: ["Successful form submission requiring view reset"],
		clientAction: "Reset the form or document view.",
		related: [204],
	},
	{
		code: 206,
		name: "Partial Content",
		description:
			"The server is delivering only part of the resource due to a range header.",
		detail:
			"The server has fulfilled the partial GET request for the resource using the Range header.",
		causes: [
			"Client requested a byte range",
			"Streaming media",
			"Resumable download",
		],
		clientAction:
			"Combine with other partial responses or request remaining range(s).",
		related: [200, 416],
	},
	// 3xx Redirection
	{
		code: 300,
		name: "Multiple Choices",
		description: "Multiple options for the resource are available.",
		detail:
			"Indicates multiple possible responses. The user or user agent should choose one of them.",
		causes: ["Resource available in multiple formats", "Content negotiation"],
		clientAction:
			"Select one of the choices, typically via the Location header or response body.",
		related: [301, 302],
	},
	{
		code: 301,
		name: "Moved Permanently",
		description: "The resource has been permanently moved to a new URL.",
		detail:
			"All future requests should be directed to the new URI. Search engines will update their links.",
		causes: [
			"URL restructuring",
			"Domain migration",
			"Permanent redirect configured",
		],
		clientAction:
			"Update bookmarks and links to use the new URL from the Location header.",
		related: [302, 308],
		headers: ["Location"],
		example: "GET /old-page → 301 Moved Permanently Location: /new-page",
	},
	{
		code: 302,
		name: "Found",
		description: "The resource resides temporarily under a different URL.",
		detail:
			"The resource was found but at a different URI. The client should continue to use the original URI for future requests.",
		causes: ["Temporary redirect", "Load balancing", "A/B testing"],
		clientAction:
			"Follow the redirect but continue using the original URL for future requests.",
		related: [301, 303, 307],
		headers: ["Location"],
		example: "POST /login → 302 Found Location: /dashboard",
	},
	{
		code: 303,
		name: "See Other",
		description: "The response can be found under a different URL using GET.",
		detail:
			"The server is redirecting the client to a different resource, typically after a POST operation.",
		causes: ["POST/redirect/GET pattern", "Form submission redirect"],
		clientAction: "Follow the redirect using GET method.",
		related: [302, 307],
	},
	{
		code: 304,
		name: "Not Modified",
		description: "The resource has not been modified since the last request.",
		detail:
			"Used for caching. Indicates the client can use its cached copy of the resource.",
		causes: [
			"Conditional request with If-None-Match or If-Modified-Since",
			"Resource unchanged",
		],
		clientAction: "Use the cached version of the resource.",
		related: [200, 412],
		headers: ["ETag", "Last-Modified"],
		example: 'GET /api/data If-None-Match: "abc123" → 304 Not Modified',
	},
	{
		code: 307,
		name: "Temporary Redirect",
		description: "The resource temporarily resides under a different URL.",
		detail:
			"Similar to 302 but guarantees the method and body will not be changed when the redirect is followed.",
		causes: ["Temporary redirect preserving HTTP method", "HTTPS enforcement"],
		clientAction: "Repeat the request at the new URL with the same method.",
		related: [302, 308],
	},
	{
		code: 308,
		name: "Permanent Redirect",
		description:
			"The resource has been permanently moved, and the request method must not change.",
		detail:
			"Similar to 301 but guarantees the method and body will not be changed.",
		causes: ["Permanent redirect preserving HTTP method", "API versioning"],
		clientAction:
			"Update references to use the new URL. Repeat with same method.",
		related: [301, 307],
	},
	// 4xx Client Errors
	{
		code: 400,
		name: "Bad Request",
		description: "The server cannot process the request due to client error.",
		detail:
			"The request could not be understood or was missing required parameters.",
		causes: [
			"Malformed request syntax",
			"Invalid request framing",
			"Missing required parameters",
			"Invalid JSON body",
		],
		clientAction: "Review the request for errors and retry with correct data.",
		related: [422, 415],
		example: "POST /api/users { invalid json → 400 Bad Request",
	},
	{
		code: 401,
		name: "Unauthorized",
		description:
			"Authentication is required and has failed or has not been provided.",
		detail:
			"The request requires user authentication. The response must include a WWW-Authenticate header.",
		causes: [
			"Missing authentication credentials",
			"Expired token",
			"Invalid credentials",
		],
		clientAction: "Authenticate and retry the request with valid credentials.",
		related: [403, 407],
		headers: ["WWW-Authenticate"],
		example:
			"GET /api/admin (no token) → 401 Unauthorized WWW-Authenticate: Bearer",
	},
	{
		code: 402,
		name: "Payment Required",
		description:
			"Reserved for future use. Sometimes used for payment-related APIs.",
		detail:
			"Originally reserved for digital payment systems. Now sometimes used by APIs requiring payment.",
		causes: [
			"Subscription expired",
			"Payment required for API access",
			"Quota exceeded",
		],
		clientAction: "Complete payment or upgrade subscription, then retry.",
		related: [401, 403],
	},
	{
		code: 403,
		name: "Forbidden",
		description:
			"The server understood the request but refuses to authorize it.",
		detail:
			"Unlike 401, re-authenticating will not help. The client does not have permission for this resource.",
		causes: [
			"Insufficient permissions",
			"IP blocked",
			"Resource restricted",
			"CORS policy violation",
		],
		clientAction:
			"Request access from the resource owner or check permissions.",
		related: [401, 404],
	},
	{
		code: 404,
		name: "Not Found",
		description: "The requested resource could not be found on the server.",
		detail:
			"The server cannot find the requested resource. This may be temporary or permanent.",
		causes: [
			"Wrong URL",
			"Resource deleted",
			"Typo in path",
			"Resource never existed",
		],
		clientAction:
			"Verify the URL is correct. The resource may have been moved or deleted.",
		related: [410, 403],
		example: "GET /api/users/999 → 404 Not Found (User not found)",
	},
	{
		code: 405,
		name: "Method Not Allowed",
		description:
			"The request method is not supported for the requested resource.",
		detail:
			"The method specified in the request is not allowed for the resource identified by the URI.",
		causes: [
			"Using POST on a read-only endpoint",
			"Using DELETE on a resource that doesn't support it",
		],
		clientAction: "Check the Allow header for supported methods and retry.",
		related: [400, 501],
	},
	{
		code: 406,
		name: "Not Acceptable",
		description:
			"The resource cannot generate a response matching the Accept headers.",
		detail:
			"The server cannot produce a response matching the list of acceptable values in the request's Accept headers.",
		causes: ["Requested format not available", "Content negotiation failed"],
		clientAction: "Modify Accept headers to include a supported format.",
		related: [415],
	},
	{
		code: 407,
		name: "Proxy Authentication Required",
		description: "Authentication with a proxy is required.",
		detail:
			"Similar to 401 but indicates the client must first authenticate with the proxy.",
		causes: [
			"Proxy requires authentication",
			"Corporate proxy authentication expired",
		],
		clientAction: "Authenticate with the proxy and retry.",
		related: [401],
	},
	{
		code: 408,
		name: "Request Timeout",
		description: "The server timed out waiting for the request.",
		detail:
			"The client did not produce a request within the time that the server was prepared to wait.",
		causes: [
			"Slow network connection",
			"Client took too long to send data",
			"Server timeout threshold reached",
		],
		clientAction:
			"Retry the request. Consider breaking large requests into smaller ones.",
		related: [504, 429],
	},
	{
		code: 409,
		name: "Conflict",
		description:
			"The request conflicts with the current state of the resource.",
		detail:
			"Indicates a request conflict with the current state of the target resource.",
		causes: [
			"Editing conflict",
			"Duplicate resource creation",
			"Optimistic locking failure",
			"Version mismatch",
		],
		clientAction:
			"Resolve the conflict (e.g., re-fetch and retry) and resubmit.",
		related: [412, 422],
	},
	{
		code: 410,
		name: "Gone",
		description:
			"The resource is no longer available and will not be available again.",
		detail:
			"The target resource is no longer available at the server and no forwarding address is known.",
		causes: [
			"Resource permanently deleted",
			"API endpoint deprecated and removed",
		],
		clientAction: "Remove references to this resource. It will not return.",
		related: [404],
	},
	{
		code: 411,
		name: "Length Required",
		description: "Content-Length header is required but not provided.",
		detail: "The server requires a Content-Length header in the request.",
		causes: ["Missing Content-Length header on a request with a body"],
		clientAction: "Add the Content-Length header and retry.",
		related: [400],
	},
	{
		code: 412,
		name: "Precondition Failed",
		description: "A precondition in the request headers was not met.",
		detail:
			"One or more conditions in the request header fields evaluated to false when tested on the server.",
		causes: [
			"If-Match header mismatch",
			"If-Unmodified-Since condition failed",
			"ETag mismatch",
		],
		clientAction:
			"Re-fetch the resource, update precondition headers, and retry.",
		related: [304, 409, 428],
	},
	{
		code: 413,
		name: "Payload Too Large",
		description:
			"The request entity is larger than the server is willing to process.",
		detail:
			"The server is refusing to process a request because the request payload is larger than the server is willing to process.",
		causes: [
			"File upload exceeds limit",
			"Request body too large",
			"Server max body size configured lower",
		],
		clientAction: "Reduce the payload size or use chunked upload if supported.",
		related: [400],
	},
	{
		code: 414,
		name: "URI Too Long",
		description: "The URI provided was too long for the server to process.",
		detail:
			"The server is refusing to service the request because the request-target is longer than the server is willing to interpret.",
		causes: ["Extremely long query string", "URL with too many parameters"],
		clientAction:
			"Shorten the URL. Consider using POST with a body instead of GET with query params.",
		related: [400],
	},
	{
		code: 415,
		name: "Unsupported Media Type",
		description:
			"The media format of the request is not supported by the server.",
		detail:
			"The origin server is refusing to service the request because the content type is not supported.",
		causes: [
			"Wrong Content-Type header",
			"Sending XML to a JSON-only endpoint",
		],
		clientAction:
			"Check the supported Content-Type values and update your request.",
		related: [400, 406],
	},
	{
		code: 416,
		name: "Range Not Satisfiable",
		description: "The range specified by the Range header cannot be fulfilled.",
		detail:
			"The range specified in the Range header of the request cannot be fulfilled.",
		causes: ["Requested byte range exceeds file size", "Invalid range format"],
		clientAction: "Adjust the Range header to be within the resource size.",
		related: [206],
	},
	{
		code: 417,
		name: "Expectation Failed",
		description: "The server cannot meet the expectation in the Expect header.",
		detail:
			"The expectation given in the Expect header could not be met by at least one of the inbound servers.",
		causes: [
			"Server cannot meet Expect: 100-continue",
			"Proxy does not support expectations",
		],
		clientAction: "Remove the Expect header and retry.",
		related: [100],
	},
	{
		code: 418,
		name: "I'm a Teapot",
		description: "The server refuses to brew coffee because it is a teapot.",
		detail:
			"Any attempt to brew coffee with a teapot should result in this error code. Defined in RFC 2324 (Hyper Text Coffee Pot Control Protocol). An April Fools' joke that became an internet tradition.",
		causes: ["Attempting to brew coffee with a teapot", "Easter egg in APIs"],
		clientAction: "Find a coffee pot instead. Or enjoy the humor.",
		related: [200],
	},
	{
		code: 422,
		name: "Unprocessable Entity",
		description:
			"The request was well-formed but could not be followed due to semantic errors.",
		detail:
			"The server understands the content type and the syntax is correct, but it was unable to process the contained instructions.",
		causes: [
			"Validation errors in request body",
			"Business logic violation",
			"Invalid field values",
		],
		clientAction:
			"Fix the validation errors described in the response and retry.",
		related: [400],
	},
	{
		code: 425,
		name: "Too Early",
		description:
			"The server is unwilling to process a request that might be replayed.",
		detail:
			"The server is not willing to process a request because it might be replayed, causing a replay attack.",
		causes: ["TLS early data (0-RTT) request", "Potential replay attack"],
		clientAction: "Retry after the TLS handshake is complete.",
		related: [400],
	},
	{
		code: 426,
		name: "Upgrade Required",
		description: "The client should switch to a different protocol.",
		detail:
			"The server refuses to perform the request using the current protocol but might after the client upgrades.",
		causes: [
			"Server requires HTTPS",
			"Protocol upgrade required (e.g., WebSocket)",
		],
		clientAction: "Upgrade to the protocol specified in the Upgrade header.",
		related: [101],
	},
	{
		code: 428,
		name: "Precondition Required",
		description: "The server requires the request to be conditional.",
		detail:
			'The server requires conditional requests to prevent lost updates (the "lost update problem").',
		causes: [
			"Server enforces optimistic concurrency",
			"Missing If-Match or If-Unmodified-Since header",
		],
		clientAction:
			"Add conditional headers (If-Match, If-Unmodified-Since) and retry.",
		related: [412],
	},
	{
		code: 429,
		name: "Too Many Requests",
		description:
			"The user has sent too many requests in a given amount of time.",
		detail:
			"Rate limiting. The response should include a Retry-After header indicating how long to wait.",
		causes: [
			"Rate limit exceeded",
			"Too many API calls",
			"Brute force protection triggered",
		],
		clientAction:
			"Wait as indicated by the Retry-After header, then retry. Implement backoff.",
		related: [503],
		headers: ["Retry-After"],
		example:
			"GET /api/search (100th request in 1 min) → 429 Too Many Requests Retry-After: 60",
	},
	{
		code: 431,
		name: "Request Header Fields Too Large",
		description: "The request headers are too large for the server to process.",
		detail:
			"The server is unwilling to process the request because its header fields are too large.",
		causes: [
			"Too many cookies",
			"Very large authorization token",
			"Excessive custom headers",
		],
		clientAction: "Reduce the size of request headers and retry.",
		related: [400],
	},
	{
		code: 451,
		name: "Unavailable For Legal Reasons",
		description: "The resource is unavailable due to legal demands.",
		detail:
			"The server operator has received a legal demand to deny access to the resource or to a set of resources that includes the requested resource.",
		causes: [
			"Government censorship",
			"DMCA takedown",
			"Court order blocking access",
			"Legal compliance",
		],
		clientAction:
			"The resource is legally blocked. Contact the operator for details.",
		related: [403],
	},
	// 5xx Server Errors
	{
		code: 500,
		name: "Internal Server Error",
		description:
			"The server encountered an unexpected condition that prevented it from fulfilling the request.",
		detail:
			"A generic server error message when no more specific message is suitable.",
		causes: [
			"Unhandled exception",
			"Application bug",
			"Database error",
			"Configuration error",
		],
		clientAction:
			"Retry later. If persistent, report the issue to the API provider.",
		related: [502, 503],
		example:
			"GET /api/reports → 500 Internal Server Error (NullPointerException)",
	},
	{
		code: 501,
		name: "Not Implemented",
		description:
			"The server does not support the functionality required to fulfill the request.",
		detail:
			"The server does not recognize the request method or lacks the ability to fulfill the request.",
		causes: [
			"HTTP method not implemented",
			"Feature not yet built",
			"Legacy server",
		],
		clientAction: "Use a different method or check server capabilities.",
		related: [405],
	},
	{
		code: 502,
		name: "Bad Gateway",
		description:
			"The server acting as a gateway received an invalid response from the upstream server.",
		detail:
			"The server, while acting as a gateway or proxy, received an invalid response from an upstream server.",
		causes: [
			"Upstream server down",
			"Network error between servers",
			"Upstream server returned invalid response",
		],
		clientAction:
			"Retry after a short wait. The upstream server may be recovering.",
		related: [500, 504],
	},
	{
		code: 503,
		name: "Service Unavailable",
		description: "The server is temporarily unable to handle the request.",
		detail:
			"The server is currently unable to handle the request due to temporary overloading or maintenance.",
		causes: [
			"Server overloaded",
			"Maintenance mode",
			"Deployment in progress",
			"Resource exhaustion",
		],
		clientAction: "Retry after the time indicated in the Retry-After header.",
		related: [500, 429],
		headers: ["Retry-After"],
		example:
			"GET /api/data → 503 Service Unavailable Retry-After: 300 (maintenance)",
	},
	{
		code: 504,
		name: "Gateway Timeout",
		description:
			"The gateway did not receive a timely response from the upstream server.",
		detail:
			"The server, while acting as a gateway or proxy, did not receive a timely response from the upstream server.",
		causes: [
			"Upstream server too slow",
			"Network timeout",
			"Long-running request",
		],
		clientAction:
			"Retry the request. Consider increasing timeout or optimizing the upstream operation.",
		related: [408, 502],
	},
	{
		code: 505,
		name: "HTTP Version Not Supported",
		description:
			"The server does not support the HTTP version used in the request.",
		detail:
			"The server does not support the major version of HTTP used in the request message.",
		causes: [
			"Using an unsupported HTTP version (e.g., HTTP/3 on legacy server)",
		],
		clientAction: "Downgrade to a supported HTTP version.",
		related: [400],
	},
	{
		code: 511,
		name: "Network Authentication Required",
		description: "The client needs to authenticate to gain network access.",
		detail:
			"The client needs to authenticate to gain network access, typically for captive portals.",
		causes: [
			"Captive portal (hotel WiFi, airport WiFi)",
			"Network requires login",
		],
		clientAction:
			"Open a browser to authenticate with the network (captive portal login).",
		related: [401, 407],
	},
	// Unofficial codes
	{
		code: 420,
		name: "Enhance Your Calm",
		description: "Returned by Twitter when the client is being rate limited.",
		detail:
			"An unofficial extension used by Twitter. The client is being rate limited for making too many requests.",
		causes: ["Twitter API rate limit exceeded", "Too many requests to Twitter"],
		clientAction: "Reduce request frequency and wait before retrying.",
		related: [429],
		unofficial: true,
		headers: ["Retry-After"],
		example: "GET /1.1/statuses/home_timeline.json → 420 Enhance Your Calm",
	},
	{
		code: 444,
		name: "Connection Closed Without Response",
		description: "nginx returns no response and closes the connection.",
		detail:
			"A non-standard status code used by nginx to instruct the server to return no information to the client and close the connection. Often used to deny malicious or malformed requests.",
		causes: [
			"Malicious request detected by nginx",
			"Blocked IP or request pattern",
			"nginx access rules triggered",
		],
		clientAction:
			"Check if the request is well-formed and not blocked by server rules.",
		related: [400, 403],
		unofficial: true,
		example: "GET /malicious-path → (connection closed, no response)",
	},
	{
		code: 499,
		name: "Client Closed Request",
		description:
			"The client closed the connection before the server responded.",
		detail:
			"A non-standard status code introduced by nginx for the case when a client closes the connection while nginx is processing the request.",
		causes: [
			"Client timeout before server response",
			"User navigated away",
			"Client-side abort",
		],
		clientAction:
			"Increase client timeout or investigate slow server responses.",
		related: [408, 504],
		unofficial: true,
		example: "POST /api/slow-endpoint → (client aborted after 30s)",
	},
	{
		code: 520,
		name: "Unknown Error",
		description: "Cloudflare received an unknown error from the origin server.",
		detail:
			"Cloudflare returns a 520 error when the origin server returns an empty, unknown, or unexpected response.",
		causes: [
			"Origin server crashed",
			"Empty response from origin",
			"Unexpected response format",
		],
		clientAction: "Check origin server health and logs.",
		related: [502, 521],
		unofficial: true,
		example: "GET /page → Cloudflare 520 (origin returned empty response)",
	},
	{
		code: 521,
		name: "Web Server Is Down",
		description: "The origin web server refused the Cloudflare connection.",
		detail:
			"Cloudflare tried to connect to the origin server but the connection was refused.",
		causes: [
			"Origin server is offline",
			"Origin firewall blocking Cloudflare IPs",
			"Web server process not running",
		],
		clientAction:
			"Ensure the origin server is running and allows Cloudflare IPs.",
		related: [502, 520],
		unofficial: true,
		example: "GET /page → Cloudflare 521 (connection refused by origin)",
	},
	{
		code: 522,
		name: "Connection Timed Out",
		description: "Cloudflare timed out connecting to the origin server.",
		detail:
			"Cloudflare could not negotiate a TCP handshake with the origin server.",
		causes: [
			"Origin server overloaded",
			"Network issues between Cloudflare and origin",
			"Firewall dropping packets",
		],
		clientAction: "Check origin server load and network connectivity.",
		related: [504, 524],
		unofficial: true,
		example: "GET /page → Cloudflare 522 (TCP handshake timed out)",
	},
	{
		code: 523,
		name: "Origin Is Unreachable",
		description: "Cloudflare could not reach the origin server.",
		detail: "The origin server is unreachable, typically due to DNS issues.",
		causes: [
			"DNS records misconfigured",
			"Origin server IP changed",
			"Origin is completely offline",
		],
		clientAction: "Verify DNS settings and origin server accessibility.",
		related: [502, 530],
		unofficial: true,
		example: "GET /page → Cloudflare 523 (DNS resolution failed for origin)",
	},
	{
		code: 524,
		name: "A Timeout Occurred",
		description:
			"Cloudflare established a TCP connection but the origin did not reply in time with an HTTP response.",
		detail:
			"The origin server acknowledged the connection but did not reply with an HTTP response before the connection timed out.",
		causes: [
			"Long-running origin request",
			"Origin server processing too slow",
			"Database timeout on origin",
		],
		clientAction:
			"Optimize origin response times or increase timeout settings.",
		related: [504, 522],
		unofficial: true,
		example: "POST /api/heavy-report → Cloudflare 524 (origin took >100s)",
	},
	{
		code: 525,
		name: "SSL Handshake Failed",
		description:
			"Cloudflare could not complete an SSL/TLS handshake with the origin server.",
		detail:
			"The SSL/TLS handshake between Cloudflare and the origin server failed.",
		causes: [
			"Invalid or expired SSL certificate on origin",
			"SSL configuration mismatch",
			"Origin does not support required TLS version",
		],
		clientAction:
			"Check the origin server's SSL certificate and configuration.",
		related: [526],
		unofficial: true,
		example: "GET /page → Cloudflare 525 (SSL handshake failed with origin)",
	},
	{
		code: 526,
		name: "Invalid SSL Certificate",
		description:
			"Cloudflare could not validate the origin server's SSL certificate.",
		detail:
			"The origin server's SSL certificate is invalid, expired, self-signed, or otherwise untrusted.",
		causes: [
			"Expired SSL certificate",
			"Self-signed certificate not trusted",
			"Certificate hostname mismatch",
		],
		clientAction: "Renew or properly configure the origin's SSL certificate.",
		related: [525],
		unofficial: true,
		example: "GET /page → Cloudflare 526 (origin cert expired 2024-01-01)",
	},
	{
		code: 527,
		name: "Railgun Listener to Origin",
		description: "Error in Cloudflare's Railgun connection to the origin.",
		detail:
			"A Railgun connection error occurred between Cloudflare and the origin server. Railgun is a WAN optimization technology.",
		causes: [
			"Railgun listener connection failed",
			"Railgun configuration error",
			"Network issues between Railgun and origin",
		],
		clientAction: "Check Railgun configuration and connectivity.",
		related: [520, 502],
		unofficial: true,
		example: "GET /page → Cloudflare 527 (Railgun connection error)",
	},
	{
		code: 530,
		name: "Origin DNS Error",
		description: "Cloudflare could not resolve the origin server's DNS.",
		detail:
			"Returned alongside a 1xxx error. Cloudflare cannot resolve the requested DNS record for the origin server.",
		causes: [
			"Missing DNS records",
			"DNS propagation not complete",
			"Incorrect DNS configuration in Cloudflare",
		],
		clientAction: "Verify DNS records are correctly configured in Cloudflare.",
		related: [523, 502],
		unofficial: true,
		example: "GET /page → Cloudflare 530 (CNAME record not found)",
	},
];

type Family = "1xx" | "2xx" | "3xx" | "4xx" | "5xx";

const FAMILIES: { label: Family; color: string; bg: string; border: string }[] =
	[
		{
			label: "1xx",
			color: "text-blue-400",
			bg: "bg-blue-500/10",
			border: "border-blue-500/30",
		},
		{
			label: "2xx",
			color: "text-green-400",
			bg: "bg-green-500/10",
			border: "border-green-500/30",
		},
		{
			label: "3xx",
			color: "text-amber-400",
			bg: "bg-amber-500/10",
			border: "border-amber-500/30",
		},
		{
			label: "4xx",
			color: "text-red-400",
			bg: "bg-red-500/10",
			border: "border-red-500/30",
		},
		{
			label: "5xx",
			color: "text-red-300",
			bg: "bg-red-800/10",
			border: "border-red-800/30",
		},
	];

function getFamilyStyle(code: number) {
	if (code < 200) return FAMILIES[0];
	if (code < 300) return FAMILIES[1];
	if (code < 400) return FAMILIES[2];
	if (code < 500) return FAMILIES[3];
	return FAMILIES[4];
}

function getFamily(code: number): Family {
	if (code < 200) return "1xx";
	if (code < 300) return "2xx";
	if (code < 400) return "3xx";
	if (code < 500) return "4xx";
	return "5xx";
}

export function HttpStatusTool() {
	const [search, setSearch] = useState("");
	const [activeFilter, setActiveFilter] = useState<Family | null>(null);
	const [selectedCode, setSelectedCode] = useState<number | null>(null);
	const [favorites, setFavorites] = useLocalStorage<number[]>(
		"devtools-http-status-prefs",
		[],
	);
	const [viewMode, setViewMode] = useState<"card" | "table">("card");
	const [showUnofficial, setShowUnofficial] = useState(true);
	const [copiedCode, setCopiedCode] = useState<number | null>(null);
	const dialogRef = useRef<HTMLDialogElement>(null);

	const toggleFavorite = useCallback(
		(code: number) => {
			setFavorites((prev) =>
				prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
			);
		},
		[setFavorites],
	);

	const handleCopyCode = useCallback(async (code: number) => {
		const ok = await copyToClipboard(String(code));
		if (ok) {
			setCopiedCode(code);
			setTimeout(() => setCopiedCode(null), 1500);
		}
	}, []);

	const openDialog = useCallback((code: number) => {
		setSelectedCode(code);
	}, []);

	const closeDialog = useCallback(() => {
		setSelectedCode(null);
	}, []);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (selectedCode !== null) {
			if (!dialog.open) dialog.showModal?.();
		} else {
			if (dialog.open) dialog.close?.();
		}
	}, [selectedCode]);

	const selectedStatus =
		selectedCode !== null
			? (STATUS_CODES.find((s) => s.code === selectedCode) ?? null)
			: null;

	const filteredCodes = useMemo(() => {
		return STATUS_CODES.filter((s) => {
			if (!showUnofficial && s.unofficial) return false;
			if (activeFilter && getFamily(s.code) !== activeFilter) return false;
			if (!search.trim()) return true;
			const q = search.toLowerCase();
			return (
				String(s.code).includes(q) ||
				s.name.toLowerCase().includes(q) ||
				s.description.toLowerCase().includes(q)
			);
		});
	}, [search, activeFilter, showUnofficial]);

	return (
		<>
			<Helmet>
				<title>{`${tool.name} | DevTools`}</title>
				<meta name='description' content={tool.description} />
			</Helmet>
			<div className='flex h-full flex-col'>
				<ToolPageHeader title={tool.name} />

				{/* Search + Filters */}
				<div className='border-b border-border px-4 py-3 space-y-3'>
					<div className='relative'>
						<Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
						<input
							type='text'
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder='Search by code or name...'
							className='h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-accent'
						/>
					</div>
					<div className='flex flex-wrap gap-2'>
						{FAMILIES.map((f) => (
							<button
								key={f.label}
								onClick={() =>
									setActiveFilter(activeFilter === f.label ? null : f.label)
								}
								className={cn(
									"rounded-full px-3 py-1 text-xs font-medium border transition-colors",
									activeFilter === f.label
										? `${f.bg} ${f.color} ${f.border}`
										: "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
								)}
							>
								{f.label}
							</button>
						))}
						{(search || activeFilter) && (
							<button
								onClick={() => {
									setSearch("");
									setActiveFilter(null);
								}}
								className='rounded-full px-3 py-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1'
							>
								<X className='h-3 w-3' /> Clear
							</button>
						)}

						{/* View mode toggle */}
						<button
							onClick={() =>
								setViewMode(viewMode === "card" ? "table" : "card")
							}
							className='rounded-full px-3 py-1 text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 flex items-center gap-1 transition-colors'
							aria-label={
								viewMode === "card"
									? "Switch to table view"
									: "Switch to card view"
							}
						>
							{viewMode === "card" ? (
								<>
									<Table className='h-3 w-3' /> Table
								</>
							) : (
								<>
									<LayoutGrid className='h-3 w-3' /> Cards
								</>
							)}
						</button>

						{/* Unofficial toggle */}
						<button
							onClick={() => setShowUnofficial(!showUnofficial)}
							className={cn(
								"rounded-full px-3 py-1 text-xs font-medium border transition-colors flex items-center gap-1",
								showUnofficial
									? "border-purple-500/30 bg-purple-500/10 text-purple-400"
									: "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
							)}
							aria-label={
								showUnofficial
									? "Hide unofficial codes"
									: "Show unofficial codes"
							}
						>
							Unofficial
						</button>

						<span className='ml-auto text-xs text-muted-foreground self-center'>
							{filteredCodes.length} codes
						</span>
					</div>
				</div>

				{/* Content area */}
				<div className='flex-1 overflow-auto p-4'>
					{viewMode === "card" ? (
						<div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
							{filteredCodes.map((s) => {
								const style = getFamilyStyle(s.code);
								const isFav = favorites.includes(s.code);

								return (
									<div
										key={s.code}
										className={cn(
											"rounded-lg border p-4 transition-all cursor-pointer hover:ring-1 hover:ring-accent/40",
											style.border,
											style.bg,
										)}
										onClick={() => openDialog(s.code)}
									>
										<div className='flex items-start justify-between'>
											<div className='flex items-center gap-3'>
												<span
													className={cn(
														"text-2xl font-bold font-mono",
														style.color,
													)}
												>
													{s.code}
												</span>
												<div>
													<div className='flex items-center gap-2'>
														<h3 className='text-sm font-semibold text-foreground'>
															{s.name}
														</h3>
														{s.unofficial && (
															<span className='rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-400 border border-purple-500/30'>
																unofficial
															</span>
														)}
													</div>
													<p className='text-xs text-muted-foreground mt-0.5 line-clamp-2'>
														{s.description}
													</p>
												</div>
											</div>
											<button
												onClick={(e) => {
													e.stopPropagation();
													toggleFavorite(s.code);
												}}
												className='p-1 rounded hover:bg-white/10 shrink-0'
												aria-label={
													isFav ? "Remove from favorites" : "Add to favorites"
												}
											>
												<Star
													className={cn(
														"h-3.5 w-3.5",
														isFav
															? "fill-amber-400 text-amber-400"
															: "text-muted-foreground",
													)}
												/>
											</button>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						/* Table view */
						<div className='overflow-x-auto'>
							<table className='w-full text-xs'>
								<thead>
									<tr className='border-b border-border text-left'>
										<th className='px-3 py-2 font-semibold text-foreground w-16'>
											Code
										</th>
										<th className='px-3 py-2 font-semibold text-foreground w-48'>
											Name
										</th>
										<th className='px-3 py-2 font-semibold text-foreground'>
											Description
										</th>
										<th className='px-3 py-2 font-semibold text-foreground w-24'>
											Family
										</th>
										<th className='px-3 py-2 font-semibold text-foreground w-12'></th>
									</tr>
								</thead>
								<tbody>
									{filteredCodes.map((s) => {
										const style = getFamilyStyle(s.code);
										const isFav = favorites.includes(s.code);
										return (
											<tr
												key={s.code}
												className='border-b border-border/50 hover:bg-accent/5 transition-colors cursor-pointer'
												onClick={() => openDialog(s.code)}
											>
												<td className='px-3 py-2'>
													<span
														className={cn("font-bold font-mono", style.color)}
													>
														{s.code}
													</span>
													{s.unofficial && (
														<span className='ml-1 rounded-full bg-purple-500/20 px-1 py-0.5 text-[9px] font-medium text-purple-400 border border-purple-500/30'>
															unofficial
														</span>
													)}
												</td>
												<td className='px-3 py-2 font-medium text-foreground'>
													{s.name}
												</td>
												<td className='px-3 py-2 text-muted-foreground'>
													{s.description}
												</td>
												<td className='px-3 py-2'>
													<span
														className={cn(
															"rounded-full px-2 py-0.5 text-[10px] font-medium border",
															style.bg,
															style.color,
															style.border,
														)}
													>
														{getFamily(s.code)}
													</span>
												</td>
												<td className='px-3 py-2'>
													<button
														onClick={(e) => {
															e.stopPropagation();
															toggleFavorite(s.code);
														}}
														className='p-1 rounded hover:bg-white/10'
														aria-label={
															isFav
																? "Remove from favorites"
																: "Add to favorites"
														}
													>
														<Star
															className={cn(
																"h-3.5 w-3.5",
																isFav
																	? "fill-amber-400 text-amber-400"
																	: "text-muted-foreground",
															)}
														/>
													</button>
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					)}

					{filteredCodes.length === 0 && (
						<div className='flex h-48 items-center justify-center text-sm text-muted-foreground'>
							No status codes match your search.
						</div>
					)}
				</div>
			</div>

			{/* Status code detail dialog */}
			<dialog
				ref={dialogRef}
				onClose={closeDialog}
				onClick={(e) => {
					if (e.target === e.currentTarget) closeDialog();
				}}
				className='backdrop:bg-black/60 bg-transparent p-0 m-auto max-w-lg w-[calc(100%-2rem)] rounded-xl outline-none open:animate-in open:fade-in-0 open:zoom-in-95'
			>
				{selectedStatus &&
					(() => {
						const s = selectedStatus;
						const style = getFamilyStyle(s.code);
						const isFav = favorites.includes(s.code);
						return (
							<div
								className={cn(
									"rounded-xl border p-5 shadow-2xl",
									style.border,
									style.bg,
									"bg-panel",
								)}
							>
								{/* Header */}
								<div className='flex items-start justify-between mb-4'>
									<div className='flex items-center gap-3'>
										<span
											className={cn(
												"text-3xl font-bold font-mono",
												style.color,
											)}
										>
											{s.code}
										</span>
										<div>
											<div className='flex items-center gap-2'>
												<h2 className='text-base font-semibold text-foreground'>
													{s.name}
												</h2>
												{s.unofficial && (
													<span className='rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-400 border border-purple-500/30'>
														unofficial
													</span>
												)}
											</div>
											<p className='text-xs text-muted-foreground mt-0.5'>
												{s.description}
											</p>
										</div>
									</div>
									<div className='flex items-center gap-1 shrink-0'>
										<button
											onClick={() => toggleFavorite(s.code)}
											className='p-1 rounded hover:bg-white/10'
											aria-label={
												isFav ? "Remove from favorites" : "Add to favorites"
											}
										>
											<Star
												className={cn(
													"h-4 w-4",
													isFav
														? "fill-amber-400 text-amber-400"
														: "text-muted-foreground",
												)}
											/>
										</button>
										<button
											onClick={closeDialog}
											className='p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground'
											aria-label='Close dialog'
										>
											<X className='h-4 w-4' />
										</button>
									</div>
								</div>

								{/* Body */}
								<div className='space-y-3 text-xs border-t border-border/50 pt-3 max-h-[60vh] overflow-y-auto'>
									{/* Copy code button */}
									<div className='flex justify-end'>
										<button
											onClick={() => handleCopyCode(s.code)}
											className='flex items-center gap-1 rounded px-2 py-1 text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors'
											aria-label='Copy code'
										>
											{copiedCode === s.code ? (
												<>
													<Check className='h-3 w-3 text-green-400' /> Copied
												</>
											) : (
												<>
													<Copy className='h-3 w-3' /> Copy code
												</>
											)}
										</button>
									</div>
									<div>
										<h4 className='font-semibold text-foreground mb-1'>
											Details
										</h4>
										<p className='text-muted-foreground'>{s.detail}</p>
									</div>
									<div>
										<h4 className='font-semibold text-foreground mb-1'>
											Common Causes
										</h4>
										<ul className='list-disc pl-4 text-muted-foreground space-y-0.5'>
											{s.causes.map((c, i) => (
												<li key={i}>{c}</li>
											))}
										</ul>
									</div>
									<div>
										<h4 className='font-semibold text-foreground mb-1'>
											Client Action
										</h4>
										<p className='text-muted-foreground'>{s.clientAction}</p>
									</div>
									{s.headers && s.headers.length > 0 && (
										<div>
											<h4 className='font-semibold text-foreground mb-1'>
												Associated Headers
											</h4>
											<div className='flex flex-wrap gap-1.5'>
												{s.headers.map((h) => (
													<span
														key={h}
														className='rounded px-2 py-0.5 text-xs font-mono font-medium bg-accent/30 text-foreground border border-border'
													>
														{h}
													</span>
												))}
											</div>
										</div>
									)}
									{s.example && (
										<div>
											<h4 className='font-semibold text-foreground mb-1'>
												Example
											</h4>
											<code className='block rounded bg-black/20 px-2 py-1.5 text-xs font-mono text-muted-foreground whitespace-pre-wrap'>
												{s.example}
											</code>
										</div>
									)}
									{s.related.length > 0 && (
										<div>
											<h4 className='font-semibold text-foreground mb-1'>
												Related Codes
											</h4>
											<div className='flex flex-wrap gap-1.5'>
												{s.related.map((r) => {
													const rs = getFamilyStyle(r);
													return (
														<button
															key={r}
															onClick={() => openDialog(r)}
															className={cn(
																"rounded px-2 py-0.5 text-xs font-mono font-medium border",
																rs.border,
																rs.bg,
																rs.color,
															)}
														>
															{r}
														</button>
													);
												})}
											</div>
										</div>
									)}
								</div>
							</div>
						);
					})()}
			</dialog>
		</>
	);
}
