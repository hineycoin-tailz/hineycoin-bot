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
const MIN_SALE_PRICE = 0.01; 

// 🔗 DIRECT APP LINK (Works in Groups!)
// Ensure you named your app 'app' in BotFather. If not, use 'https://t.me/Hineycoinbot'
const DIRECT_LINK = 'https://t.me/Hineycoinbot/app'; 
const WEB_APP_URL = 'https://hiney-miniapp-jivkkyha7-hineycoin-tailzs-projects.vercel.app/';

// --- 2. SETUP ---
if (!process.env.TELEGRAM_CHAT_IDS && !process.env.TELEGRAM_CHAT_ID) {
    console.error("❌ CRITICAL: TELEGRAM_CHAT_IDS is missing!");
    process.exit(1);
}

const app = express();
app.use(express.json()); 
const bot = new Telegraf(process.env.BOT_TOKEN);
const twitterClient = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

// --- 3. HELPER FUNCTIONS ---

// A. Get Token Price
async function getTokenPrice(address) {
  try {
    const url = 'https://api.dexscreener.com/latest/dex/tokens/' + address;
    const response = await axios.get(url, { timeout: 10000 }); 
    if (!response.data?.pairs?.[0]) return null;
    const pair = response.data.pairs[0];
    return { price: pair.priceUsd, change: pair.priceChange.h24, symbol: pair.baseToken.symbol };
  } catch (error) { return null; }
}

// B. Get NFT Floor
async function getNFTFloorPrice(symbol) {
  try {
    const url = `https://api-mainnet.magiceden.dev/v2/collections/${symbol}/stats`;
    const response = await axios.get(url, { timeout: 5000 });
    const floorInSol = response.data.floorPrice / 1000000000;
    return { floor: floorInSol.toFixed(2), listed: response.data.listedCount };
  } catch (error) { return null; }
}

// C. Smart Responder (Sends Text + Random Meme)
async function replyWithMeme(ctx, captionText) {
  try {
    let memeFolder = path.join(__dirname, 'memes');
    if (!fs.existsSync(memeFolder)) memeFolder = path.join(__dirname, 'Memes');
    
    if (fs.existsSync(memeFolder)) {
      const files = fs.readdirSync(memeFolder);
      const validFiles = files.filter(file => ['.jpg', '.jpeg', '.png', '.gif', '.mp4'].includes(path.extname(file).toLowerCase()));
      
      console.log(`📂 Meme Check: Found ${validFiles.length} images`); 

      if (validFiles.length > 0) {
        const randomFile = validFiles[Math.floor(Math.random() * validFiles.length)];
        const filePath = path.join(memeFolder, randomFile);
        const ext = path.extname(randomFile).toLowerCase();
        
        const fileSource = { source: filePath };
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
    // Uses DIRECT_LINK so it works in groups too
    ctx.reply("🍑 **Welcome to HineyCoin!**\n\nClick below to open the Hiney App or use /price to see stats.", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.url("🚀 Launch Hiney App", DIRECT_LINK)]
        ])
    });
});

bot.command('launch', (ctx) => {
    // Uses DIRECT_LINK so it works in groups too
    ctx.reply("🚀 Click to Launch:", { 
        ...Markup.inlineKeyboard([
            [Markup.button.url("Open Hiney App 🍑", DIRECT_LINK)]
        ]) 
    });
});

bot.command('meme', async (ctx) => {
    await replyWithMeme(ctx, "🍑 <b>Fresh Hiney Meme!</b>");
});

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

// --- 5. SERVER ---
const port = process.env.PORT || 3000;
app.get('/', (req, res) => { res.send('Hineycoinbot is Alive'); });

app.post('/webhook', async (req, res) => {
  const events = req.body;
  if (!events || !Array.isArray(events)) return res.sendStatus(400);

  for (const event of events) {
    if (event.type === 'NFT_SALE') {
      const price = event.amount / 1_000_000_000;
      if (price < MIN_SALE_PRICE) continue;
      const nftMint = event.nfts[0].mint;
      const nftName = event.nfts[0].name || "Hiney-Kin";
      const imageUrl = event.nfts[0].metadata?.image || "https://hineycoin.online/logo.png";
      
      const caption = `🚨 <b>HINEY-KIN ADOPTED!</b> 🚨\n\n` +
                      `🖼️ <b>${nftName}</b>\n💰 Sold for: <b>${price} SOL</b>\n` +
                      `<a href="https://magiceden.io/item-details/${nftMint}">View on Magic Eden</a>`;

      const rawIds = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID;
      for (const chatId of rawIds.split(',')) {
          try { await bot.telegram.sendPhoto(chatId.trim(), imageUrl, { caption: caption, parse_mode: 'HTML' }); } 
          catch (e) { console.error(`❌ TG Fail: ${e.message}`); }
      }
      
      try {
        const twitterText = `🚨 HINEY-KIN ADOPTED! \n\n🖼️ ${nftName} just sold for ${price} SOL!\n#Solana $HINEY`;
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Chrome/110' } });
        const mediaId = await twitterClient.v1.uploadMedia(Buffer.from(imgRes.data), { mimeType: 'image/png' });
        await twitterClient.v2.tweet({ text: `${twitterText}\n🔗 https://magiceden.io/item-details/${nftMint}`, media: { media_ids: [mediaId] } });
      } catch (e) { console.error(`❌ Twitter Fail: ${e.message}`); }
    }
  }
  res.sendStatus(200);
});

app.listen(port, '0.0.0.0', async () => { 
  console.log(`🌐 Port ${port}`);
  try { await bot.telegram.deleteWebhook({ drop_pending_updates: true }); bot.launch(); } 
  catch (e) { console.error(e); }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));