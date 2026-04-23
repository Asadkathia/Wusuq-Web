-- Replace GeoCourt with Court + CourtSeat (type, name, per-seat principal flag).
DROP TABLE IF EXISTS "GeoCourt";

CREATE TABLE "Court" (
    "id"   TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Court_type_name_key" ON "Court"("type", "name");

CREATE TABLE "CourtSeat" (
    "id"              TEXT    NOT NULL,
    "courtId"         TEXT    NOT NULL,
    "cityId"          TEXT    NOT NULL,
    "isPrincipalSeat" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CourtSeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourtSeat_courtId_cityId_key" ON "CourtSeat"("courtId", "cityId");
CREATE INDEX "CourtSeat_cityId_idx" ON "CourtSeat"("cityId");

ALTER TABLE "CourtSeat"
    ADD CONSTRAINT "CourtSeat_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourtSeat"
    ADD CONSTRAINT "CourtSeat_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "GeoCity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
