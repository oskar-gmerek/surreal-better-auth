#!/usr/bin/env node

const env = process.env;

// Respect preferences and environment
if (
  env.CI ||
  env.ADBLOCK ||
  env.DISABLE_OPENCOLLECTIVE ||
  env.SURREAL_BETTER_AUTH_DISABLE_WELCOME ||
  env.NODE_ENV === "test"
) {
  process.exit(0);
}

const reset = "\x1b[0m";
const bold = "\x1b[1m";
const cyan = "\x1b[36m";
const pink = "\x1b[35m";
const dim = "\x1b[90m";

const message = `
${pink}🔐 Thank you for installing surreal-better-auth!${reset}

${bold}Found it useful?${reset}
  ⭐ Star the project on GitHub: ${cyan}https://github.com/oskar-gmerek/surreal-better-auth${reset}

${bold}Using it in a commercial project?${reset}
  💖 Consider sponsoring to ensure long-term maintenance.
  Sponsors get their ${bold}logo & link featured${reset} in the README and my profile.
  ${cyan}https://github.com/sponsors/oskar-gmerek${reset}

  ${dim}Your support keeps this adapter up-to-date with Better Auth & SurrealDB.${reset}
  ${dim}Disable this message: SURREAL_BETTER_AUTH_DISABLE_WELCOME=true${reset}
`;

console.log(message);
