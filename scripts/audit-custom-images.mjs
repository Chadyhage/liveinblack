#!/usr/bin/env node
import { access, readdir, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const sourceRoots = ['app', 'lib', 'scripts', 'e2e']
const imageRoot = 'public/images/live-in-black'
const sourceFilePattern = /\.(tsx?|jsx?|css|mjs|cjs|json)$/
const liveAssetRegex = /\/images\/live-in-black\/(?:[^\"'`\s)]+\.(?:png|jpg|jpeg|webp|gif|avif|svg|ico|JPG|JPEG|PNG|WEBP))/gi

async function walkFiles(path) {
  const entries = await readdir(path, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const full = `${path}/${entry.name}`
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)))
    } else if (sourceFilePattern.test(full)) {
      files.push(full)
    }
  }

  return files
}

async function collectRequiredAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const assets = []

  for (const entry of entries) {
    const full = `${directory}/${entry.name}`
    if (entry.isDirectory()) {
      assets.push(...(await collectRequiredAssets(full)))
    } else {
      assets.push(full)
    }
  }

  return assets
}

const requiredAssets = await collectRequiredAssets(imageRoot)
const failures = []

for (const asset of requiredAssets) {
  try {
    await access(asset, constants.R_OK)
  } catch {
    failures.push(`Fichier attendu absent: ${asset}`)
  }
}

for (const root of sourceRoots) {
  let sourceFiles = []
  try {
    sourceFiles = await walkFiles(root)
  } catch {
    continue
  }

  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8')
    let match
    while ((match = liveAssetRegex.exec(source))) {
      const asset = match[0]
      if (!requiredAssets.includes(`public${asset}`)) {
        const line = source.slice(0, match.index).split('\n').length
        failures.push(`${file}:${line}: référence obsolète ou invalide -> ${asset}`)
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`Audit images sur mesure KO - ${failures.length} probleme(s)`)
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Audit images sur mesure OK - ${requiredAssets.length} assets organisés et valides.`)
