CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceListingId" TEXT,
    "listingUrl" TEXT,
    "title" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "county" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "distanceFromCharlotte" DOUBLE PRECISION,
    "acreage" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION,
    "priceText" TEXT,
    "pricePerAcre" DOUBLE PRECISION,
    "propertyType" TEXT,
    "zoning" TEXT,
    "brokerName" TEXT,
    "brokerPhone" TEXT,
    "brokerEmail" TEXT,
    "dateListed" TIMESTAMP(3),
    "dateFound" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketStage" TEXT NOT NULL DEFAULT 'Listed',
    "locationVerified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'New',
    "fitScore" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "rawEmailId" TEXT,
    "rawSnippet" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScanLog" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "emailsScanned" INTEGER NOT NULL DEFAULT 0,
    "listingsCreated" INTEGER NOT NULL DEFAULT 0,
    "alertsSent" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "ScanLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Listing_listingUrl_key" ON "Listing"("listingUrl");
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
