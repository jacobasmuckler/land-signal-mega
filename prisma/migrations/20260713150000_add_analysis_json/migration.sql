-- Saved parcels can carry their per-parcel analysis setup (drawn comp area,
-- comp filters) and the AI reports pulled for them, as one JSON blob.
ALTER TABLE "Listing" ADD COLUMN "analysisJson" TEXT;
