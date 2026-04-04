/*
  Warnings:

  - You are about to drop the column `company` on the `Client` table. All the data in the column will be lost.
  - Added the required column `name` to the `Client` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enquiry',
    "shootDate" DATETIME,
    "shootLocation" TEXT,
    "quoteValue" REAL,
    "revisionLimit" INTEGER NOT NULL DEFAULT 2,
    "revisionsUsed" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "portalToken" TEXT NOT NULL,
    CONSTRAINT "Job_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobType" TEXT NOT NULL,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "TemplateTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TemplateDeliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TemplateDeliverable_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JobTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "JobTask_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Deliverable_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliverableId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT NOT NULL DEFAULT '',
    "versionLabel" TEXT NOT NULL DEFAULT 'first_cut',
    "personalNote" TEXT,
    "downloadEnabled" BOOLEAN NOT NULL DEFAULT true,
    "linkExpiry" DATETIME,
    "passwordHash" TEXT,
    "deliveryStatus" TEXT NOT NULL DEFAULT 'not_sent',
    "viewedAt" DATETIME,
    "approvedAt" DATETIME,
    CONSTRAINT "DeliveryFile_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "request" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "Revision_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobId" TEXT,
    "title" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "notes" TEXT,
    CONSTRAINT "Event_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Gear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "purchaseValue" REAL,
    "insuranceValue" REAL,
    "serialNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "linkUrl" TEXT,
    "jobId" TEXT,
    "clientId" TEXT
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "jobId" TEXT,
    "clientId" TEXT,
    CONSTRAINT "Activity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "leadSource" TEXT,
    "firstContact" DATETIME,
    "pipelineStage" TEXT NOT NULL DEFAULT 'enquiry',
    "status" TEXT NOT NULL DEFAULT 'lead',
    "lifetimeValue" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "tags" TEXT,
    "userId" TEXT,
    CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Client" ("createdAt", "id", "notes", "phone", "status", "updatedAt", "userId") SELECT "createdAt", "id", "notes", "phone", "status", "updatedAt", "userId" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_userId_key" ON "Client"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Job_portalToken_key" ON "Job"("portalToken");

-- CreateIndex
CREATE UNIQUE INDEX "JobTemplate_jobType_key" ON "JobTemplate"("jobType");
