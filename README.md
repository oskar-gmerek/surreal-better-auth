# SurrealDB Adapter for Better Auth

[![npm version](https://badge.fury.io/js/surrealdb-better-auth.svg)](https://badge.fury.io/js/surrealdb-better-auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A seamless integration between [SurrealDB](https://surrealdb.com) and
[Better Auth](https://better-auth.com), providing a robust authentication
solution with the power of SurrealDB's flexible database capabilities.

## ✨ Features

- 🔐 Secure authentication with SurrealDB
- 🔄 Real-time data synchronization
- 🚀 High performance and scalability
- 🔧 Easy configuration and setup
- 📦 TypeScript support
- 🧩 Flexible integration options

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ or Bun
- SurrealDB instance (local or cloud)
- Better Auth setup

### Installation

```bash
# Using pnpm (recommended)
pnpm add surrealdb-better-auth

# Using npm
npm install surrealdb-better-auth

# Using yarn
yarn add surrealdb-better-auth
```

## 🛠️ Configuration

### Basic Setup

```typescript
import { surrealAdapter } from "surrealdb-better-auth";

export const auth = betterAuth({
	// ... other Better Auth options
	database: surrealAdapter({
		address: "http://localhost:8000", // Your SurrealDB server address
		username: "root", // Your SurrealDB username
		password: "root", // Your SurrealDB password
		ns: "namespace", // Your namespace
		db: "database", // Your database name
	}),
});
```

### Environment Variables Setup

```typescript
import { surrealAdapter } from "surrealdb-better-auth";

export const auth = betterAuth({
	// ... other Better Auth options
	database: surrealAdapter({
		address: process.env.SURREALDB_ADDRESS,
		username: process.env.SURREALDB_USERNAME,
		password: process.env.SURREALDB_PASSWORD,
		ns: process.env.SURREALDB_NAMESPACE,
		db: process.env.SURREALDB_DATABASE,
	}),
});
```

## 📋 Schema Definitions

### Default Schemas

#### Account Table

```sql
DEFINE TABLE account TYPE ANY SCHEMALESS COMMENT 'better-auth: accounts' PERMISSIONS NONE;
DEFINE FIELD accountId ON account TYPE record<user> REFERENCE ON DELETE CASCADE PERMISSIONS FULL;
DEFINE FIELD createdAt ON account TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD id ON account TYPE string PERMISSIONS FULL;
DEFINE FIELD password ON account TYPE string PERMISSIONS FULL;
DEFINE FIELD providerId ON account TYPE string PERMISSIONS FULL;
DEFINE FIELD updatedAt ON account TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD userId ON account TYPE record<user> REFERENCE ON DELETE CASCADE PERMISSIONS FULL;
```

#### Session Table

```sql
DEFINE TABLE session TYPE ANY SCHEMALESS COMMENT 'better-auth: sessions' PERMISSIONS NONE;
DEFINE FIELD activeOrganizationId ON session TYPE option<record<organization>> REFERENCE ON DELETE UNSET COMMENT 'The id of the active organization' PERMISSIONS FULL;
DEFINE FIELD createdAt ON session TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD expiresAt ON session PERMISSIONS FULL;
DEFINE FIELD id ON session TYPE string PERMISSIONS FULL;
DEFINE FIELD ipAddress ON session TYPE string PERMISSIONS FULL;
DEFINE FIELD token ON session TYPE string PERMISSIONS FULL;
DEFINE FIELD updatedAt ON session TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD userId ON session TYPE record<user> REFERENCE ON DELETE CASCADE PERMISSIONS FULL;
```

#### User Table

```sql
DEFINE TABLE user TYPE ANY SCHEMALESS COMMENT 'better-auth: users' PERMISSIONS NONE;
DEFINE FIELD chats ON user TYPE references<chat> PERMISSIONS FULL;
DEFINE FIELD defaultOrganizationId ON user TYPE option<record<organization>> PERMISSIONS FULL;
DEFINE FIELD organizations ON user TYPE references<member> PERMISSIONS FULL;
```

### Orgs Plugin Schemas

#### Organization Table

```sql
DEFINE TABLE organization TYPE NORMAL SCHEMALESS COMMENT 'better-auth orgs: organizations' PERMISSIONS NONE;
DEFINE FIELD createdAt ON organization TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD logo ON organization TYPE option<string> COMMENT 'The logo of the organization' PERMISSIONS FULL;
DEFINE FIELD metadata ON organization FLEXIBLE TYPE option<object> COMMENT 'Additional metadata for the organization' PERMISSIONS FULL;
DEFINE FIELD name ON organization TYPE string PERMISSIONS FULL;
DEFINE FIELD slug ON organization TYPE string PERMISSIONS FULL;
DEFINE FIELD updatedAt ON organization TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
```

#### Member Table

```sql
DEFINE TABLE member TYPE NORMAL SCHEMALESS COMMENT 'better-auth orgs: members' PERMISSIONS NONE;
DEFINE FIELD createdAt ON member TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD organizationId ON member TYPE record<organization> REFERENCE ON DELETE CASCADE PERMISSIONS FULL;
DEFINE FIELD role ON member TYPE string PERMISSIONS FULL;
DEFINE FIELD teamId ON member TYPE option<record<team>> REFERENCE ON DELETE CASCADE PERMISSIONS FULL;
DEFINE FIELD userId ON member TYPE record<user> REFERENCE ON DELETE IGNORE PERMISSIONS FULL;
```

#### Team Table

```sql
DEFINE TABLE team TYPE NORMAL SCHEMALESS COMMENT 'better-auth orgs: teams' PERMISSIONS NONE;
DEFINE FIELD createdAt ON team TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD name ON team TYPE string PERMISSIONS FULL;
DEFINE FIELD organizationId ON team TYPE record<organization> REFERENCE ON DELETE CASCADE PERMISSIONS FULL;
DEFINE FIELD updatedAt ON team TYPE option<datetime> DEFAULT time::now() PERMISSIONS FULL;
```

#### Invitation Table

```sql
DEFINE TABLE invitation TYPE NORMAL SCHEMALESS COMMENT 'better-auth orgs: invitations' PERMISSIONS NONE;
DEFINE FIELD createdAt ON invitation TYPE datetime DEFAULT time::now() PERMISSIONS FULL;
DEFINE FIELD email ON invitation TYPE string PERMISSIONS FULL;
DEFINE FIELD expiresAt ON invitation TYPE datetime PERMISSIONS FULL;
DEFINE FIELD inviterId ON invitation TYPE record<user> REFERENCE ON DELETE CASCADE PERMISSIONS FULL;
DEFINE FIELD organizationId ON invitation TYPE record<organization> REFERENCE ON DELETE CASCADE PERMISSIONS FULL;
DEFINE FIELD role ON invitation TYPE string PERMISSIONS FULL;
DEFINE FIELD teamId ON invitation TYPE option<record<team>> REFERENCE ON DELETE CASCADE PERMISSIONS FULL;
DEFINE FIELD token ON invitation TYPE string PERMISSIONS FULL;
```

## 🆓 Free SurrealDB Cloud Instance

Get started with a free SurrealDB Cloud instance:
[Sign up here](https://surrealist.app/referral?code=xeoimhrajt3xk3be) (I get a
bonus if you sign up via this link)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
