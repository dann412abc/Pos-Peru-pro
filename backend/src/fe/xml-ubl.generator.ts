import {
  CODIGO_PAIS_NUMERICO_PE, CODIGO_PAIS_PE, IGV_PORCENTAJE, MONEDA_PEN, TipoIgvEnum,
} from '../common/enums';

/**
 * Generador de XML UBL 2.1 para factura (01) y boleta (03) segun
 * especificaciones SUNAT (catalogos 01, 03, 06, 07).
 *
 * NO incluye firma digital real (placeholder). La firma la aplica el OSE.
 */

export interface DatosEmpresaFe {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  direccion: string;
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
}

export interface DatosClienteFe {
  tipoDoc: string; // 'DNI' | 'RUC'
  numero: string;
  nombre: string;
  direccion?: string;
}

export interface DatosLineaFe {
  numeroLinea: number;
  cantidad: number;
  unidad: string; // NIU
  descripcion: string;
  precioUnitario: number; // incluye IGV
  descuento: number;
  tipoIgv: TipoIgvEnum;
  baseImponible: number;
  igv: number;
  subtotal: number;
}

export interface DatosComprobanteFe {
  tipo: string; // '01' factura | '03' boleta
  serie: string;
  correlativo: number;
  fechaEmision: Date;
  empresa: DatosEmpresaFe;
  cliente: DatosClienteFe;
  lineas: DatosLineaFe[];
  opGravadas: number;
  opExoneradas: number;
  opInafectas: number;
  descuentoGlobal: number;
  totalIgv: number;
  total: number;
  referencia?: { tipo: string; serie: string; correlativo: number };
  codigoMotivoNota?: string;
  descripcionMotivoNota?: string;
}

function escaparXml(valor: string | number): string {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmt(n: number): string {
  return (Number(n) || 0).toFixed(2);
}

/** Catalogo SUNAT 06: DNI=1, RUC=6. */
function codigoTipoDocumento(tipoDoc: string): string {
  if (tipoDoc === 'RUC') return '6';
  return '1'; // DNI
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function generarXmlNota(datos: DatosComprobanteFe): string {
  const referencia = datos.referencia;
  const codigo = datos.codigoMotivoNota;
  const descripcion = datos.descripcionMotivoNota;
  if (!referencia || !codigo || !descripcion) throw new Error('La nota requiere comprobante de referencia y motivo');
  const esCredito = datos.tipo === '07';
  if (!esCredito && datos.tipo !== '08') throw new Error(`Tipo de nota no soportado: ${datos.tipo}`);
  const raiz = esCredito ? 'CreditNote' : 'DebitNote';
  const elementoLinea = esCredito ? 'CreditNoteLine' : 'DebitNoteLine';
  const cantidadLinea = esCredito ? 'CreditedQuantity' : 'DebitedQuantity';
  const idComprobante = `${datos.serie}-${pad(datos.correlativo, 8)}`;
  const idReferencia = `${referencia.serie}-${pad(referencia.correlativo, 8)}`;
  const fecha = datos.fechaEmision.toISOString().slice(0, 10);
  const hora = datos.fechaEmision.toISOString().slice(11, 19);
  const { empresa, cliente } = datos;
  const bases = new Map<number, { base: number; igv: number }>();
  for (const linea of datos.lineas) {
    const actual = bases.get(Number(linea.tipoIgv)) || { base: 0, igv: 0 };
    actual.base += Number(linea.baseImponible);
    actual.igv += Number(linea.igv);
    bases.set(Number(linea.tipoIgv), actual);
  }
  const taxSubtotal = [...bases.entries()].map(([tipo, valor]) => `
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="PEN">${fmt(valor.base)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">${fmt(valor.igv)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${tipo}</cbc:ID><cbc:Percent>${tipo === 10 ? (IGV_PORCENTAJE * 100).toFixed(2) : '0.00'}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme>
      </cac:TaxCategory></cac:TaxSubtotal>`).join('');
  const taxLines = datos.lineas.map((linea, index) => {
    const taxCode = Number(linea.tipoIgv);
    const quantity = Math.max(Number(linea.cantidad), 0.001);
    return `
      <cac:${elementoLinea}><cbc:ID>${index + 1}</cbc:ID><cbc:${cantidadLinea} unitCode="${escaparXml(linea.unidad || 'NIU')}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${fmt(quantity)}</cbc:${cantidadLinea}>
        <cbc:LineExtensionAmount currencyID="PEN">${fmt(linea.baseImponible)}</cbc:LineExtensionAmount>
        <cac:PricingReference><cac:AlternativeConditionPrice><cbc:PriceAmount currencyID="PEN">${fmt(linea.precioUnitario)}</cbc:PriceAmount><cbc:PriceTypeCode>01</cbc:PriceTypeCode></cac:AlternativeConditionPrice></cac:PricingReference>
        <cac:TaxTotal><cbc:TaxAmount currencyID="PEN">${fmt(linea.igv)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="PEN">${fmt(linea.baseImponible)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="PEN">${fmt(linea.igv)}</cbc:TaxAmount>
          <cac:TaxCategory><cbc:ID>${taxCode}</cbc:ID><cbc:Percent>${taxCode === 10 ? (IGV_PORCENTAJE * 100).toFixed(2) : '0.00'}</cbc:Percent><cbc:TaxExemptionReasonCode>${taxCode}</cbc:TaxExemptionReasonCode><cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme></cac:TaxCategory>
        </cac:TaxSubtotal></cac:TaxTotal>
        <cac:Item><cbc:Description>${escaparXml(linea.descripcion)}</cbc:Description></cac:Item><cac:Price><cbc:PriceAmount currencyID="PEN">${fmt(linea.precioUnitario)}</cbc:PriceAmount></cac:Price>
      </cac:${elementoLinea}>`;
  }).join('');
  const clienteRef = `
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="${codigoTipoDocumento(cliente.tipoDoc)}">${escaparXml(cliente.numero)}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName>${escaparXml(cliente.nombre)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>`;
  const proveedor = `
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="6">${escaparXml(empresa.ruc)}</cbc:ID></cac:PartyIdentification><cac:PartyLegalEntity><cbc:RegistrationName>${escaparXml(empresa.razonSocial)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>`;
  const referenciaUbl = `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${escaparXml(idReferencia)}</cbc:ID><cbc:DocumentTypeCode>${escaparXml(referencia.tipo)}</cbc:DocumentTypeCode></cac:InvoiceDocumentReference></cac:BillingReference>`;
  const discrepanciaUbl = `<cac:DiscrepancyResponse><cbc:ReferenceID>${escaparXml(idReferencia)}</cbc:ReferenceID><cbc:ResponseCode>${escaparXml(codigo)}</cbc:ResponseCode><cbc:Description>${escaparXml(descripcion)}</cbc:Description></cac:DiscrepancyResponse>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<${raiz} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${raiz}-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent><ds:Signature Id="SignaturePlaceholder"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></ds:SignedInfo></ds:Signature></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID><cbc:CustomizationID>2.0</cbc:CustomizationID><cbc:ID>${escaparXml(idComprobante)}</cbc:ID><cbc:IssueDate>${fecha}</cbc:IssueDate><cbc:IssueTime>${hora}</cbc:IssueTime>
  <cbc:${esCredito ? 'CreditNoteTypeCode' : 'DebitNoteTypeCode'}>${datos.tipo}</cbc:${esCredito ? 'CreditNoteTypeCode' : 'DebitNoteTypeCode'}><cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
  ${esCredito ? discrepanciaUbl : ''}${referenciaUbl}${esCredito ? '' : discrepanciaUbl}
  ${proveedor}${clienteRef}
  <cac:TaxTotal><cbc:TaxAmount currencyID="PEN">${fmt(datos.totalIgv)}</cbc:TaxAmount>${taxSubtotal}</cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="PEN">${fmt(datos.opGravadas + datos.opExoneradas + datos.opInafectas)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="PEN">${fmt(datos.opGravadas + datos.opExoneradas + datos.opInafectas)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="PEN">${fmt(datos.total)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="PEN">${fmt(datos.total)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  ${taxLines}
</${raiz}>`;
}

export function generarXmlUbl(datos: DatosComprobanteFe): string {
  if (datos.tipo === '07' || datos.tipo === '08') return generarXmlNota(datos);
  const { empresa, cliente, lineas } = datos;
  const fecha = datos.fechaEmision.toISOString().slice(0, 10);
  const hora = datos.fechaEmision.toISOString().slice(11, 19);
  const idComprobante = `${datos.serie}-${pad(datos.correlativo, 8)}`;

  const subtotalLineas = lineas.reduce((s, l) => s + l.subtotal, 0);
  const baseImponibleTotal = datos.opGravadas + datos.opExoneradas + datos.opInafectas;

  // TaxSubtotales por categoria de IGV (Catalogo 07: 10/20/30).
  const taxSubtotales: string[] = [];
  if (datos.opGravadas > 0) {
    taxSubtotales.push(`
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${MONEDA_PEN}">${fmt(datos.opGravadas)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${MONEDA_PEN}">${fmt(datos.totalIgv)}</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID>10</cbc:ID>
            <cbc:Percent>${(IGV_PORCENTAJE * 100).toFixed(2)}</cbc:Percent>
            <cac:TaxScheme>
              <cbc:ID>1000</cbc:ID>
              <cbc:Name>IGV</cbc:Name>
              <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>`);
  }
  if (datos.opExoneradas > 0) {
    taxSubtotales.push(`
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${MONEDA_PEN}">${fmt(datos.opExoneradas)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${MONEDA_PEN}">0.00</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID>20</cbc:ID>
            <cbc:Percent>0.00</cbc:Percent>
            <cac:TaxScheme>
              <cbc:ID>1000</cbc:ID>
              <cbc:Name>IGV</cbc:Name>
              <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>`);
  }
  if (datos.opInafectas > 0) {
    taxSubtotales.push(`
        <cac:TaxSubtotal>
          <cbc:TaxableAmount currencyID="${MONEDA_PEN}">${fmt(datos.opInafectas)}</cbc:TaxableAmount>
          <cbc:TaxAmount currencyID="${MONEDA_PEN}">0.00</cbc:TaxAmount>
          <cac:TaxCategory>
            <cbc:ID>30</cbc:ID>
            <cbc:Percent>0.00</cbc:Percent>
            <cac:TaxScheme>
              <cbc:ID>1000</cbc:ID>
              <cbc:Name>IGV</cbc:Name>
              <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
          </cac:TaxCategory>
        </cac:TaxSubtotal>`);
  }

  const lineasXml = lineas.map((l) => {
    const percent = l.tipoIgv === TipoIgvEnum.GRAVADO ? (IGV_PORCENTAJE * 100).toFixed(2) : '0.00';
    const allowance = l.descuento > 0 ? `
        <cac:AllowanceCharge>
          <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
          <cbc:Amount currencyID="${MONEDA_PEN}">${fmt(l.descuento)}</cbc:Amount>
          <cbc:BaseAmount currencyID="${MONEDA_PEN}">${fmt(l.precioUnitario * l.cantidad)}</cbc:BaseAmount>
        </cac:AllowanceCharge>` : '';
    return `
      <cac:InvoiceLine>
        <cbc:ID>${l.numeroLinea}</cbc:ID>
        <cbc:InvoicedQuantity unitCode="${escaparXml(l.unidad || 'NIU')}">${fmt(l.cantidad)}</cbc:InvoicedQuantity>
        <cbc:LineExtensionAmount currencyID="${MONEDA_PEN}">${fmt(l.subtotal)}</cbc:LineExtensionAmount>${allowance}
        <cac:TaxTotal>
          <cbc:TaxAmount currencyID="${MONEDA_PEN}">${fmt(l.igv)}</cbc:TaxAmount>
          <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="${MONEDA_PEN}">${fmt(l.baseImponible)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="${MONEDA_PEN}">${fmt(l.igv)}</cbc:TaxAmount>
            <cac:TaxCategory>
              <cbc:ID>${l.tipoIgv}</cbc:ID>
              <cbc:Percent>${percent}</cbc:Percent>
              <cac:TaxScheme>
                <cbc:ID>1000</cbc:ID>
                <cbc:Name>IGV</cbc:Name>
                <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
              </cac:TaxScheme>
            </cac:TaxCategory>
          </cac:TaxSubtotal>
        </cac:TaxTotal>
        <cac:Item>
          <cbc:Description>${escaparXml(l.descripcion)}</cbc:Description>
        </cac:Item>
        <cac:Price>
          <cbc:PriceAmount currencyID="${MONEDA_PEN}">${fmt(l.precioUnitario)}</cbc:PriceAmount>
        </cac:Price>
      </cac:InvoiceLine>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <ds:Signature Id="SignaturePlaceholder">
          <ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></ds:SignedInfo>
        </ds:Signature>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${escaparXml(idComprobante)}</cbc:ID>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  <cbc:IssueTime>${hora}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${datos.tipo}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${MONEDA_PEN}</cbc:DocumentCurrencyCode>
  <cac:Signature>
    <cbc:ID>1</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification><cbc:ID>${escaparXml(empresa.ruc)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${escaparXml(empresa.razonSocial)}</cbc:Name></cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#SignaturePlaceholder</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="6">${escaparXml(empresa.ruc)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${escaparXml(empresa.nombreComercial || empresa.razonSocial)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:ID>${escaparXml(empresa.ubigeo)}</cbc:ID>
        <cbc:StreetName>${escaparXml(empresa.direccion)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${escaparXml(empresa.distrito)}</cbc:CitySubdivisionName>
        <cbc:CityName>${escaparXml(empresa.provincia)}</cbc:CityName>
        <cbc:CountrySubentity>${escaparXml(empresa.departamento)}</cbc:CountrySubentity>
        <cac:Country><cbc:IdentificationCode listID="ISO 3166-1" listAgencyName="United Nations Economic Commission for Europe" listName="Country" listSchemeURI="urn:oasis:names:specification:ubl:codelist:gc:CountryIdentificationCode">${CODIGO_PAIS_PE}</cbc:IdentificationCode><cbc:Name code="${CODIGO_PAIS_NUMERICO_PE}">Peru</cbc:Name></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escaparXml(empresa.razonSocial)}</cbc:RegistrationName>
        <cac:RegistrationAddress><cbc:ID>${escaparXml(empresa.ubigeo)}</cbc:ID></cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="${codigoTipoDocumento(cliente.tipoDoc)}">${escaparXml(cliente.numero)}</cbc:ID></cac:PartyIdentification>
      <cac:PartyLegalEntity><cbc:RegistrationName>${escaparXml(cliente.nombre)}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${MONEDA_PEN}">${fmt(datos.totalIgv)}</cbc:TaxAmount>${taxSubtotales.join('')}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${MONEDA_PEN}">${fmt(subtotalLineas)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${MONEDA_PEN}">${fmt(baseImponibleTotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${MONEDA_PEN}">${fmt(datos.total)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${MONEDA_PEN}">${fmt(datos.descuentoGlobal)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${MONEDA_PEN}">${fmt(datos.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lineasXml}
</Invoice>`;
}
