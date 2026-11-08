import { seleccionarLotesFefo } from './fefo';
describe('selección FEFO',()=>{
  it('consume primero vencimiento cercano y deja lotes sin fecha al final',()=>{
    const rows=seleccionarLotesFefo([{id:1,cantidad_disponible:2,fecha_vencimiento:null},{id:2,cantidad_disponible:1,fecha_vencimiento:'2026-12-01'},{id:3,cantidad_disponible:2,fecha_vencimiento:'2026-11-20'}],2,'2026-11-05');
    expect(rows.map(x=>[x.lote.id,x.cantidad])).toEqual([[3,2]]);
  });
  it('omite vencidos y falla si no alcanza stock vendible',()=>expect(()=>seleccionarLotesFefo([{id:1,cantidad_disponible:3,fecha_vencimiento:'2026-11-04'}],1,'2026-11-05')).toThrow());
});
