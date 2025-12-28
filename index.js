require('dotenv').config();
const { Telegraf } = require('telegraf');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const express = require('express');

// --- 1. CONFIGURATION ---
const HINEY_NFT_SYMBOL = 'hiney_kin'; 
const HINEY_ADDRESS = 'DDAjZFshfVvdRew1LjYSPMB3mgDD9vSW74eQouaJnray';
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
const MIN_SALE_PRICE = 0.01; 

// --- 2. DEBUG & SETUP ---
console.log("🔍 Checking Environment Variables...");
if (!process.env.TELEGRAM_CHAT_IDS && !process.env.TELEGRAM_CHAT_ID) {
    console.error("❌ CRITICAL ERROR: TELEGRAM_CHAT_IDS is missing!");
    process.exit(1);
}
if (!process.env.BOT_TOKEN) console.error("❌ CRITICAL ERROR: BOT_TOKEN is missing!");

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

// --- 4. COMMANDS ---

// COMMAND: /price (Shows Hiney + Sol)
bot.command('price', async (ctx) => {
  const [hiney, sol] = await Promise.all([getTokenPrice(HINEY_ADDRESS), getTokenPrice(SOL_ADDRESS)]);
  let msg = '📊 <b>Market Snapshot</b>\n\n';
  if (hiney) msg += `🍑 <b>$HINEY:</b> $${hiney.price} (${hiney.change}%)\n`;
  if (sol)   msg += `☀️ <b>$SOL:</b> $${sol.price} (${sol.change}%)`;
  ctx.replyWithHTML(msg);
});

// COMMAND: /hiney (Shows Hiney Only)
bot.command('hiney', async (ctx) => {
  const hiney = await getTokenPrice(HINEY_ADDRESS);
  if (hiney) ctx.replyWithHTML(`🍑 <b>$HINEY Price:</b> $${hiney.price} \n📈 <b>24h Change:</b> ${hiney.change}%`);
  else ctx.reply("❌ Could not fetch Hiney price.");
});

// COMMAND: /sol (Shows Sol Only)
bot.command('sol', async (ctx) => {
  const sol = await getTokenPrice(SOL_ADDRESS);
  if (sol) ctx.replyWithHTML(`☀️ <b>$SOL Price:</b> $${sol.price} \n📈 <b>24h Change:</b> ${sol.change}%`);
  else ctx.reply("❌ Could not fetch SOL price.");
});

// COMMAND: /floor
bot.command('floor', async (ctx) => {
  const nftData = await getNFTFloorPrice(HINEY_NFT_SYMBOL);
  if (!nftData) return ctx.reply("❌ NFT Data Unavailable.");
  const msg = `🍑 <b>The Hiney-kin Stats</b>\n\n🧱 <b>Floor:</b> ${nftData.floor} SOL\n📦 <b>Listed:</b> ${nftData.listed}\n<a href="https://magiceden.io/marketplace/${HINEY_NFT_SYMBOL}">View on Magic Eden</a>`;
  ctx.replyWithHTML(msg);
});

// --- 5. SERVER & LAUNCH ---
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
      const buyer = event.buyer;
      const source = event.source || "Marketplace";
      const imageUrl = event.nfts[0].metadata?.image || "https://hineycoin.online/logo.png";

      const telegramCaption = `🚨 <b>HINEY-KIN ADOPTED!</b> 🚨\n\n` +
                              `🖼️ <b>${nftName}</b>\n` +
                              `💰 Sold for: <b>${price} SOL</b>\n` +
                              `🛒 Marketplace: ${source}\n` +
                              `🤝 Buyer: <code>${buyer.slice(0, 4)}...${buyer.slice(-4)}</code>\n\n` +
                              `<a href="https://magiceden.io/item-details/${nftMint}">View on Magic Eden</a>`;
      
      const twitterText = `🚨 HINEY-KIN ADOPTED! \n\n🖼️ ${nftName} just sold for ${price} SOL!\n🛒 Market: ${source}\n#Solana #HineyCoin $HINEY`;

      // TELEGRAM SEND
      const rawIds = process.env.TELEGRAM_CHAT_IDS || process.env.TELEGRAM_CHAT_ID;
      const chatIds = rawIds.split(',');
      for (const chatId of chatIds) {
          try { await bot.telegram.sendPhoto(chatId.trim(), imageUrl, { caption: telegramCaption, parse_mode: 'HTML' }); } 
          catch (e) { console.error(`❌ TG Fail: ${e.message}`); }
      }

      // TWITTER SEND
      try {
        const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Chrome/110' } });
        const mediaId = await twitterClient.v1.uploadMedia(Buffer.from(imgRes.data), { mimeType: 'image/png' });
        await twitterClient.v2.tweet({ text: `${twitterText}\n🔗 https://magiceden.io/item-details/${nftMint}`, media: { media_ids: [mediaId] } });
        console.log(`✅ Posted Sale: ${nftName}`);
      } catch (e) { console.error(`❌ Twitter Fail: ${e.message}`); }
    }
  }
  res.sendStatus(200);
});

// STARTUP SEQUENCE (The Fix)
app.listen(port, '0.0.0.0', async () => { 
  console.log(`🌐 Webhook listening on port ${port}`);
  
  // FIX: Force Delete Webhook so Polling works for commands
  try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log("🔄 Previous webhooks cleared. Starting Polling...");
      bot.launch(); 
      console.log('🍑 Hineycoinbot Commands Ready!');
  } catch (err) {
      console.error("❌ Failed to launch bot:", err);
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));