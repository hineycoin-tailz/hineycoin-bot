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

// 🚨 CHECK THIS LINK: It must be the RAW link to your .MP4 video on GitHub
const GENERIC_IMAGE = "https://raw.githubusercontent.com/tailzmetax/Hineycoinbot/main/detective.MP4"; 

// 🚨 PRICE FILTER: Any sale below this amount is IGNORED. Change to 0.001 to see everything.
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

// 🆕 FUNCTION: Handles Video (Telegram) vs Photo (Twitter)
async function postSaleToTelegram(nftName, price, image, signature) {
    const message = `
🚨 *HINEY-KIN ADOPTED!* 🚨

🍑 *Asset:* ${nftName}
💰 *Price:* ${price.toFixed(4)} SOL
🔗 [View Transaction](https://solscan.io/tx/${signature}) | [Open Hiney App](${DIRECT_LINK})
`;

    // Get Chat IDs
    const rawIds = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID;
    const chatIds = rawIds.split(',').map(id => id.trim());

    for (const chatId of chatIds) {
        try {
            // CHECK: Is the image a Video? (Ends in .mp4 or .MP4)
            if (image.toLowerCase().endsWith('.mp4')) {
                await bot.telegram.sendVideo(chatId, image, {
                    caption: message,
                    parse_mode: 'Markdown'
                });
                console.log(`📹 Sent Video to ${chatId}`);
            } 
            // OTHERWISE: It's a standard Photo
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
  res.sendStatus(200); // 🟢 Reply immediately to keep Helius happy

  console.log("📥 Webhook Hit! (Processing in background)");
  const events = req.body;
  if (!events || !Array.isArray(events)) return; 

  for (const event of events) {
    console.log(`🔎 Processing Event: ${event.type}`);

    // --- A. METADATA EXTRACTION ---
    let nftName = "Hiney-Kin (Unknown)";
    let imageUrl = GENERIC_IMAGE; // Start with default (Video)
    let mintAddress = null;

    // 1. Get the Mint Address
    if (event.nft) mintAddress = event.nft.mint;
    else if (event.nfts && event.nfts.length > 0) mintAddress = event.nfts[0].mint;
    else if (event.accountData && event.accountData.length > 0) mintAddress = event.accountData[0].account;

    // 2. INTELLIGENT LOOKUP (File Priority!)
    if (mintAddress && nftLookup[mintAddress]) {
        nftName = nftLookup[mintAddress].name; // Always take name from file
        
        // If file has an image, use it. Otherwise, keep GENERIC_IMAGE (Video)
        if (nftLookup[mintAddress].image) {      
            imageUrl = nftLookup[mintAddress].image;
        }
    } 
    // 3. FALLBACK (Helius) - Only if file lookup failed
    else {
        if (event.nft && event.nft.name) nftName = event.nft.name;
        if (event.nft && event.nft.metadata && event.nft.metadata.image) {
            imageUrl = event.nft.metadata.image;
        }
    }

    // --- B. PRICE CALCULATION ---
    let price = 0;
    if (event.amount) {
        price = event.amount / 1_000_000_000;
    } else if (event.nativeTransfers && event.nativeTransfers.length > 0) {
        const total = event.nativeTransfers.reduce((acc, tx) => acc + tx.amount, 0);
        price = total / 1_000_000_000;
    }

    // --- C. FILTERING ---
    if (price < MIN_SALE_PRICE) {
        console.log(`⚠️ Price too low (${price} SOL). Skipping.`);
        continue;
    }
    
    // --- D. ACTION ---
    console.log(`💰 VALID SALE: ${price} SOL - ${nftName}`);

    // 1. Send to Telegram (Video or Photo)
    await postSaleToTelegram(nftName, price, imageUrl, event.signature);

    // 2. Send to Twitter (Smart Fix)
    if (twitterClient) {
        try {
            const twitterText = `🚨 HINEY-KIN ADOPTED! \n\n🖼️ ${nftName} just sold for ${price.toFixed(4)} SOL!\n#Solana $HINEY`;
            
            // 🛑 TWITTER FIX: If it's a video, SWAP for a static image
            let twitterMediaUrl = imageUrl;
            if (imageUrl.toLowerCase().endsWith('.mp4') || imageUrl.toLowerCase().endsWith('.mov')) {
                // 👇 This is your Silver Robot Image
                twitterMediaUrl = "https://raw.githubusercontent.com/tailzmetax/Hineycoinbot/main/image_44b4c3.jpg"; 
                console.log("⚠️ Video detected. Switching to Static Image for Twitter.");
            }

            const imgRes = await axios.get(twitterMediaUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Chrome/110' } });
            const mediaId = await twitterClient.v1.uploadMedia(Buffer.from(imgRes.data), { mimeType: 'image/png' });
            
            await twitterClient.v2.tweet({ 
                text: `${twitterText}\n🔗 https://solscan.io/tx/${event.signature}`, 
                media: { media_ids: [mediaId] } 
            });
            console.log(`✅ Posted to X`);

        } catch (e) { console.error(`❌ Twitter Fail: ${e.message}`); }
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