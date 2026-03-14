-- AlterEnum
ALTER TYPE "AIProvider" ADD VALUE 'AZURE_OPENAI';

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "azureApiVersion" TEXT,
ADD COLUMN     "azureEndpoint" TEXT,
ADD COLUMN     "model" TEXT;
