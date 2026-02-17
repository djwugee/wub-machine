import { cpSync, mkdirSync } from 'fs'
import { join } from 'path'

const BASE = '/vercel/share/v0-project'
const dirs = ['samples/dubstep', 'samples/electrohouse']

for (const dir of dirs) {
  const src = join(BASE, dir)
  const dest = join(BASE, 'public', dir)
  try {
    mkdirSync(dest, { recursive: true })
    cpSync(src, dest, { recursive: true })
    console.log(`Copied ${src} -> ${dest}`)
  } catch (e) {
    console.error(`Error copying ${dir}:`, e.message)
  }
}

console.log('Done copying samples to public/')
