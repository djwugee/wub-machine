#!/usr/bin/env node

/**
 * Sync Samples Script
 * Copies sample files from the original Python project to the public directory
 * Run with: node scripts/sync-samples.js
 */

const fs = require('fs')
const path = require('path')

const SOURCE_SAMPLES = path.join(__dirname, '..', 'samples')
const DEST_SAMPLES = path.join(__dirname, '..', 'public', 'samples')

const remixers = ['dubstep', 'electrohouse']

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    console.log(`Created directory: ${dir}`)
  }
}

function copySamples() {
  console.log('Starting sample synchronization...\n')

  try {
    // Create destination directory structure
    ensureDirectory(DEST_SAMPLES)
    remixers.forEach((remixer) => {
      ensureDirectory(path.join(DEST_SAMPLES, remixer))
    })

    let totalCopied = 0
    let totalFailed = 0

    // Copy samples for each remixer
    remixers.forEach((remixer) => {
      const sourceDir = path.join(SOURCE_SAMPLES, remixer)
      const destDir = path.join(DEST_SAMPLES, remixer)

      if (!fs.existsSync(sourceDir)) {
        console.warn(`Source directory not found: ${sourceDir}`)
        return
      }

      const files = fs.readdirSync(sourceDir)
      console.log(`Processing ${remixer}: ${files.length} files`)

      files.forEach((file) => {
        if (!file.endsWith('.wav') && !file.endsWith('.mp3')) {
          return
        }

        const sourcePath = path.join(sourceDir, file)
        const destPath = path.join(destDir, file)

        try {
          fs.copyFileSync(sourcePath, destPath)
          console.log(`  ✓ ${file}`)
          totalCopied++
        } catch (error) {
          console.error(`  ✗ Failed to copy ${file}: ${error.message}`)
          totalFailed++
        }
      })

      console.log()
    })

    console.log('Sample synchronization complete!')
    console.log(`Total copied: ${totalCopied}`)
    if (totalFailed > 0) {
      console.log(`Total failed: ${totalFailed}`)
    }
  } catch (error) {
    console.error('Error during sample synchronization:', error)
    process.exit(1)
  }
}

// Run the sync
copySamples()
