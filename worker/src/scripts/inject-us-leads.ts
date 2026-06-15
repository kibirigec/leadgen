import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { getDb, initializeFirebase } from '../firebase';

const leads = [
  { "name": "Crane yoga studio", "type": "Yoga studio", "phone": "+17186780999" },
  { "name": "Better Cut Barber Shop", "type": "Barber shop", "phone": "+13474276537" },
  { "name": "Cali's Auto Repair & Diagnostics", "type": "Auto repair shop", "phone": "+13478148878" },
  { "name": "Andry Mobile Mechanic", "type": "Mechanic", "phone": "+16463417122" },
  { "name": "Duran Nails & Spa Salon", "type": "Nail salon", "phone": "+16465741060" },
  { "name": "FASHION NAILS SPA & HAIR SALON", "type": "Nail salon", "phone": "+13473440537" },
  { "name": "tono barbershop", "type": "Barber shop", "phone": "+19176735799" },
  { "name": "NailzByLisette", "type": "Nail salon", "phone": "+13475530734" },
  { "name": "Ro barbershop", "type": "Barber shop", "phone": "+13474789368" },
  { "name": "Enchanted nail salon", "type": "Nail salon", "phone": "+16468301078" },
  { "name": "Bonny Nails Salon", "type": "Nail salon", "phone": "+19296620581" },
  { "name": "Plumbing emergency service 24 7", "type": "Plumber", "phone": "+19176037751" },
  { "name": "Figs Barber Shop", "type": "Barber shop", "phone": "+16463997249" },
  { "name": "New York Cuts BarberShop", "type": "Barber shop", "phone": "+19173010264" },
  { "name": "Milciades Barbershop", "type": "Barber shop", "phone": "+13475932520" },
  { "name": "N Z Pilgrim Electric Inc", "type": "Electrician", "phone": "+12124277300" },
  { "name": "Upstage Beauty Bar", "type": "Hair salon", "phone": "+13474955157" },
  { "name": "D'johanny Beauty Salon", "type": "Beauty salon", "phone": "+13474317388" },
  { "name": "Beauty Garden Salon NYC", "type": "Hair replacement service", "phone": "+13475167433" },
  { "name": "M Lugo Flat Fix", "type": "Tire repair shop", "phone": "+12128316547" },
  { "name": "Ostreni Barber Shop", "type": "Barber shop", "phone": "+16462861824" }
];

const typeMap: Record<string, string> = {
    "Yoga studio": "gym",
    "Barber shop": "salon",
    "Auto repair shop": "mechanic",
    "Mechanic": "mechanic",
    "Nail salon": "salon",
    "Plumber": "plumber",
    "Electrician": "electrician",
    "Hair salon": "salon",
    "Beauty salon": "salon",
    "Hair replacement service": "salon",
    "Tire repair shop": "mechanic"
};

async function injectLeads() {
    await initializeFirebase();
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`Clearing old manual injections...`);
    const oldDocs = await db.collection('leads_queue_US').where('source', '==', 'manual_inject').get();
    for (const doc of oldDocs.docs) {
        await doc.ref.delete();
    }
    
    console.log(`Injecting ${leads.length} leads into leads_queue_US...`);
    let count = 0;
    
    for (const lead of leads) {
        const mappedType = typeMap[lead.type] || 'mechanic'; // default to mechanic if unknown
        await db.collection('leads_queue_US').add({
            name: lead.name,
            phone: lead.phone,
            businessType: mappedType,
            timeWindow: 'morning',
            priority: 50,
            status: 'pending',
            dispatchDate: today,
            market: 'US',
            source: 'manual_inject',
            createdAt: new Date().toISOString(),
        });
        count++;
    }
    
    console.log(`✅ Successfully injected ${count} leads with corrected business types!`);
    process.exit(0);
}

injectLeads().catch(console.error);
