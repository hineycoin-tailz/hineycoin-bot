// --- LOAD LOCAL METADATA ---
let nftLookup = {};
try {
    nftLookup = require('./hiney_data.json');
    console.log(`✅ Loaded Metadata for ${Object.keys(nftLookup).length} Hiney-Kins`);
} catch (e) {
    console.log("⚠️ hiney_data.json not found (Using fallback mode)");
}

require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');

// --- 1. CONFIGURATION ---
const HINEY_NFT_SYMBOL = 'hiney_kin'; 
const HINEY_ADDRESS = 'DDAjZFshfVvdRew1LjYSPMB3mgDD9vSW74eQouaJnray';
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

// ✅ CORRECT: This uses the simple lowercase video name
const GENERIC_IMAGE = "https://raw.githubusercontent.com/tailzmetax/Hineycoinbot/main/video.mp4"; 

// 🚨 PRICE FILTER: Set to 0.001 to see your test sales
const MIN_SALE_PRICE = 0.035; 
const DIRECT_LINK = 'https://t.me/Hineycoinbot/app'; 

// --- 2. SETUP ---
if (!process.env.TELEGRAM_CHAT_IDS && !process.env.TELEGRAM_CHAT_ID) {
    console.error("❌ CRITICAL: TELEGRAM_CHAT_IDS is missing!");
    process.exit(1);
}

const app = express();
app.use(express.json()); 
const bot = new Telegraf(process.env.BOT_TOKEN);

// Twitter Setup
let twitterClient = null;
try {
    twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_API_KEY,
        appSecret: process.env.TWITTER_API_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_SECRET,
    });
} catch (e) { console.log("⚠️ Twitter keys missing, skipping Twitter setup."); }


// --- 3. HELPER FUNCTIONS ---

async function postSaleToTelegram(nftName, price, image, signature) {
    const message = `
🚨 *HINEY-KIN ADOPTED!* 🚨

🍑 *Asset:* ${nftName}
💰 *Price:* ${price.toFixed(4)} SOL
🔗 [View Transaction](https://solscan.io/tx/${signature}) | [Open Hiney App](${DIRECT_LINK})
`;

    const rawIds = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID;
    const chatIds = rawIds.split(',').map(id => id.trim());

    for (const chatId of chatIds) {
        try {
            // Check for Video (Ends in .mp4 or .MP4)
            if (image.toLowerCase().endsWith('.mp4')) {
                await bot.telegram.sendVideo(chatId, image, {
                    caption: message,
                    parse_mode: 'Markdown'
                });
                console.log(`📹 Sent Video to ${chatId}`);
            } 
            else {
                await bot.telegram.sendPhoto(chatId, image, {
                    caption: message,
                    parse_mode: 'Markdown'
                });
                console.log(`📸 Sent Photo to ${chatId}`);
            }
        } catch (error) {
            console.error(`❌ TG Error for ${chatId}:`, error.message);
        }
    }
}

async function getTokenPrice(address) {
  try {
    const url = 'https://api.dexscreener.com/latest/dex/tokens/' + address;
    const response = await axios.get(url, { timeout: 10000 }); 
    if (!response.data?.pairs?.[0]) return null;
    const pair = response.data.pairs[0];
    return { price: pair.priceUsd, change: pair.priceChange.h24, symbol: pair.baseToken.symbol };
  } catch (error) { return null; }
}

async function getNFTFloorPrice(symbol) {
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/collections/${symbol}/stats`;
    const response = await axios.get(url, { timeout: 5000 });
    const floorInSol = response.data.floorPrice / 1000000000;
    return { floor: floorInSol.toFixed(2), listed: response.data.listedCount };
  } catch (error) { return null; }
}

async function replyWithMeme(ctx, captionText) {
  try {
    let memeFolder = path.join(__dirname, 'memes');
    if (!fs.existsSync(memeFolder)) memeFolder = path.join(__dirname, 'Memes');
    if (fs.existsSync(memeFolder)) {
      const files = fs.readdirSync(memeFolder);
      const validFiles = files.filter(file => ['.jpg', '.jpeg', '.png', '.gif', '.mp4'].includes(path.extname(file).toLowerCase()));
      if (validFiles.length > 0) {
        const randomFile = validFiles[Math.floor(Math.random() * validFiles.length)];
        const filePath = path.join(memeFolder, randomFile);
        const ext = path.extname(randomFile).toLowerCase();
        const fileSource = { source: fs.createReadStream(filePath) };
        const options = { caption: captionText, parse_mode: 'HTML' };
        if (['.mp4', '.mov'].includes(ext)) await ctx.replyWithVideo(fileSource, options);
        else if (ext === '.gif') await ctx.replyWithAnimation(fileSource, options);
        else await ctx.replyWithPhoto(fileSource, options);
        return; 
      }
    }
  } catch (error) { console.error("❌ Meme Error:", error.message); }
  await ctx.replyWithHTML(captionText);
}

// --- 4. COMMANDS ---
bot.start((ctx) => {
    ctx.reply("🍑 **Welcome to HineyCoin!**\n\nClick below to open the Hiney App or use /price to see stats.", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.url("🚀 Launch Hiney App", DIRECT_LINK)]])
    });
});

bot.command('launch', (ctx) => {
    ctx.reply("🚀 Click to Launch:", { 
        ...Markup.inlineKeyboard([[Markup.button.url("Open Hiney App