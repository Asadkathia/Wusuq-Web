-- Per-file caption (PDF #43) so consumers can label uploads as
-- Petition / Power of Attorney / Supporting Document etc. when
-- filing a case remotely.
ALTER TABLE "TicketDocument" ADD COLUMN "caption" TEXT;
