#!/usr/bin/env npx ts-node
/**
 * Seed script — seeds fixtures + initial kitty via the API.
 *
 * Usage:
 *   ADMIN_PASSWORD=yourpassword npx ts-node scripts/seed.ts
 *
 * Or if the dev server is running on a different port:
 *   API_URL=http://localhost:8788 ADMIN_PASSWORD=yourpassword npx ts-node scripts/seed.ts
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(readFileSync(join(__dirname, '../src/data/world-cup-2026-fixtures.json'), 'utf-8'))

const BASE_URL = process.env.API_URL ?? 'http://localhost:8788'
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'password'

async function run() {
  console.log(`Seeding via ${BASE_URL}`)

  // 1. Login
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })
  if (!loginRes.ok) {
    console.error('Login failed. Set ADMIN_PASSWORD env var.')
    process.exit(1)
  }
  const cookie = loginRes.headers.get('set-cookie') ?? ''
  console.log('✓ Logged in')

  // 2. Import fixtures
  const importRes = await fetch(`${BASE_URL}/api/fixtures/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ fixtures }),
  })
  const importResult = await importRes.json() as { inserted: number; skipped: number }
  console.log(`✓ Fixtures: ${importResult.inserted} imported, ${importResult.skipped} skipped`)

  // 3. Seed initial kitty
  const kittyRes = await fetch(`${BASE_URL}/api/kitty/manual-adjustment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      amount: 20000,
      description: 'Initial kitty: 10 × $20',
      notes: '10 participants contributing $20 each',
    }),
  })
  if (kittyRes.ok) {
    console.log('✓ Kitty seeded: $200 initial balance')
  }

  // 4. Seed participants
  const names = ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy']
  for (const name of names) {
    await fetch(`${BASE_URL}/api/participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name }),
    })
  }
  console.log(`✓ Participants seeded: ${names.join(', ')}`)

  console.log('\nDone! The app is ready to use.')
}

run().catch(e => { console.error(e); process.exit(1) })
