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

// 🔗 IPFS UNLOCKER (Fixes 'ipfs://' links)
function resolveIpfs(url) {
    if (!url) return null;
    if (url.startsWith('ipfs://')) {
        return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
    return url;
}

// 🧙‍♂️ MAGIC EDEN FALLBACK (Backup Source)
async function fetchImageFromMagicEden(mint) {
    try {
        const url = `https://api-mainnet.magiceden.dev/v2/tokens/${mint}`;
        const response = await axios.get(url, { timeout: 3000 });
        if (response.data && response.data.image) {
            console.log(`✅ Magic Eden Found Image: ${response.data.image}`);
            return response.data.image;
        }
    } catch (e) {
        // ME often 404s on unlisted items, so we just ignore errors silently
    }
    return null;
}

// 🛡️ SUPER FETCHER (Helius + Magic Eden + IPFS Fix)
async function fetchImageFromAnywhere(mint) {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!mint) return null;

    let foundImage = null;

    // TRY 1: HELIUS
    if (apiKey) {
        try {
            console.log(`🔄 Asking Helius for: ${mint}`);
            const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
            const response = await axios.post(url, {
                jsonrpc: '2.0', id: 'hiney-bot', method: 'getAsset', params: { id: mint }
            });

            const result = response.data.result;
            if (result && result.content) {
                if (result.content.links && result.content.links.image) foundImage = result.content.links.image;
                else if (result.content.files && result.content.files.length > 0 && result.content.files[0].uri) foundImage = result.content.files[0].uri;
                else if (result.content.json_uri) {
                     // Deep dig
                     try {
                        const meta = await axios.get(result.content.json_uri);
                        if (meta.data && meta.data.image) foundImage = meta.data.image;
                     } catch (e) { console.log("❌ JSON Dig failed"); }
                }
            }
        } catch (e) { console.log("❌ Helius Fetch Error:", e.message); }
    }

    // TRY 2: MAGIC EDEN (If Helius failed)
    if (!foundImage || foundImage.includes("undefined")) {
        console.log("⚠️ Helius failed. Asking Magic Eden...");
        foundImage = await fetchImageFromMagicEden(mint);
    }

    // FINAL FIX: Resolve IPFS
    return resolveIpfs(foundImage);
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
            if (image === "LOCAL_VIDEO_MODE") {
                if (fs.existsSync('./video.MP4')) {
                    await bot.telegram.sendVideo(chatId, { source: './video.MP4' }, { caption: message, parse_mode: 'Markdown' });
                    console.log(`📹 Sent Local Video to ${chatId}`);
                }
            } else {
                await bot.telegram.sendPhoto(chatId, image, { caption: message, parse_mode: 'Markdown' });
                console.log(`📸 Sent Photo to ${chatId}`);
            }
        } catch (error) { console.error(`❌ TG Error for ${chatId}:`, error.message); }
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
        const fileSource = { source: fs.createReadStream(filePath) };
        const options = { caption: captionText, parse_mode: 'HTML' };
        if (['.mp4', '.mov'].includes(path.extname(randomFile).toLowerCase())) await ctx.replyWithVideo(fileSource, options);
        else await ctx.replyWithPhoto(fileSource, options);
        return; 
      }
    }
  } catch (error) { console.error("❌ Meme Error:", error.message); }
  await ctx.replyWithHTML(captionText);
}

// --- 4. COMMANDS ---
bot.start((ctx) => { ctx.reply("🍑 **Welcome to HineyCoin!**", { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url("🚀 Launch App", DIRECT_LINK)]]) }); });
bot.command('launch', (ctx) => { ctx.reply("🚀 Click to Launch:", { ...Markup.inlineKeyboard([[Markup.button.url("Open Hiney App 🍑", DIRECT_LINK)]]) }); });
bot.command('meme', async (ctx) => { await replyWithMeme(ctx, "🍑 <b>Fresh Hiney Meme!</b>"); });
bot.command('price', async (ctx) => {
  const [hiney, sol] = await Promise.all([getTokenPrice(HINEY_ADDRESS), getTokenPrice(SOL_ADDRESS)]);
  let msg = '📊 <b>Market Snapshot</b>\n\n';
  if (hiney) msg += `🍑 <b>$HINEY:</b> $${hiney.price} (${hiney.change}%)\n`;
  if (sol)   msg += `☀️ <b>$SOL:</b> $${sol.price} (${sol.change}%)`;
  await replyWithMeme(ctx, msg);
});
bot.command('hiney', async (ctx) => { const hiney = await getTokenPrice(HINEY_ADDRESS); if (hiney) await replyWithMeme(ctx, `🍑 <b>$HINEY:</b> $${hiney.price}`); });
bot.command('sol', async (ctx) => { const sol = await getTokenPrice(SOL_ADDRESS); if (sol) await replyWithMeme(ctx, `☀️ <b>$SOL:</b> $${sol.price}`); });
bot.command('floor', async (ctx) => {
  const nftData = await getNFTFloorPrice(HINEY_NFT_SYMBOL);
  if (!nftData) return ctx.reply("❌ NFT Data Unavailable.");
  await replyWithMeme(ctx, `🍑 <b>Hiney-kin Stats</b>\n\n🧱 <b>Floor:</b> ${nftData.floor} SOL\n📦 <b>Listed:</b> ${nftData.listed}`);
});

// --- 5. SERVER & WEBHOOK ---
const port = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Hineycoinbot is Alive'); });

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  console.log("📥 Webhook Hit!");
  
  let events = req.body;
  if (!Array.isArray(events)) { events = [events]; }

  for (const event of events) {
    let nftName = "Hiney-Kin (Unknown)";
    let imageUrl = "LOCAL_VIDEO_MODE"; 
    let mintAddress = null;

    // --- AGGRESSIVE MINT FINDER ---
    if (event.nft && event.nft.mint) mintAddress = event.nft.mint;
    else if (event.nfts && event.nfts.length > 0) mintAddress = event.nfts[0].mint;
    else if (event.tokenTransfers && event.tokenTransfers.length > 0) mintAddress = event.tokenTransfers[0].mint;
    else if (event.accountData && event.accountData.length > 0) mintAddress = event.accountData[0].account;

    console.log(`🔎 Detected Mint: ${mintAddress || "NONE"}`);

    // 1. NAME Lookup
    if (mintAddress && nftLookup[mintAddress]) {
        if (typeof nftLookup[mintAddress] === 'string') nftName = nftLookup[mintAddress];
        else if (nftLookup[mintAddress].name) nftName = nftLookup[mintAddress].name;
    } else if (event.nft && event.nft.name) {
        nftName = event.nft.name;
    }

    // 2. IMAGE Lookup (Webhook)
    if (event.nft && event.nft.metadata && event.nft.metadata.image) imageUrl = event.nft.metadata.image;
    else if (event.nfts && event.nfts.length > 0 && event.nfts[0].metadata && event.nfts[0].metadata.image) imageUrl = event.nfts[0].metadata.image;

    // 3. SAFETY NET (Super Fetcher)
    // If webhook image is missing OR it's an IPFS link we need to fix
    imageUrl = resolveIpfs(imageUrl);
    
    if ((imageUrl === "LOCAL_VIDEO_MODE" || !imageUrl) && mintAddress) {
        console.log(`⚠️ Fetching backup image for ${mintAddress}...`);
        const backupImage = await fetchImageFromAnywhere(mintAddress);
        if (backupImage) imageUrl = backupImage;
    }

    // --- PRICE & FILTER ---
    let price = 0;
    if (event.amount) price = event.amount / 1_000_000_000;
    else if (event.nativeTransfers && event.nativeTransfers.length > 0) {
        price = event.nativeTransfers.reduce((acc, tx) => acc + tx.amount, 0) / 1_000_000_000;
    }

    if (price < MIN_SALE_PRICE) continue;
    
    // --- POSTING ---
    await postSaleToTelegram(nftName, price, imageUrl || "LOCAL_VIDEO_MODE", event.signature);

    if (twitterClient) {
        try {
            const twitterText = `🚨 HINEY-KIN ADOPTED! \n\n🖼️ ${nftName} just sold for ${price.toFixed(4)} SOL!\n#Solana $HINEY`;
            let mediaId;

            if (!imageUrl || imageUrl === "LOCAL_VIDEO_MODE" || !imageUrl.startsWith('http')) {
                if (fs.existsSync('./bot.jpg')) mediaId = await twitterClient.v1.uploadMedia('./bot.jpg');
            } else {
                const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Chrome/110' } });
                mediaId = await twitterClient.v1.uploadMedia(Buffer.from(imgRes.data), { mimeType: 'image/png' });
            }

            if (mediaId) {
                await twitterClient.v2.tweet({ 
                    text: `${twitterText}\n🔗 https://solscan.io/tx/${event.signature}`, 
                    media: { media_ids: [mediaId] } 
                });
                console.log(`✅ Posted to X`);
            }
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