# IT Management (MVP)

DevExtreme React UI with an Express + Prisma + **system MySQL** API. No Docker database—use MySQL installed on your machine.

## Prerequisites

- Node.js **20.19+** and npm **9.6+** (required by DevExtreme CLI)
- **MySQL 8** (or compatible) running locally
- Empty database, e.g. `CREATE DATABASE it_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

## Setup

1. **Environment**

   Copy [.env.example](.env.example) to `.env` in the **repository root** and set:

   - `DATABASE_URL` — `mysql://USER:PASSWORD@localhost:3306/it_management` (adjust user, password, host, port, database name)
   - `JWT_SECRET` — a long random string
   - `PORT` — API port (default `3001`)
   - `FRONTEND_ORIGIN` — Vite dev server (default `http://localhost:5173`)

2. **Database migrations and seed**

   `DATABASE_URL` lives in the **repo root** `.env`. Prisma commands run from `backend/`, so use the npm scripts (they load `../.env`):

   ```bash
   cd backend
   npm install
   npm run db:deploy
   npm run db:seed
   ```

   (For local development you can use `npm run db:migrate` instead of `db:deploy` to create/apply migrations interactively.)

   The seed creates an administrator account (see below).

3. **Run the API**

   ```bash
   cd backend
   npm run dev
   ```

4. **Run the frontend**

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   The Vite dev server proxies `/api` to `http://localhost:3001` (see [frontend/vite.config.ts](frontend/vite.config.ts)).

5. **Open the app**

   Use the URL Vite prints (usually `http://localhost:5173`). Sign in with the seeded admin user.

## Default seeded credentials

After `npx prisma db seed`:

- **Email:** `admin@local.test`
- **Password:** `Admin123!`

Change the password after first login in production.

## Features (MVP)

- JWT authentication (Bearer token in `sessionStorage`)
- **Users** — full CRUD (administrators only; API enforces `ADMIN` role)
- **Products** — full CRUD; `quantityOnHand` is the single stock pool per product
- **Stock** — movement history per product; **New movement** posts `IN`, `OUT`, or `ADJUST` (adjust sets on-hand to the quantity you enter)

## Project layout

| Path | Description |
|------|-------------|
| [frontend/](frontend) | DevExtreme + Vite + React (TypeScript) |
| [backend/](backend) | Express API, Prisma, MySQL |
| [devextreme-guide.md](devextreme-guide.md) | Notes on DevExtreme patterns |

## License note

DevExtreme is configured for non-commercial evaluation via `devextreme/core/config` in [frontend/src/main.tsx](frontend/src/main.tsx). For commercial use, obtain a proper DevExtreme license per [DevExpress licensing](https://js.devexpress.com/React/Documentation/Guide/Common/Licensing/).
