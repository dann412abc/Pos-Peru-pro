# Etapa 13 — catálogo de variantes de productos

## Incluido
- Variantes vinculadas a un producto y a la empresa.
- Código interno único por empresa.
- Código de barras opcional único por empresa.
- Nombre de presentación y precio propio (precio final con IGV incluido).
- Precio mayorista opcional.
- Alta, consulta, actualización y desactivación lógica.
- Endpoints protegidos por JWT; escritura restringida al rol ADMIN.
- Migración TypeORM preparada, sin ejecutar.

## API
- `GET /api/productos/:productoId/variantes`
- `POST /api/productos/:productoId/variantes`
- `PUT /api/productos/:productoId/variantes/:varianteId`
- `DELETE /api/productos/:productoId/variantes/:varianteId` (desactiva)

## Ejemplo de alta
```json
{
  "codigo": "BEBIDA-500",
  "codigoBarras": "7750123456789",
  "nombre": "Botella 500 ml",
  "precio": 3.5,
  "precioMayoreo": 3.2
}
```

## Límites deliberados
Esta etapa implementa el catálogo y sus endpoints, pero NO asigna todavía existencias por variante ni modifica el flujo de ventas. El stock actual sigue perteneciendo al producto por sucursal. No se debe vender una variante hasta completar la etapa siguiente: líneas de venta, reservas/validación de stock, movimientos y devoluciones por variante en una única transacción.

## Migración
`backend/src/database/migrations/1710000000011-producto-variantes.ts`
No se ejecutó. La migración crea un índice único explícito sobre `producto(id, empresa_id)` (el `id` ya es PK) para satisfacer la FK compuesta y garantizar que la variante pertenezca al mismo tenant que el producto.
