-- Deduplicate existing drafts so the unique constraint can be added safely.
-- Keep the most recently updated draft for each (consumerId, flow) pair.
DELETE FROM "TicketIntakeDraft" a USING "TicketIntakeDraft" b
WHERE a."consumerId" = b."consumerId"
  AND a."flow" = b."flow"
  AND a."updatedAt" < b."updatedAt";

-- CreateIndex
CREATE UNIQUE INDEX "TicketIntakeDraft_consumerId_flow_key" ON "TicketIntakeDraft"("consumerId", "flow");
