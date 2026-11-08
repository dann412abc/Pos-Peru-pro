import 'reflect-metadata';
import { AppDataSource } from './data-source';

/**
 * Ejecuta migraciones pendientes (npm run migration:run).
 * Con argumento "revert" revierte la ultima migracion.
 */
async function main() {
  const revert = process.argv.includes('revert');
  await AppDataSource.initialize();
  if (revert) {
    await AppDataSource.undoLastMigration();
    console.log('Migracion revertida OK');
  } else {
    const ejecutadas = await AppDataSource.runMigrations();
    console.log(`Migraciones ejecutadas: ${ejecutadas.length}`);
  }
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Error ejecutando migraciones:', err);
  process.exit(1);
});
