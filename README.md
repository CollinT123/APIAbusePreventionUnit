# API Abuse Prevention Frontend Template

Next.js + TypeScript frontend template for the fix-approval workflow:

- show duplicate/high-frequency detection signals
- ask user permission to apply a fix
- call `POST /fixes` with `{ pattern, route, strategy, ttlMs }`
- list/remove active fixes from the in-memory registry

## Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- shadcn-style UI primitives (custom local components)
- framer-motion micro-animations (reactbits-style interactive feel)

## Run locally

1. Copy `.env.example` to `.env.local`
2. Set `NEXT_PUBLIC_API_BASE_URL` (default: `http://localhost:4000`)
3. Start:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Main files

- `src/app/page.tsx`: dashboard + detection flow
- `src/components/fixes/approval-modal.tsx`: user confirmation UI and TTL control
- `src/components/fixes/detection-card.tsx`: sink signal card
- `src/components/fixes/fixes-table.tsx`: active fix registry table
- `src/lib/api.ts`: `GET/POST/DELETE /fixes` client
- `src/types/fix.ts`: shared fix and signal types
