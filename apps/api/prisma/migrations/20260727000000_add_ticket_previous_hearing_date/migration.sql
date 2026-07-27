-- Batch-4 D: retain the hearing date a ticket held before the clerk last moved
-- it. recordNextHearing overwrites "scheduledDate", which previously destroyed
-- the prior value ("the previous date got erased"). Additive + nullable, so
-- existing rows are unaffected and fall back to payload.case_date as before.
ALTER TABLE "Ticket" ADD COLUMN "previousHearingDate" TIMESTAMP(3);
