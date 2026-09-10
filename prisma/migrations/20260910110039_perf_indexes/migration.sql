-- Performance audit: two composite indexes supporting hot, frequently-
-- run queries that previously had no matching index for their
-- WHERE-status + ORDER-BY-date shape (GET /api/feed's main content
-- query, and GET /api/discovery/new-creators / the feed's own
-- "suggested" pool). Purely additive — no existing index is touched or
-- dropped, no column changes, safe against the real non-empty
-- "content"/"creator_profiles" tables.
CREATE INDEX "content_status_publishedAt_idx" ON "content"("status", "publishedAt");

CREATE INDEX "creator_profiles_status_approvedAt_idx" ON "creator_profiles"("status", "approvedAt");
