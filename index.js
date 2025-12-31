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

// 🛡️ IMPROVED: Helius Fetcher with DEBUG LOGGING
async function fetchImageFromHelius(mint) {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!mint) { console.log("⚠️ Helius Fetch Skipped: No Mint Address"); return null; }
    if (!apiKey) { console.log("⚠️ Helius Fetch Skipped: Missing API KEY"); return null; }

    try {
        console.log(`🔄 asking Helius for asset: ${mint}`);
        const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
        const response = await axios.post(url, {
            jsonrpc: '2.0',
            id: 'hiney-bot',
            method: 'getAsset',
            params: { id: mint }
        });

        // 🔍 LOGGING THE RESULT
        if (response.data.result && response.data.result.content && response.data.result.content.links) {
            const img = response.data.result.content.links.image;
            console.log(`✅ Helius FOUND image: ${img}`);
            return img;
        } else {
            console.log(`⚠️ Helius response valid but NO image found. Full response result:`, JSON.stringify(response.data.result?.content || "No Content"));
        }
    } catch (e) {
        console.log("❌ Helius Fetch ERROR:", e.message);
        if (e.response) console.log("Error Details:", e.response.data);
    }
    return null;
}

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
            // 🎬 VIDEO LOGIC (Only if image is STILL missing)
            if (image === "LOCAL_VIDEO_MODE") {
                if (fs.existsSync('./video.MP4')) {
                    await bot.telegram.sendVideo(chatId, { source: './video.MP4' }, {
                        caption: message,
                        parse_mode: 'Markdown'
                    });
                    console.log(`📹 Sent Local Video to ${chatId}`);
                } else {
                    console.error("❌ Error: video.MP4 not found on server!");
                }
            } 
            // 🖼️ NORMAL PHOTO LOGIC
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
        ...Markup.inlineKeyboard([[Markup.button.url("Open Hiney App 🍑", DIRECT_LINK)]]) 
    });
});

bot.command('meme', async (ctx) => { await replyWithMeme(ctx, "🍑 <b>Fresh Hiney Meme!</b>"); });

bot.command('price', async (ctx) => {
  const [hiney, sol] = await Promise.all([getTokenPrice(HINEY_ADDRESS), getTokenPrice(SOL_ADDRESS)]);
  let msg = '📊 <b>Market Snapshot</b>\n\n';
  if (hiney) msg += `🍑 <b>$HINEY:</b> $${hiney.price} (${hiney.change}%)\n`;
  if (sol)   msg += `☀️ <b>$SOL:</b> $${sol.price} (${sol.change}%)`;
  await replyWithMeme(ctx, msg);
});

bot.command('hiney', async (ctx) => {
  const hiney = await getTokenPrice(HINEY_ADDRESS);
  if (hiney) await replyWithMeme(ctx, `🍑 <b>$HINEY Price:</b> $${hiney.price} \n📈 <b>24h Change:</b> ${hiney.change}%`);
  else ctx.reply("❌ Could not fetch Hiney price.");
});

bot.command('sol', async (ctx) => {
  const sol = await getTokenPrice(SOL_ADDRESS);
  if (sol) await replyWithMeme(ctx, `☀️ <b>$SOL Price:</b> $${sol.price} \n📈 <b>24h Change:</b> ${sol.change}%`);
  else ctx.reply("❌ Could not fetch SOL price.");
});

bot.command('floor', async (ctx) => {
  const nftData = await getNFTFloorPrice(HINEY_NFT_SYMBOL);
  if (!nftData) return ctx.reply("❌ NFT Data Unavailable.");
  const msg = `🍑 <b>The Hiney-kin Stats</b>\n\n🧱 <b>Floor:</b> ${nftData.floor} SOL\n📦 <b>Listed:</b> ${nftData.listed}\n<a href="https://magiceden.io/marketplace/${HINEY_NFT_SYMBOL}">View on Magic Eden</a>`;
  await replyWithMeme(ctx, msg);
});

// --- 5. SERVER & WEBHOOK ---
const port = process.env.PORT || 3000;
app.get('/', (req, res) => { 
    console.log("💓 Ping! Staying alive..."); 
    res.send('Hineycoinbot is Alive'); 
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  console.log("📥 Webhook Hit! (Processing in background)");
  
  let events = req.body;
  if (!Array.isArray(events)) { events = [events]; }
  if (!events || events.length === 0) return; 

  for (const event of events) {
    console.log(`🔎 Processing Event: ${event.type}`);

    // --- A. METADATA LOGIC ---
    let nftName = "Hiney-Kin (Unknown)";
    let imageUrl = "LOCAL_VIDEO_MODE"; // Default to Detective Video
    let mintAddress = null;

    if (event.nft) mintAddress = event.nft.mint;
    else if (event.nfts && event.nfts.length > 0) mintAddress = event.nfts[0].mint;
    else if (event.accountData && event.accountData.length > 0) mintAddress = event.accountData[0].account;

    // 1. Try to get NAME from your JSON file
    if (mintAddress && nftLookup[mintAddress]) {
        if (typeof nftLookup[mintAddress] === 'string') {
            nftName = nftLookup[mintAddress];
        } else if (nftLookup[mintAddress].name) {
            nftName = nftLookup[mintAddress].name;
            if (nftLookup[mintAddress].image) imageUrl = nftLookup[mintAddress].image;
        }
    } else {
        if (event.nft && event.nft.name) nftName = event.nft.name;
    }

    // 2. Try to get IMAGE from the webhook event
    if (imageUrl === "LOCAL_VIDEO_MODE") {
        if (event.nft && event.nft.metadata && event.nft.metadata.image) {
            imageUrl = event.nft.metadata.image;
        }
        else if (event.nfts && event.nfts.length > 0 && event.nfts[0].metadata && event.nfts[0].metadata.image) {
             imageUrl = event.nfts[0].metadata.image;
        }
    }

    // 🛡️ 3. SAFETY NET: If Image is STILL missing, ask Helius!
    if (imageUrl === "LOCAL_VIDEO_MODE" && mintAddress) {
        console.log(`⚠️ Image missing in Webhook. Asking Helius for ${mintAddress}...`);
        
        // 🚨 LOGGING FOR DEBUGGING
        const backupImage = await fetchImageFromHelius(mintAddress);
        if (backupImage) {
            imageUrl = backupImage;
        } else {
            console.log("❌ Helius also failed to find an image.");
        }
    }

    // --- B. PRICE ---
    let price = 0;
    if (event.amount) {
        price = event.amount / 1_000_000_000;
    } else if (event.nativeTransfers && event.nativeTransfers.length > 0) {
        const total = event.nativeTransfers.reduce((acc, tx) => acc + tx.amount, 0);
        price = total / 1_000_000_000;
    }

    // --- C. FILTER ---
    if (price < MIN_SALE_PRICE) {
        console.log(`⚠️ Price too low (${price} SOL). Skipping.`);
        continue;
    }
    
    console.log(`💰 VALID SALE: ${price} SOL - ${nftName}`);
    
    // 🔍 FINAL CHECK LOG BEFORE TWITTER
    console.log(`🖼️ FINAL IMAGE URL to Post: ${imageUrl}`);

    // 1. Telegram
    await postSaleToTelegram(nftName, price, imageUrl, event.signature);

    // 2. Twitter (Safe Mode)
    if (twitterClient) {
        try {
            const twitterText = `🚨 HINEY-KIN ADOPTED! \n\n🖼️ ${nftName} just sold for ${price.toFixed(4)} SOL!\n#Solana $HINEY`;
            
            if (imageUrl === "LOCAL_VIDEO_MODE" || imageUrl.toLowerCase().endsWith('.mp4')) {
                // Upload local "bot.jpg" directly from disk
                console.log("ℹ️ Using Fallback LOCAL Image (bot.jpg)");
                if (fs.existsSync('./bot.jpg')) {
                    const mediaId = await twitterClient.v1.uploadMedia('./bot.jpg');
                    await twitterClient.v2.tweet({ 
                        text: `${twitterText}\n🔗 https://solscan.io/tx/${event.signature}`, 
                        media: { media_ids: [mediaId] } 
                    });
                    console.log(`✅ Posted to X (Local Image)`);
                } else { console.error("❌ Error: bot.jpg not found on server!"); }
            } else {
                // Logic for real NFT images
                console.log("ℹ️ Attempting to download Web Image...");
                const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Chrome/110' } });
                const mediaId = await twitterClient.v1.uploadMedia(Buffer.from(imgRes.data), { mimeType: 'image/png' });
                await twitterClient.v2.tweet({ 
                    text: `${twitterText}\n🔗 https://solscan.io/tx/${event.signature}`, 
                    media: { media_ids: [mediaId] } 
                });
                console.log(`✅ Posted to X (Web Image)`);
            }
        } catch (e) { 
            console.error(`❌ Twitter Fail: ${e.message}`); 
            if (e.data) console.error("Twitter Error Details:", JSON.stringify(e.data));
        }
    }
  }
});

app.listen(port, '0.0.0.0', async () => { 
  console.log(`🌐 Port ${port}`);
  try { await bot.telegram.deleteWebhook({ drop_pending_updates: true }); bot.launch(); } 
  catch (e) { console.error(e); }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));