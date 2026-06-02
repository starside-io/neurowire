import { z } from 'zod'

/** A person referenced by a feed or entry (author). */
export const PersonSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  email: z.string().optional(),
})
export type Person = z.infer<typeof PersonSchema>

/** A single article in a feed. List-metadata only: no full article body. */
export const EntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  link: z.string(),
  published: z.string().optional(),
  updated: z.string().optional(),
  summary: z.string().optional(),
  authors: z.array(PersonSchema).optional(),
  tags: z.array(z.string()).optional(),
  source: z
    .object({
      name: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
})
export type NeurowireEntry = z.infer<typeof EntrySchema>

/** The canonical Neurowire feed. Every serializer reads this; every parser produces it. */
export const FeedSchema = z.object({
  id: z.string(),
  title: z.string(),
  home: z.string().optional(),
  self: z.string().optional(),
  updated: z.string(),
  authors: z.array(PersonSchema).optional(),
  generator: z
    .object({
      name: z.string(),
      version: z.string().optional(),
    })
    .optional(),
  entries: z.array(EntrySchema),
})
export type NeurowireFeed = z.infer<typeof FeedSchema>

/** Validate an unknown value into a NeurowireFeed. Throws (ZodError) on invalid input. */
export function parseNeurowireFeed(data: unknown): NeurowireFeed {
  return FeedSchema.parse(data)
}

/** Generator stamp written into feeds produced by Neurowire. */
export const GENERATOR = { name: 'Neurowire', version: '0.1.0' } as const

/** A single source within a {@link Mesh}: a display name and a URL (feed or website). */
export const MeshSourceSchema = z.object({
  name: z.string(),
  url: z.string(),
})
export type MeshSource = z.infer<typeof MeshSourceSchema>

/** A named bundle of sources that fetch and merge into one feed (e.g. "AI News"). */
export const MeshSchema = z.object({
  name: z.string(),
  sources: z.array(MeshSourceSchema),
})
export type Mesh = z.infer<typeof MeshSchema>

/** Validate an unknown value into a Mesh. Throws (ZodError) on invalid input. */
export function parseMesh(data: unknown): Mesh {
  return MeshSchema.parse(data)
}
