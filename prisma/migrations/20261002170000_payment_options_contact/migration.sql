-- AlterTable
ALTER TABLE `Order` ADD COLUMN `paymentSlip` VARCHAR(300) NULL,
    ADD COLUMN `paymentSlipUploadedAt` DATETIME(3) NULL,
    MODIFY `paymentMethod` ENUM('COD', 'BANK_TRANSFER', 'CARD') NOT NULL DEFAULT 'COD';

-- AlterTable
ALTER TABLE `ShopSetting` ADD COLUMN `whatsappNumber` VARCHAR(30) NULL AFTER `contactPhone`,
    ADD COLUMN `openingHours` VARCHAR(200) NULL AFTER `whatsappNumber`;

-- Most shops use the same number for calls and WhatsApp; the admin can change it.
UPDATE `ShopSetting` SET `whatsappNumber` = `contactPhone` WHERE `whatsappNumber` IS NULL;

-- CreateTable
CREATE TABLE `PaymentOption` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `method` ENUM('COD', 'BANK_TRANSFER', 'CARD') NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `description` VARCHAR(300) NULL,
    `instructions` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `bankAccounts` JSON NULL,
    `allowSlipUpload` BOOLEAN NOT NULL DEFAULT true,
    `allowWhatsappSlip` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentOption_method_key`(`method`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
