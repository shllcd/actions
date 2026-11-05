#!/usr/bin/env node
// Version and notes after `changeset version`: the bumped manifest and the top
// section of the package CHANGELOG.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { opt, die, emit } from '../lib/io.mjs'

const packageDir = opt('package', '.')
const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
const version = manifest.version
if (!version) die(`${join(packageDir, 'package.json')} has no version`)

const changelog = join(packageDir, 'CHANGELOG.md')
let notes = ''
if (existsSync(changelog)) {
  const text = readFileSync(changelog, 'utf8')
  const match = /^## +([^\n]+)\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)
  notes = match ? match[2].trim() : ''
}

emit({ version, previous: '', bump: 'changesets', notes })
