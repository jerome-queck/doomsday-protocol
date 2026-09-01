// Kept dependency-free so committed migrations remain understandable without
// installing a database generator. This object is compatible with Drizzle Kit.
export default {
  out: './drizzle',
  schema: './db/schema.ts',
  dialect: 'sqlite',
} as const;
