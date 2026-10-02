# Fragrance by Shoon — Backend

REST API and image server for the Fragrance by Shoon shop. It powers both the
storefront ([fragrance-shop](https://github.com/tnc-develops/fragrance-shop)) and the admin dashboard
([fragrance-shop-admin](https://github.com/tnc-develops/fragrance-shop-admin)).

- Node.js 22, Express 5, TypeScript
- MySQL 8+ through Prisma
- JWT auth (customers and admins), bcrypt password hashing
- Image uploads with multer, served from `/uploads`
- Payment methods stored in the database: cash on delivery and bank transfer (with private payment slip uploads),
  plus a card option that stays locked until a payment gateway is added

## Getting started

```bash
cp .env.example .env        # then edit DATABASE_URL and JWT_SECRET
npm install
npm run db:deploy           # create the tables
npm run db:seed             # admin account, collections, products, banners, settings
npm run dev                 # http://localhost:4000
```

Check it is running: `GET http://localhost:4000/health` returns `{"status":"ok"}`.

### Default admin

The seed creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
(default `admin@fragrancebyshoon.com` / `Admin@12345`). Change the password before going live.

### Local database with XAMPP

Development uses the MySQL (MariaDB 10.4) that ships with XAMPP. Start **MySQL** in the XAMPP Control Panel; the
default `root` user has no password, which matches `.env.example`:

```env
DATABASE_URL="mysql://root:@localhost:3306/fragrance_shop"
```

`npm run db:deploy` creates the `fragrance_shop` database if it doesn't exist. You can browse it in phpMyAdmin at
http://localhost/phpmyadmin. Any MySQL 8+ or MariaDB 10.4+ server also works.

> On Windows, stop `npm run dev` before running `npm run db:migrate`; the running server locks the Prisma engine file.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default 4000) |
| `DATABASE_URL` | `mysql://USER:PASSWORD@HOST:PORT/DATABASE` |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing secret and customer sign-in lifetime. In production the API refuses to start unless the secret is a random string of 32+ characters |
| `ADMIN_JWT_EXPIRES_IN` | Admin sign-in lifetime (default `12h`) |
| `UPLOAD_DIR`, `MAX_UPLOAD_MB` | Where images are stored and the per-image size limit (default 8 MB) |
| `PRIVATE_UPLOAD_DIR` | Where customers' payment slips are stored (default `private-uploads`; never served publicly) |
| `SLIP_MAX_MB` | Largest payment slip a customer can upload (default 10 MB) |
| `PUBLIC_URL` | Public URL of this API |
| `CORS_ORIGINS` | Comma-separated storefront and admin origins |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin account created by the seed |

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Start with auto-reload |
| `npm run build` / `npm start` | Compile to `dist/` and run in production |
| `npm run typecheck` | Type-check without emitting |
| `npm run db:migrate` | Create a new migration after editing `prisma/schema.prisma` |
| `npm run db:deploy` | Apply migrations (production / fresh databases) |
| `npm run db:seed` | Seed demo data (safe to re-run) |
| `npm run db:reset` | Drop everything, re-migrate and re-seed |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Products and sizes

A product (`Product`) holds what every bottle shares: name, brand, notes, collections, descriptions and shared images.
What a customer actually buys is a size (`ProductVariant`): each has its own ml, price, sale price, stock and SKU, and
can optionally have its own images and descriptions, which replace the shared ones when that size is selected.

Carts and orders work per size, and stock is reduced or restored per size. The product's `price`, `salePrice`, `stock`
and `sizeMl` columns are a summary (cheapest active size, total stock, default size) that the API keeps in sync for
listing, sorting and filtering. Don't edit them directly.

## Images

All images live on this server, under `uploads/`:

- `uploads/seed/` — the shop's original backgrounds, posters, collection and product photos (committed to git).
- `uploads/library/` — images uploaded from the admin dashboard (runtime data, not committed; back this folder up).

The storefront and admin load them from `PUBLIC_URL/uploads/...` and Next.js resizes them per device.

Bank transfer slips are different: they are saved in `private-uploads/slips/` (outside `uploads/`), are not
reachable by URL, and are only returned to a signed-in admin through `GET /api/orders/admin/:id/slip`. Back this
folder up too.

## Security

- **Uploads**: images and slips are checked by type and by their first bytes, so a renamed script or fake image is
  rejected and deleted. Slips are limited to `SLIP_MAX_MB` (10 MB) and images to `MAX_UPLOAD_MB`. If nginx or another
  proxy sits in front, set its body limit at least as high (for example `client_max_body_size 12m;`).
- **Private data**: slip file paths are never sent to customers; slips are only downloadable by an admin. Order,
  account and admin responses are sent with `Cache-Control: private, no-store`. Public reviews show the reviewer's first
  name and last initial only.
- **Errors**: unknown routes return a plain `Not found`, and production errors never include internal messages or stack
  traces (they are logged on the server instead).
- **Sign-in**: tokens are pinned to HS256 and to the user's current role. Changing a password signs out every other
  device. Admin sign-ins expire after `ADMIN_JWT_EXPIRES_IN` and failed admin logins are limited to 8 per 15 minutes.
- **Rate limits**: per connection on sign-in and registration, placing orders, order lookups and cancellations, slip
  uploads and reviews. Catalog and settings endpoints are not limited, because the storefront server reads them for
  every visitor from one address.
- **Validation**: every input is validated; image fields only accept media library paths or `https://` links, and
  button links only accept site paths (`/shop`) or `http(s)://` links, so `javascript:` links can't be saved.
- **Headers**: Helmet sets secure HTTP headers; `X-Powered-By` is removed; CORS only allows `CORS_ORIGINS`.

## API overview

All routes are under `/api`. Admin-only routes need an `Authorization: Bearer <token>` header from an admin login.

| Area | Routes |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/admin/login`, `GET/PATCH /auth/me`, `POST /auth/change-password` |
| Catalogue | `GET /categories`, `GET /products` (search, collection, gender, price, sale, sort, paging), `GET /products/:slug` |
| Cart | `POST /cart/quote` prices a cart against live stock and delivery rules; `GET/PUT /cart` and `POST /cart/merge` keep a signed-in customer's bag. Cart lines are `{ variantId, quantity }` |
| Orders | `POST /orders` (guest or signed in, with `paymentMethod`), `GET /orders/mine`, `GET /orders/track?orderNumber&email`, `GET /orders/:orderNumber`, `POST /orders/:orderNumber/cancel`, `POST /orders/:orderNumber/slip` (multipart `slip` file; guests also send `email`) |
| Payment methods | `GET /payment-methods` (what checkout offers), `GET /payment-methods/:method` (bank details for an order page); admin: `GET /payment-methods/admin`, `PATCH /payment-methods/admin/:method` |
| Reviews | `GET /reviews?productId`, `POST /reviews` (published after moderation) |
| Home page | `GET /hero`, `GET /posters`, `GET /settings` (includes the light and dark logos) |
| About us | `GET /about` (public), `PUT /about` (admin): heading, intro, banner image, story sections `[{ title, body, image }]`, values `[{ title, text }]` and a closing button |
| Admin | Product, collection, banner, settings and About us CRUD; `GET /admin/stats`, `/admin/customers`, `/orders/admin` (filters: `status`, `paymentMethod`, `slip=review`), `/orders/admin/:id/slip`, `/reviews/admin`, `/media` |

## Region and currency

The shop is set up for Sri Lanka: prices in LKR, a LKR 450 delivery fee with free delivery from LKR 20,000, and
Colombo contact details, WhatsApp number and opening hours. These are only the defaults for a new database; the admin changes them under **Settings**.
Seeded prices are in LKR.

## Payment methods

Each method is a row in the `PaymentOption` table (created automatically with defaults on first use and by the seed),
edited from the admin's **Payment methods** page: display name, description, instructions, order and on/off.

- **Cash on delivery** (`COD`): marked paid automatically when the order is set to Delivered.
- **Bank transfer** (`BANK_TRANSFER`): checkout and the order page show the shop's bank accounts, the amount and the
  order number as the reference. The customer can upload a slip (JPG, PNG, WEBP or PDF) and/or send it on WhatsApp to
  the number in Settings; both are switchable. The admin views the slip on the order and marks the payment received.
- **Card** (`CARD`): stored but can't be switched on until a payment provider exists on the server.

The API refuses orders for methods that are off, and won't let the last available method be turned off.

### Adding card payments

1. Implement a `PaymentProvider` for `CARD` in `src/services/payment.ts` (for example a PayHere integration) and
   register it in `providers`. Return a `redirectUrl` from `initiate()` for hosted checkouts; the storefront follows it
   automatically.
2. Add a webhook route that verifies the gateway's notification and marks the order's `paymentStatus` as `PAID`.
3. Turn on **Card** in the admin. The switch unlocks as soon as the provider is registered.
