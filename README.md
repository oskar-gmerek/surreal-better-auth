# Surreal Adapter for Better Auth
This adapter allows you to use [SurrealDB](https://surrealdb.com) as a database for your [Better Auth](https://better-auth.com) implementation.

## Feedback
⭐ Found this adapter useful? Show some love with a star! Your support keeps the code evolving. 🚀

## » Installation
```bash
bun add surreal-better-auth
```

## » Configuration
```ts
import { surrealAdapter } from 'surreal-better-auth'
import { databaseInstance } from './your-surreal-singleton'

...
export const auth = betterAuth({
...
database: surrealAdapter(databaseInstance)
...
})
```

## ✨ Contributions
Contributions are welcome! Please open an issue or a pull request if you have any suggestions or improvements.
