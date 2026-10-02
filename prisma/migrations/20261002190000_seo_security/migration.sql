-- AlterTable
ALTER TABLE `Product` ADD COLUMN `seoDescription` VARCHAR(320) NULL,
    ADD COLUMN `seoTitle` VARCHAR(160) NULL;

-- AlterTable
ALTER TABLE `ShopSetting` ADD COLUMN `googleVerification` VARCHAR(120) NULL,
    ADD COLUMN `seoIntroHeading` VARCHAR(160) NULL,
    ADD COLUMN `seoIntroText` TEXT NULL,
    ADD COLUMN `seoKeywords` TEXT NULL,
    ADD COLUMN `seoTitle` VARCHAR(160) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `passwordChangedAt` DATETIME(3) NULL;

-- Starting SEO copy for an existing shop; edited later in the admin.
UPDATE `ShopSetting`
SET `seoTitle` = 'Original Perfumes in Sri Lanka | Fragrance by Shoon',
    `seoKeywords` = 'perfume Sri Lanka, perfumes in Sri Lanka, buy perfume online Sri Lanka, original perfumes Sri Lanka, perfume shop Colombo, luxury perfumes Sri Lanka, fragrance Sri Lanka, perfume price in Sri Lanka, eau de parfum Sri Lanka, men''s perfume Sri Lanka, women''s perfume Sri Lanka, unisex fragrance, designer perfumes, perfume gift Sri Lanka, perfume cash on delivery Sri Lanka',
    `seoIntroHeading` = 'Original perfumes, delivered across Sri Lanka',
    `seoIntroText` = 'Fragrance by Shoon is an online perfume shop in Sri Lanka for original designer fragrances. Browse eau de parfum and eau de toilette for men and women, compare sizes and prices in LKR, and find your signature scent or the perfect perfume gift.\n\nEvery order is packed with care and delivered island-wide, from Colombo, Kandy and Galle to Jaffna. Pay by cash on delivery or bank transfer, and message us on WhatsApp for advice on notes, longevity and sizes.'
WHERE `seoTitle` IS NULL;
