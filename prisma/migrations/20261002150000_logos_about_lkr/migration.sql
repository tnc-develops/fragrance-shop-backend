-- The single logo (shown on the light header) becomes the light-background logo; a dark-background logo is added.
ALTER TABLE `ShopSetting` CHANGE `logoUrl` `logoLightUrl` VARCHAR(500) NULL,
    ADD COLUMN `logoDarkUrl` VARCHAR(500) NULL AFTER `logoLightUrl`,
    MODIFY `currency` VARCHAR(8) NOT NULL DEFAULT 'LKR',
    MODIFY `currencySymbol` VARCHAR(8) NOT NULL DEFAULT 'LKR';

-- CreateTable
CREATE TABLE `AboutPage` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `eyebrow` VARCHAR(80) NULL,
    `heading` VARCHAR(160) NOT NULL,
    `intro` TEXT NULL,
    `heroImage` VARCHAR(500) NULL,
    `sections` JSON NOT NULL,
    `values` JSON NOT NULL,
    `ctaHeading` VARCHAR(160) NULL,
    `ctaLabel` VARCHAR(60) NULL,
    `ctaLink` VARCHAR(300) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
