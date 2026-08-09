# Twinkle’s UK Packing Checklist

A modern, mobile-friendly packing checklist for Twinkle’s move from India to the United Kingdom.

## Features

- Custom packing categories and editable checklist items
- One-tap packed/unpacked status
- Priority, quantity, bag location, buying recommendation, and notes for each item
- Overview progress, essential-item alerts, and smart packing suggestions
- Hand luggage, bag organisation, and luggage weight tracking
- Before leaving India, airport, and UK arrival checklists
- Browser LocalStorage persistence with JSON import/export
- Print and save-as-PDF friendly layout

## Run Locally

```bash
pnpm install
pnpm run dev
```

Then open the local URL printed by the dev server.

## Build

```bash
pnpm run build
```

## Optional Free Cloud Sync

This app can sync checklist data with Supabase Free.

1. Create a free Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. In Supabase Auth settings, enable anonymous sign-ins.
4. Re-run the GitHub Pages workflow.

The public Supabase URL and anon key are bundled for this personal app, so Twinkle does not need to configure anything. Without Supabase access, the app still works with browser LocalStorage.
