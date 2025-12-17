#!/usr/bin/env node

/**
 * WhatsApp Login Script
 * 
 * Run this directly on the server to log in to WhatsApp Web
 * Opens a headful Chrome window for QR scanning
 * 
 * Usage:
 *   node scripts/whatsapp-login.js
 * 
 * Requirements on Linux server:
 *   - X11 display (VNC, X11 forwarding, or local desktop)
 *   - Set DISPLAY=:0 or use SSH with -X flag
 */

const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function login() {
    console.log("🔐 WhatsApp Login Script\n");
    
    // Session directory - same as the bot uses
    const sessionDir = process.env.WWEB_SESSION_PATH || path.join(os.homedir(), '.wweb_session');
    console.log(`📁 Session will be saved to: ${sessionDir}`);
    
    // Create session directory if it doesn't exist
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
        console.log("   Created session directory");
    }
    
    // Check for DISPLAY
    if (!process.env.DISPLAY) {
        console.log("\n⚠️  WARNING: DISPLAY is not set!");
        console.log("   Try: export DISPLAY=:0");
        console.log("   Or use SSH with X forwarding: ssh -X user@server");
        console.log("   Or use VNC to connect to the server desktop\n");
    }
    
    console.log("\n🚀 Launching Chrome in headful mode...\n");
    
    const browser = await puppeteer.launch({
        headless: false,  // HEADFUL - shows actual window
        userDataDir: sessionDir,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--start-maximized',
        ],
        defaultViewport: null,  // Use full window size
    });
    
    const page = await browser.newPage();
    
    console.log("📱 Opening WhatsApp Web...");
    console.log("   Scan the QR code with your phone\n");
    
    await page.goto('https://web.whatsapp.com', {
        waitUntil: 'networkidle2',
        timeout: 120000,
    });
    
    console.log("⏳ Waiting for login...");
    console.log("   (This window will close automatically after successful login)\n");
    
    // Wait for login - detect the chat list
    try {
        await page.waitForSelector('[data-testid="chat-list"], #side, [data-testid="chatlist-header"]', {
            timeout: 300000,  // 5 minutes to scan QR
        });
        
        console.log("✅ Login successful!");
        console.log(`   Session saved to: ${sessionDir}\n`);
        
        // Wait a bit to ensure session is fully saved
        await new Promise(r => setTimeout(r, 3000));
        
    } catch (error) {
        console.log("❌ Login timed out or failed");
        console.log("   Please try again\n");
    }
    
    await browser.close();
    console.log("👋 Done! You can now run the bot.\n");
}

login().catch(console.error);
