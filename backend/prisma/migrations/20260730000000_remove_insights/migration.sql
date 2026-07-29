-- Remove the Insights module (public pages, admin CRUD and API were deleted
-- alongside this migration). The table held zero rows in both local and
-- production at the time of removal, so nothing is lost here; restoring
-- Insights later means a fresh migration rather than a revert.
DROP TABLE IF EXISTS "insights";
