import "./bootstrap.mjs";

const env = (k, d = undefined) => process.env[k] ?? d;

export const cfg = {
  airtable: {
    baseId: env("AIRTABLE"),
    token: env("AIRTABLE_TOKEN"),
    tables: {
      leads: {
        name: env("AIRTABLE_MAIN_TABLE", "leads"),
        keyField: "placeId", //unique recordId
      },
      reviews: {
        name: env("AIRTABLE_REVIEWS_TABLE", "reviews"),
        keyField: "reviewId",
        linkToLeadField: env("AIRTABLE_REVIEWS_LINK_FIELD", "lead"),
      },
    },
    limits: { batchSize: 10, politeDelayMs: 120 }, // airtable max 10 per batch
  },
  behavior: {
    strictDuplicates:
      String(env("STRICT_DUPLICATES", "true")).toLowerCase() == "true",
    concurrency: Number(env("CONCURRENCY", "3")),
  },
};
