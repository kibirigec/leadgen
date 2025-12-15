export async function sendWhatsAppTemplate(to: string, templateName: string, languageCode: string = "en_US") {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneId) {
        throw new Error("Missing WhatsApp configuration");
    }

    const url = `https://graph.facebook.com/v17.0/${phoneId}/messages`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            to: to,
            type: "template",
            template: {
                name: templateName,
                language: {
                    code: languageCode,
                },
            },
        }),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`WhatsApp API Error: ${JSON.stringify(error)}`);
    }

    return await response.json();
}
