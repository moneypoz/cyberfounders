import { defineCollection, z } from "astro:content";

const companies = defineCollection({
  type: "content",
  schema: z.object({
    name: z.string(),
    tagline: z.string(),
    description: z.string(),
    website: z.string().url(),
    logo: z.string().optional(),
    founded: z.number().optional(),
    location: z.string().optional(),
    stage: z
      .enum(["pre-seed", "seed", "series-a", "series-b", "growth", "public"])
      .optional(),
    category: z.array(z.string()),
    founders: z.array(z.string()).optional(),
    photo: z.string().optional(),
    featured: z.boolean().default(false),
    approved: z.boolean().default(false),
    publishedAt: z.date(),
  }),
});

export const collections = { companies };
