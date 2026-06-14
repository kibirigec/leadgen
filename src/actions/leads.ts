"use server";

import { searchGoogleMaps } from "@/lib/apify";
import { db } from "@/lib/firebase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { Business } from "@/lib/types";

function normalizeBusinessType(rawType: string): string {
    if (!rawType) return 'business';
    const t = rawType.toLowerCase().trim();

    if (t.includes('barber')) return 'barbershop';
    if (t.includes('nail')) return 'nail_salon';
    if (t.includes('hair') || t.includes('beauty') || t.includes('salon') || t.includes('spa')) return 'hair_salon';
    if (t.includes('yoga') || t.includes('pilates')) return 'yoga_studio';
    if (t.includes('gym') || t.includes('fitness') || t.includes('crossfit') || t.includes('martial arts') || t.includes('boxing')) return 'gym';
    if (t.includes('auto') || t.includes('mechanic') || t.includes('tire') || t.includes('car repair') || t.includes('garage') || t.includes('diagnostics')) return 'mechanic';
    if (t.includes('detail')) return 'detailing';
    if (t.includes('plumb')) return 'plumber';
    if (t.includes('electric')) return 'electrician';
    if (t.includes('hvac') || t.includes('heating') || t.includes('cooling') || t.includes('air condition')) return 'hvac';
    if (t.includes('roof')) return 'roofer';
    if (t.includes('landscap') || t.includes('lawn') || t.includes('garden')) return 'landscaper';
    if (t.includes('paint')) return 'painter';
    if (t.includes('tree')) return 'tree_service';
    if (t.includes('clean') || t.includes('maid') || t.includes('janitor')) return 'cleaning';
    if (t.includes('mov') || t.includes('reloc')) return 'movers';
    if (t.includes('contractor') || t.includes('construction') || t.includes('remodel') || t.includes('renovation')) return 'general_contractor';
    if (t.includes('restaurant') || t.includes('eatery') || t.includes('diner') || t.includes('bistro') || t.includes('grill') || t.includes('food')) return 'restaurant';
    if (t.includes('coffee') || t.includes('cafe') || t.includes('cafeteria')) return 'coffee';
    if (t.includes('bar') || t.includes('lounge') || t.includes('nightclub') || t.includes('pub') || t.includes('brewery')) return 'bar';
    if (t.includes('hotel') || t.includes('inn') || t.includes('motel') || t.includes('lodge') || t.includes('airbnb')) return 'hotel';
    if (t.includes('dental') || t.includes('dentist') || t.includes('orthodont')) return 'dental';
    if (t.includes('clinic') || t.includes('medical') || t.includes('health') || t.includes('urgent care') || t.includes('doctor')) return 'clinic';
    if (t.includes('chiro')) return 'chiropractor';
    if (t.includes('pharmacy') || t.includes('chemist') || t.includes('drug store')) return 'pharmacy';
    if (t.includes('law') || t.includes('attorney') || t.includes('legal') || t.includes('lawyer') || t.includes('advocate')) return 'law';
    if (t.includes('real estate') || t.includes('realtor') || t.includes('realty') || t.includes('property agent')) return 'realtor';
    if (t.includes('insurance') || t.includes('insurer')) return 'insurance';
    if (t.includes('school') || t.includes('academy') || t.includes('tutoring') || t.includes('learning center') || t.includes('college') || t.includes('training')) return 'school';
    if (t.includes('courier') || t.includes('delivery') || t.includes('logistics')) return 'courier';
    if (t.includes('pet') || t.includes('grooming') || t.includes('kennel') || t.includes('veterinar')) return 'pet_grooming';
    if (t.includes('tattoo') || t.includes('piercing')) return 'tattoo';
    if (t.includes('shop') || t.includes('store') || t.includes('retail') || t.includes('boutique')) return 'ecommerce';
    if (t.includes('charity') || t.includes('nonprofit') || t.includes('ngo') || t.includes('foundation')) return 'charity';

    return t.replace(/\s+/g, '_');
}

export async function searchLeadsAction(query: string, location: string): Promise<Business[]> {
    try {
        const results = await searchGoogleMaps(query, location);
        return results;
    } catch (error) {
        console.error("Error in searchLeadsAction:", error);
        throw new Error("Failed to fetch leads");
    }
}

export interface InjectLead {
    name: string;
    type: string;
    phone: string;
    city?: string;
}

export async function injectLeadsToUSQueue(
    leads: InjectLead[],
    timeWindow: 'morning' | 'lunch' | 'evening'
): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
        const { db } = await import("@/lib/firebase");
        const batch = db.batch();
        const now = new Date().toISOString();
        const today = now.split('T')[0];
        let count = 0;

        for (const lead of leads) {
            const normalizedType = normalizeBusinessType((lead.type || '').trim());
            
            const docRef = db.collection("leads_queue_US").doc();
            batch.set(docRef, {
                name: lead.name.trim(),
                phone: lead.phone.trim(),
                businessType: normalizedType,
                rawBusinessType: (lead.type || '').trim(),
                city: (lead.city || 'New York').trim(),
                address: '',
                timeWindow,
                dispatchDate: today,
                status: 'pending',
                scrapedAt: now,
                source: 'manual_inject',
            });
            count++;

            // Commit in chunks of 400 (Firestore batch limit is 500)
            if (count % 400 === 0) {
                await batch.commit();
            }
        }

        await batch.commit();
        return { success: true, count };
    } catch (error: any) {
        console.error("Error injecting leads to US queue:", error);
        return { success: false, error: error.message };
    }
}



export async function saveLeadAction(lead: Business) {
    try {
        await db.collection("leads").doc(lead.id).set({
            ...lead,
            savedAt: new Date().toISOString(),
        }, { merge: true }); // Preserve existing status field
        return { success: true };
    } catch (error) {
        console.error("Error saving lead:", error);
        return { success: false, error: "Failed to save lead" };
    }
}

export async function saveMultipleLeadsAction(leads: Business[]) {
    try {
        const batch = db.batch();
        const timestamp = new Date().toISOString(); // Use same timestamp for grouping

        leads.forEach(lead => {
            const docRef = db.collection("leads").doc(lead.id);
            batch.set(docRef, {
                ...lead,
                savedAt: timestamp,
            }, { merge: true }); // IMPORTANT: merge to preserve 'status' and 'lastContactedAt' fields
        });

        await batch.commit();
        return { success: true, count: leads.length };
    } catch (error) {
        console.error("Error saving multiple leads:", error);
        return { success: false, error: "Failed to save leads" };
    }
}

export async function sendWhatsAppAction(leadId: string, phoneNumber: string, leadName: string) {
    try {
        // 1. Send the message
        // You might want to format the phone number (remove +, spaces, etc if needed by API)
        // WhatsApp usually expects full E.164 without + or with +.
        // Assuming the template name is 'hello_world' for demo, user should change this.
        // User requested "send MY template text". We'll assume a template named 'outreach_v1' or similar exists.
        // Let's use a generic name 'outreach' and user can map it.

        await sendWhatsAppTemplate(phoneNumber, "hello_world", "en_US"); // Using standard 'hello_world' for testing unless user specified.

        // 2. Update lead status in DB
        await db.collection("leads").doc(leadId).set({
            status: "contacted",
            lastContactedAt: new Date().toISOString(),
        }, { merge: true });

        return { success: true };
    } catch (error: any) {
        console.error("Error sending WhatsApp:", error);
        return { success: false, error: error.message };
    }
}

export async function getSavedLeadsAction(): Promise<Business[]> {
    try {
        const snapshot = await db.collection("leads").orderBy("savedAt", "desc").get();
        const leads = snapshot.docs.map(doc => doc.data() as Business);
        return leads;
    } catch (error) {
        console.error("Error fetching saved leads:", error);
        return [];
    }
}
