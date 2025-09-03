export function validateBiz(biz) {
  if (!biz || typeof biz !== "object") throw new Error("Invalid record");
  if (!biz.placeId) throw new Error("Missing placeId");
  if (!biz.title) throw new Error(`Missing title for placeId=${biz.placeId}`);
}
