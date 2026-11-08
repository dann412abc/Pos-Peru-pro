export type LoteFefo={id:number|string;cantidad_disponible:number|string;fecha_vencimiento:string|Date|null;created_at?:string|Date;};
export function fechaHoyLima(fecha=new Date()) { const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(fecha);const v=(t:string)=>p.find(x=>x.type===t)?.value||'';return `${v('year')}-${v('month')}-${v('day')}`; }
export function seleccionarLotesFefo<T extends LoteFefo>(lotes:T[],cantidad:number,hoy:string) {
  const ordenados=[...lotes].filter(l=>Number(l.cantidad_disponible)>0&&(!l.fecha_vencimiento||String(l.fecha_vencimiento).slice(0,10)>=hoy))
    .sort((a,b)=>{
      const fa=a.fecha_vencimiento?String(a.fecha_vencimiento).slice(0,10):'9999-12-31';
      const fb=b.fecha_vencimiento?String(b.fecha_vencimiento).slice(0,10):'9999-12-31';
      return fa.localeCompare(fb)||(new Date(a.created_at||0).getTime()-new Date(b.created_at||0).getTime())||(Number(a.id)-Number(b.id));
    });
  let restante=Math.round(cantidad*1000)/1000;const asignaciones:{lote:T;cantidad:number}[]=[];
  for(const lote of ordenados){if(restante<=0.0005)break;const tomar=Math.min(restante,Number(lote.cantidad_disponible));asignaciones.push({lote,cantidad:tomar});restante=Number((restante-tomar).toFixed(3));}
  if(restante>0.0005)throw new Error('Lotes insuficientes o vencidos');
  return asignaciones;
}
