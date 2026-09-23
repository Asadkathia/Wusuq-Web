-- Guided tours (2026-09-23): one row per (user, tour). Additive only — a new
-- enum + table, no change to existing rows.
CREATE TYPE "TourStatus" AS ENUM ('COMPLETED', 'DISMISSED');

CREATE TABLE "UserTourProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TourStatus" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserTourProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserTourProgress_userId_tourId_key" ON "UserTourProgress"("userId", "tourId");

ALTER TABLE "UserTourProgress" ADD CONSTRAINT "UserTourProgress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
