import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { VentasService } from './ventas.service';

describe('Permisos de descuento en ventas',()=>{
  const service=new VentasService({} as any,{} as any,{} as any,{} as any);
  const base:any={tipo:'03',sucursalId:1,descuentoGlobal:0,lineas:[{productoId:1,cantidad:1,descuento:2}]};
  it('rechaza descuentos enviados por un cajero en el servidor',async()=>{
    await expect(service.create(base,1,1,[1],'CAJERO')).rejects.toThrow(ForbiddenException);
  });
  it('exige motivo para un administrador que aplica descuento',async()=>{
    await expect(service.create(base,1,1,[1],'ADMIN')).rejects.toThrow(BadRequestException);
  });
  it('acepta el motivo pero mantiene la validación de acceso a sucursal',async()=>{
    await expect(service.create({...base,motivoDescuento:'Promoción autorizada'},1,1,[],'ADMIN')).rejects.toThrow(ForbiddenException);
  });
});
