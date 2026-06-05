-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'DISPATCHED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "deliveryStatus" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "dispatchProofUrl" TEXT,
ADD COLUMN     "trackingNo" TEXT;
