import { cpSync, mkdirSync } from 'fs'
import { dirname } from 'path'

// Copy samples from samples/ to public/samples/
const dirs = ['samples/dubstep', 'samples/electrohouse']

for (const dir of dirs) {
  const dest = `public/${dir}`
  try {
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(dir, dest, { recursive: true })
    console.log(`Copied ${dir} -> ${dest}`)
  } catch (e) {
    console.error(`Error copying ${dir}:`, e.message)
  }
}

console.log('Done copying samples to public/')
