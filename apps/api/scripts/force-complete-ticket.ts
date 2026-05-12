import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const id = process.argv[2];
p.ticket.update({where:{id},data:{status:'COMPLETED' as 'COMPLETED'}}).then((r: { id: string; status: string }) => { console.log('updated', r.id, r.status); }).finally(() => p.$disconnect());
