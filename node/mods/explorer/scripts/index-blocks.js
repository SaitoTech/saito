#!/usr/bin/env node
// Run from node/: node mods/explorer/scripts/index-blocks.js --help
const path = require('path');
const fs = require('fs');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { hash } = require('blake3');
const { ChainDatabase } = require('../lib/chain-database');
const { blockFiles, readBlockMetadata } = require('../lib/chain-files');

async function main(args) {
  if (args.includes('--help')) {
    console.log(`Usage:
  node mods/explorer/scripts/index-blocks.js --source /archive/blocks --database /tmp/chain.sq3 [--recursive]
  node mods/explorer/scripts/index-blocks.js --merge /tmp/chain.sq3 --database data/explorer.sq3

Scans only block headers; resumes by skipping unchanged files. Invalid files are
reported and skipped. Exit 2 means some files failed. Archive chain membership
is unknown until reconciled with the live node. Existing chain status is preserved.
Import paths must remain accessible on the serving node for full-block retrieval.`);
    return;
  }
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--recursive') options.recursive = true;
    else if (
      ['--source', '--database', '--merge'].includes(key) &&
      args[i + 1] &&
      !args[i + 1].startsWith('--')
    ) {
      options[key.slice(2)] = path.resolve(args[++i]);
    } else throw new Error(`Unknown or incomplete argument: ${key}`);
  }
  if (!options.database || Boolean(options.source) === Boolean(options.merge)) {
    throw new Error('Supply --database and exactly one of --source or --merge; see --help');
  }
  if (options.merge) {
    if (options.merge === options.database)
      throw new Error('Source and destination databases must differ');
    await fs.promises.access(options.merge);
  } else if (!(await fs.promises.stat(options.source)).isDirectory())
    throw new Error('Source must be a directory');
  const db = await open({ filename: options.database, driver: sqlite3.Database });
  await db.exec('PRAGMA busy_timeout = 10000');
  const index = new ChainDatabase(db);
  try {
    await index.initialize();
    if (options.merge) {
      await db.run('ATTACH DATABASE ? AS archive_chain', options.merge);
      const result = await db.run(`INSERT INTO explorer_chain_blocks
        SELECT hash, height, parent_hash, timestamp, creator, tx_count, size_bytes,
          NULL, file_path, body_available FROM archive_chain.explorer_chain_blocks WHERE 1
        ON CONFLICT(hash) DO UPDATE SET
          tx_count = COALESCE(excluded.tx_count, tx_count),
          size_bytes = COALESCE(excluded.size_bytes, size_bytes),
          file_path = CASE WHEN body_available = 0 OR file_path IS NULL
            THEN excluded.file_path ELSE file_path END,
          body_available = MAX(body_available, excluded.body_available)`);
      console.log(`Merged ${result.changes} block records into ${options.database}`);
      await db.run('DETACH DATABASE archive_chain');
      return;
    }
    let imported = 0,
      skipped = 0,
      failed = 0,
      batch = 0;
    await db.exec('BEGIN IMMEDIATE');
    try {
      for await (const filename of blockFiles(options.source, Boolean(options.recursive))) {
        try {
          const stat = await fs.promises.stat(filename);
          if (await index.fileSeen(filename, stat)) skipped++;
          else {
            await index.put(await readBlockMetadata(filename, hash));
            await index.rememberFile(filename, stat);
            imported++;
          }
        } catch (err) {
          // Database failures must abort rather than masquerade as bad blocks.
          if (err.code?.startsWith('SQLITE')) throw err;
          failed++;
          console.error(`${filename}: ${err.message}`);
        }
        if (++batch === 100) {
          await db.exec('COMMIT');
          console.log(`Indexed ${imported}; unchanged ${skipped}; failed ${failed}`);
          await db.exec('BEGIN IMMEDIATE');
          batch = 0;
        }
      }
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
    console.log(`Complete: indexed ${imported}; unchanged ${skipped}; failed ${failed}`);
    if (failed) process.exitCode = 2;
  } finally {
    await db.close();
  }
}

if (require.main === module)
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });

module.exports = { main };
