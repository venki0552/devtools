# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in DevTools, please report it responsibly.

**Do NOT open a public issue for security vulnerabilities.**

Instead, please email the maintainer directly or use GitHub's private vulnerability reporting feature:

1. Go to the [Security tab](https://github.com/venki0552/devtools/security) of the repository
2. Click "Report a vulnerability"
3. Provide details about the vulnerability

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Scope

Since DevTools is a client-side application with no backend:

- **In scope**: XSS vulnerabilities, localStorage data exposure, insecure handling of API keys, dependency vulnerabilities
- **Out of scope**: Server-side issues (there is no server), social engineering, physical access attacks

## Supported Versions

| Version           | Supported |
| ----------------- | --------- |
| Latest (`master`) | ✅ Yes    |
| Older releases    | ❌ No     |

## Best Practices for Users

- Never share your browser profile if you have API keys stored in DevTools
- Use the "Clear all projects" option in the Env Var Manager before sharing a device
- Keep your browser up to date
