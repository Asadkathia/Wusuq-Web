-- CreateTable
CREATE TABLE "PersonalFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStorageUsage" (
    "userId" TEXT NOT NULL,
    "bytesUsed" BIGINT NOT NULL DEFAULT 0,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStorageUsage_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalFile_storageKey_key" ON "PersonalFile"("storageKey");

-- CreateIndex
CREATE INDEX "PersonalFile_userId_deletedAt_createdAt_idx" ON "PersonalFile"("userId", "deletedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "PersonalFile" ADD CONSTRAINT "PersonalFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStorageUsage" ADD CONSTRAINT "UserStorageUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
