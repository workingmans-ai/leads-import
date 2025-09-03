import { cfg } from "./config.mjs";

const stringify = (v) =>
  v == null ? null : typeof v === "string" ? v : JSON.stringify(v);
const hoursToLine = (arr) =>
  Array.isArray(arr) && arr.length
    ? arr.map((d) => `${d.day}: ${d.hours}`).join(" | ")
    : null;

export function mapLeadFields(biz) {
  return {
    placeId: biz.placeId ?? null,
    companyName: biz.title ?? null,
    categoryName: biz.categoryName ?? null,
    neighborhood: biz.neighborhood ?? null,
    address: biz.address ?? null,
    street: biz.street ?? null,
    city: biz.city ?? null,
    state: biz.state ?? null,
    website: biz.website ?? null,
    listedPhone: biz.phone ?? null,
    googleMapsUrl: biz.url ?? null,
    googleRank: biz.rank ?? null,
    totalScore: Number.isFinite(biz.totalScore) ? biz.totalScore : null,
    categories: Array.isArray(biz.categories) ? biz.categories : null,
    reviewsDistribution: stringify(biz.reviewsDistribution),
    reviewsCount: Number.isFinite(biz.reviewsCount)
      ? biz.reviewsCount
      : Array.isArray(biz.reviews)
      ? biz.reviews.length
      : null,
    openingHours: hoursToLine(biz.openingHours),
    ownerUpdatesJson: stringify(biz.ownerUpdates),
    scrapedAt: biz.scrapedAt ?? null,
  };
}

export function mapReviewFields(biz, r, leadRecordId) {
  return {
    reviewId: r.reviewId ?? null,
    [cfg.airtable.tables.reviews.linkToLeadField]: leadRecordId
      ? [{ id: leadRecordId }]
      : [],
    reviewerName: r.name ?? null,
    stars: Number.isFinite(r.stars)
      ? r.stars
      : Number.isFinite(r.rating)
      ? r.rating
      : null,
    reviewComment: r.text ? String(r.text).slice(0, 15000) : null,
    publishedAtDate: r.publishedAtDate ?? null,
    responseFromOwnerText: r.responseFromOwnerText
      ? String(r.responseFromOwnerText).slice(0, 15000)
      : null,
  };
}
