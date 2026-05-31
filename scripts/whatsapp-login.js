#!/usr/bin/env node

/**
 * Dual-Market WhatsApp Local Login & VM Sync Script
 * 
 * Run this locally on your Mac to scan QR codes for both accounts (UG and US),
 * then automatically compress and scp them to your Azure VM!
 * 
 * Usage:
 *   node scripts/whatsapp-login.js
 */

const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function runLocalLogin(market, sessionDir) {
    const marketLabel = market === 'US' ? '🇺🇸 United States' : '🇺🇬 Uganda';
    console.log(`\n===========================================`);
    console.log(`🔐 Initiating Login for ${marketLabel}`);
    console.log(`===========================================`);
    console.log(`📁 Session directory: ${sessionDir}`);

    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
        console.log("   Created session directory");
    }

    console.log("\n🚀 Launching local Chrome window. Please be ready to scan...");
    
    // Find Chrome on Mac
    const executablePath = fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : undefined;

    const browser = await puppeteer.launch({
        headless: false, // Must be headful so you can scan the QR code!
        userDataDir: sessionDir,
        executablePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--start-maximized',
        ],
        defaultViewport: null,
    });

    const page = await browser.newPage();
    
    console.log("📱 Navigating to WhatsApp Web...");
    await page.goto('https://web.whatsapp.com', {
        waitUntil: 'networkidle2',
        timeout: 120000,
    });

    console.log("⏳ Waiting up to 5 minutes for scan and login...");
    console.log("👉 SCAN THE QR CODE ON YOUR SCREEN NOW 👈");

    try {
        await page.waitForSelector('[data-testid="chat-list"], #side, [data-testid="chatlist-header"]', {
            timeout: 300000, // 5 minutes
        });
        console.log(`\n✅ Successful Login for ${marketLabel}!`);
        // Let it sync state for 5 seconds
        console.log("⏳ Saving session...");
        await new Promise(r => setTimeout(r, 5000));
    } catch (e) {
        console.log(`\n❌ Login timed out or failed for ${marketLabel}.`);
    }

    await browser.close();
}

async function main() {
    console.log("🌟 WhatsApp Dual-Market Local Login Tool 🌟");
    console.log("=========================================");
    console.log("This script launches Chrome on your Mac to scan QR codes for both");
    console.log("Uganda and US accounts, and then automatically deploys them to your VM.");

    const ugSessionDir = path.join(os.homedir(), '.wweb_session');
    const usSessionDir = path.join(os.homedir(), '.wweb_session_us');

    const mode = await askQuestion("\nWhich account do you want to login to? (ug / us / both): ");
    const parsedMode = mode.trim().toLowerCase();

    if (parsedMode === 'ug' || parsedMode === 'both') {
        await runLocalLogin('UG', ugSessionDir);
    }
    if (parsedMode === 'us' || parsedMode === 'both') {
        await runLocalLogin('US', usSessionDir);
    }

    console.log("\n=========================================");
    console.log("📤 VM Session Deployment");
    console.log("=========================================");
    
    const transfer = await askQuestion("Do you want to deploy these logged-in sessions to your Azure VM? (y/n): ");
    if (transfer.trim().toLowerCase() === 'y') {
        const vmIp = "20.255.155.152";
        const vmUser = "azureuser";
        const keyPath = path.join(os.homedir(), '.ssh', 'id_rsa');
        const archiveName = "wweb_sessions.tar.gz";
        const localArchive = path.join(os.tmpdir(), archiveName);

        try {
            console.log("\n📦 Archiving local sessions...");
            
            // Build the tar command based on what directories exist
            const home = os.homedir();
            let targets = [];
            if (fs.existsSync(ugSessionDir)) targets.push('.wweb_session');
            if (fs.existsSync(usSessionDir)) targets.push('.wweb_session_us');

            if (targets.length === 0) {
                console.log("❌ No sessions found to deploy.");
                rl.close();
                return;
            }

            // Create local archive with smart exclusions (keeps size tiny under 10MB by dropping heavy Chrome caches!)
            const excludeFlags = [
                '--exclude="*/Cache"',
                '--exclude="*/Code Cache"',
                '--exclude="*/GPUCache"',
                '--exclude="*/Crashpad"',
                '--exclude="*/Service Worker/CacheStorage"',
                '--exclude="*/Service Worker/ScriptCache"',
                '--exclude="*/logs"'
            ].join(' ');

            execSync(`tar ${excludeFlags} -czf "${localArchive}" -C "${home}" ${targets.join(' ')}`);
            console.log(`   Created local archive at ${localArchive} (${Math.round(fs.statSync(localArchive).size / 1024 / 1024)}MB)`);

            console.log(`🚀 Uploading to Azure VM (${vmIp})...`);
            execSync(`scp -i "${keyPath}" -o StrictHostKeyChecking=no "${localArchive}" ${vmUser}@${vmIp}:/home/${vmUser}/`);
            console.log("   Upload complete.");

            console.log("🔧 Extracting sessions on remote VM...");
            execSync(`ssh -i "${keyPath}" -o StrictHostKeyChecking=no ${vmUser}@${vmIp} "tar -xzf /home/${vmUser}/${archiveName} -C ~ && rm /home/${vmUser}/${archiveName}"`);
            console.log("🎉 Sessions successfully deployed to the remote VM!");
            console.log("👉 You can now restart your remote VM worker. It will automatically log in!");

            // Clean up local tar
            if (fs.existsSync(localArchive)) {
                fs.unlinkSync(localArchive);
            }
        } catch (err) {
            console.error("\n❌ Deployment failed:", err.message);
        }
    } else {
        console.log("\nSkipped VM deployment. Sessions remain stored locally.");
    }

    rl.close();
}

main().catch(err => {
    console.error(err);
    rl.close();
});
