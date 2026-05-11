-- CreateTable
CREATE TABLE "CourtCaseType" (
    "id" TEXT NOT NULL,
    "courtLevel" TEXT NOT NULL,
    "subCourt" TEXT,
    "district" TEXT,
    "region" TEXT,
    "highCourtCode" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtCaseType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourtCaseType_dimensions_unique"
  ON "CourtCaseType"("courtLevel", "subCourt", "district", "region", "highCourtCode", "code");

-- CreateIndex
CREATE INDEX "CourtCaseType_courtLevel_subCourt_idx"
  ON "CourtCaseType"("courtLevel", "subCourt");
