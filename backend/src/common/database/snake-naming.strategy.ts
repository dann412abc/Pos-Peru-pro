import { DefaultNamingStrategy, NamingStrategyInterface, Table } from 'typeorm';
import { snakeCase } from './snake-case.util';

/**
 * Estrategia de nombrado TypeORM: convierte nombres camelCase de TypeScript
 * a snake_case en columnas y tablas de PostgreSQL.
 */
export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  tableName(targetName: string, userSpecifiedName: string | undefined): string {
    return userSpecifiedName ? userSpecifiedName : snakeCase(targetName);
  }

  columnName(propertyName: string, customName: string | undefined, embeddedPrefixes: string[]): string {
    if (customName) return customName;
    return snakeCase(embeddedPrefixes.concat(propertyName).join('_'));
  }

  relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snakeCase(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(firstTableName: string, secondTableName: string): string {
    return snakeCase(`${firstTableName}_${secondTableName}`);
  }

  joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return snakeCase(`${tableName}_${columnName ?? propertyName}`);
  }

  classTableInheritanceParentColumnName(parentTableName: any, parentTableIdPropertyName: any): string {
    return snakeCase(`${parentTableName}_${parentTableIdPropertyName}`);
  }

  foreignKeyName(tableOrName: Table | string, columnNames: string[]): string {
    const tableName = tableOrName instanceof Table ? tableOrName.name : tableOrName;
    const cols = columnNames.map(snakeCase).join('_');
    return `fk_${snakeCase(tableName)}_${cols}`;
  }

  uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    const tableName = tableOrName instanceof Table ? tableOrName.name : tableOrName;
    return `uq_${snakeCase(tableName)}_${columnNames.map(snakeCase).join('_')}`;
  }

  indexName(tableOrName: Table | string, columnNames: string[]): string {
    const tableName = tableOrName instanceof Table ? tableOrName.name : tableOrName;
    return `idx_${snakeCase(tableName)}_${columnNames.map(snakeCase).join('_')}`;
  }
}
