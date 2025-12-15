import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createWhatsAppLink(phone: string, businessName: string, location: string): string {
  // Remove any non-digit characters from the phone number
  const cleanPhone = phone.replace(/\D/g, "");

  // Create the default message
  const text = `Hi ✋

I came across ${businessName} on Google — very nice place!

I noticed you don’t have a website, which might be costing you customers who try to find you online.

I help local businesses get a simple site + automated chat that replies to customers after hours and brings in more inquiries.

Would you be open to seeing a free demo made specifically for ${businessName}?

You can also check us out at weblery.com`;

  const encodedText = encodeURIComponent(text);
  return `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
}
