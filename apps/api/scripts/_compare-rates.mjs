import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rules = await p.pricingRule.findMany({orderBy:[{flow:'asc'},{courtLevel:'asc'},{region:'asc'},{yearBand:'asc'},{setType:'asc'}]});
for (const r of rules) {
  console.log(JSON.stringify({flow:r.flow,courtLevel:r.courtLevel,region:r.region,caseStatus:r.caseStatus,yearBand:r.yearBand,setType:r.setType,basePrice:Number(r.basePrice),pdfSurcharge:Number(r.pdfSurchargeAmount ?? 0),deliveryGuyFee:Number(r.deliveryGuyFee ?? 0),deliveryCharge:Number(r.deliveryCharge ?? 0),attestedPricePerSet:Number(r.attestedPricePerSet ?? 0),nonAttestedPricePerSet:Number(r.nonAttestedPricePerSet ?? 0),availability:r.availability,isLegacy:r.isLegacy,isActive:r.isActive,priority:r.priority}));
}
await p.$disconnect();
