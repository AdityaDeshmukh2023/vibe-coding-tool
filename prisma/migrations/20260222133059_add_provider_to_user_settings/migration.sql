-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('OPENAI', 'OPENROUTER');

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "provider" "AIProvider" NOT NULL DEFAULT 'OPENAI';
