<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/hero.webp?raw=true">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/hero-white.webp?raw=true">
    <img alt="surrealdb better auth adapter github repo banner" src="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/hero.webp?raw=true">
  </picture>
</p>

<h1 style="margin-top:40px;display:flex;align-content:center;"> 

# <img width="38" height="38" alt="surrealdb better auth adapter" align="center" src="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/atom.png?raw=true" /> SurrealDB Adapter for Better Auth </h1>

[![NPM Version](https://img.shields.io/npm/v/surreal-better-auth?style=for-the-badge&color=%233ca916)](https://www.npmjs.com/package/surreal-better-auth)[![NPM Downloads](https://img.shields.io/npm/dy/surreal-better-auth?style=for-the-badge&color=%233ca916&label=NPMX%20STATS)](https://npmx.dev/package/surreal-better-auth)![NPM Unpacked Size](https://img.shields.io/npm/unpacked-size/surreal-better-auth?style=for-the-badge&color=%233ca916)
![GitHub Created At](https://img.shields.io/github/created-at/oskar-gmerek/surreal-better-auth?style=for-the-badge&color=%233ca916)![NPM Last Update](https://img.shields.io/npm/last-update/surreal-better-auth?style=for-the-badge&color=%233ca916)
![NPM License](https://img.shields.io/npm/l/surreal-better-auth?style=for-the-badge&color=%233ca916)[![Sponsor](https://img.shields.io/badge/sponsor-💖-ff69b4?style=for-the-badge&color=%23ffbdbd)](https://github.com/sponsors/oskar-gmerek)![Maintenance](https://img.shields.io/maintenance/active/2030?style=for-the-badge&color=%233ca916&link=https%3A%2F%2Fnpmx.dev%2Fpackage%2Fsurreal-better-auth)


**The most reliable bridge between [SurrealDB](https://surrealdb.com) and [Better Auth](https://better-auth.com).**

This adapter is built to leverage the best of both worlds: SurrealDB's multi-model power and Better Auth's flexible authentication lifecycle. It is designed with a focus on security, efficiency, and zero-compromise integration.

> [!TIP]
> 🚀 **Get your database running in seconds for free!** Need a managed SurrealDB instance? [Sign up through our referral link](https://app.surrealdb.com/referral?code=4pn5aba943lpbn8l) to get **free cloud hosting credits** and instant access to a high-performance database. It's a great way to support this project while starting yours at no cost!

---

## <img width="32" height="32" align="center" alt="surrealdb better auth - why this adapter" src="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/question.png?raw=true" /> Why this adapter?

Built with real-world scenarios in mind, this adapter goes beyond simple CRUD operations to ensure a seamless developer experience:

- **Best of Both Worlds:** Merges SurrealDB’s unique data structures with Better Auth's comprehensive ecosystem.
- **Production Ready:** Handles complex edge cases, such as polymorphic `accountId` mapping (Records vs. Strings), ensuring your schema stays valid.
- **Unintrusive:** We don't take over your database instance. Managing the connection and SurrealDB client remains entirely in your hands.
- **Fully Compatible:** Built to match the behavior of official adapters while providing community-driven optimizations.
- **CLI Integrated:** Full support for Better Auth CLI schema generation.

---

## <img width="32" height="32" align="center"  alt="surrealdb better auth adapter key features" src="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/crown.png?raw=true" /> Key Features

- **Secure Execution:** Powered by `surql` tagged templates for safe, parameterized queries.
- **Polymorphic Intelligence:** Smartly distinguishes between native `RecordId` (Credentials) and `string` (OAuth) for the `accountId` field.
- **Structural Integrity:** Uses native SurrealDB `RecordId` for relations wherever possible.
- **Atomic Transactions:** Fully compatible with SurrealDB SDK's transaction lifecycle.
- **CLI Schema Support:** Generate your entire SurrealQL schema with a single command.
- **Developer Experience:** Optional, colorized console logs for every SurrealQL query sent to the DB.

---

## <img width="32" height="32" align="center" alt="surrealdb better auth adapter requirements" src="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/requirements.png?raw=true" />  Requirements

- **Bun**: >= 1.3.10 (or **Node.js**: >= 22.0.0)
- **Better Auth**: ^1.7.2
- **SurrealDB JS SDK**: ^2.0.8
- **SurrealDB Server**: v3.0.0+

---

## <img width="32" height="32" align="center" alt="surrealdb better auth quick start" src="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/quick.png?raw=true" />  Quick Start

### 1. Installation

```bash
bun add surreal-better-auth
```
*Other package managers:*
```bash
npm install surreal-better-auth
pnpm add surreal-better-auth
yarn add surreal-better-auth
```

### 2. Configure Better Auth

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { surrealdbAdapter } from "surreal-better-auth";
import { db } from "./db"; // Your SurrealDB client instance

export const auth = betterAuth({
  // Whenever possible, always prefer ws over http for surrealdb instances.
  database: surrealdbAdapter(db, {
    // ID strategy: "ULID", "UUIDv4", "UUIDv7", or "guid"
    idGenerator: "guid",
   
   // Schema mode: "schemaless" or "schemafull", Default: "schemafull"
   schemaMode: "schemaless", 
    
    // Use plural table names (e.g., "users") if required by your schema
    usePlural: false,      
    
    // Enable colorized query logging for easier debugging
    logSurrealQL: true   
    
  }),
  // The rest of better-auth configuration
  emailAndPassword: { enabled: true }
  // ...
});
```

### 3. Generate & Import Schema

Use the Better Auth CLI to generate your SurrealQL definitions:

```bash
bunx @better-auth/cli generate --output schema.surql --config src/lib/server/auth.ts
```

- When prompted, save the output as `schema.surql` in your project root.
- Import the schema into your SurrealDB instance:
  ```bash
  surreal import --conn http://localhost:8000 --user root --pass topSecretPassword --ns project --db auth schema.surql
  ```
  *Note: You can also use **Surreal Studio** or any other method to import the generated schema.*

### 4. Support development & maintenance
  - **Star the project** on [GitHub](https://github.com/oskar-gmerek/surreal-better-auth)
  - **[Sponsor the development](https://github.com/sponsors/oskar-gmerek)** to help keep the project maintained. You will also get a banner on this repository.
---

## <img width="32" height="32" align="center" alt="surrealdb better auth best practices" src="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/brain.png?raw=true" /> Best Practices & Architecture

### Database Isolation
For better security and organization, we recommend isolating auth data into a dedicated database within your namespace:
- **Namespace:** `my_project`
- **Database:** `auth` (separate from your `main` business logic database)

### Row-Level Security (RLS)
To implement native SurrealDB Row-Level Security based on the authenticated user, use the **Better Auth JWT Plugin**. This enables you to pass the authentication context directly to SurrealDB via tokens, allowing you to define powerful `PERMISSIONS` on your tables.

---

## <img width="32" height="32" align="center" alt="better auth surrealdb adapter development support" src="https://github.com/oskar-gmerek/surreal-better-auth/blob/beta/assets/star.png?raw=true" /> Show Your Support

If this adapter helps your project, please consider:
- ⭐ **Starring the project** on [GitHub](https://github.com/oskar-gmerek/surreal-better-auth)
- 💖 **[Sponsoring the development](https://github.com/sponsors/oskar-gmerek)** to help keep the project maintained.
