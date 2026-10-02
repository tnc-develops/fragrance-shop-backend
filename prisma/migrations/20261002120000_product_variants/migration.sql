-- Product sizes (variants). Every existing product becomes a product with one default variant
-- carrying its current size, price, sale price, stock and SKU; carts and past orders are re-pointed at it.

-- CreateTable
CREATE TABLE `ProductVariant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `sizeMl` INTEGER NULL,
    `label` VARCHAR(60) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `salePrice` DECIMAL(10, 2) NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `sku` VARCHAR(64) NULL,
    `shortDescription` VARCHAR(300) NULL,
    `description` TEXT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProductVariant_sku_key`(`sku`),
    INDEX `ProductVariant_productId_sortOrder_idx`(`productId`, `sortOrder`),
    INDEX `ProductVariant_isActive_stock_idx`(`isActive`, `stock`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill: one default variant per product
INSERT INTO `ProductVariant` (`productId`, `sizeMl`, `price`, `salePrice`, `stock`, `sku`, `isDefault`, `isActive`, `sortOrder`, `updatedAt`)
SELECT `id`, `sizeMl`, `price`, `salePrice`, `stock`, `sku`, true, true, 0, CURRENT_TIMESTAMP(3)
FROM `Product`;

-- SKU now lives on the variant
DROP INDEX `Product_sku_key` ON `Product`;
ALTER TABLE `Product` DROP COLUMN `sku`;

-- Images: NULL variantId = shared product gallery
ALTER TABLE `ProductImage` ADD COLUMN `variantId` INTEGER NULL;
CREATE INDEX `ProductImage_variantId_sortOrder_idx` ON `ProductImage`(`variantId`, `sortOrder`);

-- Cart items point at a variant
ALTER TABLE `CartItem` DROP FOREIGN KEY `CartItem_userId_fkey`;
DROP INDEX `CartItem_userId_productId_key` ON `CartItem`;
ALTER TABLE `CartItem` ADD COLUMN `variantId` INTEGER NULL;
UPDATE `CartItem` c JOIN `ProductVariant` v ON v.`productId` = c.`productId` AND v.`isDefault` = true
SET c.`variantId` = v.`id`;
DELETE FROM `CartItem` WHERE `variantId` IS NULL;
ALTER TABLE `CartItem` MODIFY `variantId` INTEGER NOT NULL;
CREATE UNIQUE INDEX `CartItem_userId_variantId_key` ON `CartItem`(`userId`, `variantId`);
CREATE INDEX `CartItem_productId_idx` ON `CartItem`(`productId`);

-- Order items remember the size bought
ALTER TABLE `OrderItem` ADD COLUMN `variantId` INTEGER NULL,
    ADD COLUMN `variantLabel` VARCHAR(60) NULL;
UPDATE `OrderItem` o JOIN `ProductVariant` v ON v.`productId` = o.`productId` AND v.`isDefault` = true
SET o.`variantId` = v.`id`,
    o.`variantLabel` = IF(v.`sizeMl` IS NULL, NULL, CONCAT(v.`sizeMl`, ' ml'));
CREATE INDEX `OrderItem_variantId_idx` ON `OrderItem`(`variantId`);

-- AddForeignKey
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartItem` ADD CONSTRAINT `CartItem_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartItem` ADD CONSTRAINT `CartItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
