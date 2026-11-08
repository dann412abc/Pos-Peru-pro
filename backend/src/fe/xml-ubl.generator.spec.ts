import { XMLParser } from 'fast-xml-parser';
import { generarXmlUbl, DatosComprobanteFe } from './xml-ubl.generator';
import { TipoIgvEnum } from '../common/enums';

const baseDatos = (tipo: string): DatosComprobanteFe => ({
  tipo,
  serie: tipo === '01' ? 'F001' : 'B001',
  correlativo: 1,
  fechaEmision: new Date('2026-11-04T10:00:00Z'),
  empresa: {
    ruc: '20601234565', razonSocial: 'COMERCIAL HUANCAYO S.A.C.', nombreComercial: 'BODEGA HUANCAYO',
    direccion: 'Av. Mariscal Castilla 123', ubigeo: '120101',
    departamento: 'Junin', provincia: 'Huancayo', distrito: 'Huancayo',
  },
  cliente: { tipoDoc: 'DNI', numero: '00000000', nombre: 'CONSUMIDOR FINAL' },
  lineas: [
    { numeroLinea: 1, cantidad: 2, unidad: 'NIU', descripcion: 'Gaseosa 1.5L', precioUnitario: 5.9, descuento: 0, tipoIgv: TipoIgvEnum.GRAVADO, baseImponible: 10, igv: 1.8, subtotal: 11.8 },
    { numeroLinea: 2, cantidad: 1, unidad: 'NIU', descripcion: 'Arroz 5kg', precioUnitario: 22, descuento: 0, tipoIgv: TipoIgvEnum.EXONERADO, baseImponible: 22, igv: 0, subtotal: 22 },
    { numeroLinea: 3, cantidad: 10, unidad: 'NIU', descripcion: 'Paracetamol', precioUnitario: 0.3, descuento: 0, tipoIgv: TipoIgvEnum.INAFECTO, baseImponible: 3, igv: 0, subtotal: 3 },
  ],
  opGravadas: 10, opExoneradas: 22, opInafectas: 3, descuentoGlobal: 0, totalIgv: 1.8, total: 36.8,
});

describe('Generador XML UBL 2.1 (SUNAT)', () => {
  test('genera XML bien formado (parseable) con raiz Invoice', () => {
    const xml = generarXmlUbl(baseDatos('01'));
    const parser = new XMLParser({ ignoreAttributes: false });
    const doc = parser.parse(xml);
    expect(doc.Invoice).toBeDefined();
    // Declaracion XML y namespaces presentes.
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"');
    expect(xml).toContain('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
  });

  test('factura (01) y boleta (03) usan los codigos de documento correctos', () => {
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
    const factura = parser.parse(generarXmlUbl(baseDatos('01')));
    const boleta = parser.parse(generarXmlUbl(baseDatos('03')));
    expect(factura.Invoice['cbc:InvoiceTypeCode']).toBe('01');
    expect(boleta.Invoice['cbc:InvoiceTypeCode']).toBe('03');
    expect(factura.Invoice['cbc:ID']).toContain('F001');
    expect(boleta.Invoice['cbc:ID']).toContain('B001');
  });

  test('catalogos SUNAT correctos: moneda PEN, unidad NIU, pais PE, IGV 10/20/30, esquema 1000', () => {
    const xml = generarXmlUbl(baseDatos('01'));
    expect(xml).toContain('<cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>');
    expect(xml).toContain('unitCode="NIU"');
    expect(xml).toContain('>PE</cbc:IdentificationCode>');
    // Categorias de IGV (Catalogo 07): gravado 10, exonerado 20, inafecto 30.
    expect(xml).toContain('<cbc:ID>10</cbc:ID>');
    expect(xml).toContain('<cbc:ID>20</cbc:ID>');
    expect(xml).toContain('<cbc:ID>30</cbc:ID>');
    // Esquema tributario IGV (Catalogo 14: 1000 = IGV, tipo VAT).
    expect(xml).toContain('<cbc:ID>1000</cbc:ID>');
    expect(xml).toContain('<cbc:Name>IGV</cbc:Name>');
    expect(xml).toContain('<cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>');
    // RUC de empresa y DNI de cliente (Catalogo 06: 6=RUC, 1=DNI).
    expect(xml).toContain('schemeID="6">20601234565</cbc:ID>');
    expect(xml).toContain('schemeID="1">00000000</cbc:ID>');
    // Version UBL 2.1.
    expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
  });

  test('nota de crédito UBL referencia la boleta y describe el motivo', () => {
    const nota = {
      ...baseDatos('07'), serie: 'NC01',
      referencia: { tipo: '03', serie: 'B001', correlativo: 25 },
      codigoMotivoNota: '07', descripcionMotivoNota: 'Devolución parcial de productos',
    };
    const xml = generarXmlUbl(nota);
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
    const doc = parser.parse(xml);
    expect(doc.CreditNote).toBeDefined();
    expect(xml).toContain('<cbc:CreditNoteTypeCode>07</cbc:CreditNoteTypeCode>');
    expect(xml).toContain('<cbc:DocumentTypeCode>03</cbc:DocumentTypeCode>');
    expect(xml).toContain('<cbc:ResponseCode>07</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:CreditedQuantity');
  });

  test('nota de débito UBL referencia factura para aumento de valor', () => {
    const nota = {
      ...baseDatos('08'), serie: 'ND01',
      referencia: { tipo: '01', serie: 'F001', correlativo: 9 },
      codigoMotivoNota: '02', descripcionMotivoNota: 'Aumento de valor por ajuste de precio',
    };
    const xml = generarXmlUbl(nota);
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
    const doc = parser.parse(xml);
    expect(doc.DebitNote).toBeDefined();
    expect(xml).toContain('<cbc:DebitNoteTypeCode>08</cbc:DebitNoteTypeCode>');
    expect(xml).toContain('<cbc:ResponseCode>02</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:DebitedQuantity');
  });

  test('no genera nota sin referencia o motivo', () => {
    expect(() => generarXmlUbl(baseDatos('07'))).toThrow('La nota requiere comprobante de referencia y motivo');
  });
});
