const { Telegraf } = require('telegraf');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const express = require('express');

// --- 1. FAKE SERVER (Updated for Render) ---
const app = express();
// Render assigns a port automatically; we must use process.env.PORT
const port = process.env.PORT || 3000;

app.get('/', (req, res) => { res.send('Hineycoinbot is Alive'); });

// Use 0.0.0.0 to make sure Render can "see" the server from outside
app.listen(port, '0.0.0.0', () => { 
  console.log(`🌐 Fake server listening on port ${port}`); 
});

// --- 2. CONFIGURATION (Using Environment Variables) ---
// We use process.env so your keys stay secret on GitHub
// OLD WAY (Dangerous):
// const bot = new Telegraf('8258747544:AAFwvazGs8uxwL8zjDi14fCoSeufRiYqshs');

// NEW WAY (Secure):
const bot = new Telegraf(process.env.BOT_TOKEN);
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// LINKS
const WEB_APP_URL = 'https://hiney-miniapp-jivkkyha7-hineycoin-tailzs-projects.vercel.app/';
const DIRECT_LINK = 'https://t.me/Hineycoinbot/app'; 
const HINEY_ADDRESS = 'DDAjZFshfVvdRew1LjYSPMB3mgDD9vSW74eQouaJnray';
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

// --- 3. DEBUGGER ---
bot.use((ctx, next) => {
  if (ctx.message && ctx.message.text) {
    console.log('👂 HEARD: ' + ctx.message.text);
  }
  return next();
});

// --- 4. FUNCTIONS ---
async function getTokenPrice(address) {
  try {
    const url = 'https://api.dexscreener.com/latest/dex/tokens/' + address;
    const response = await axios.get(url, { timeout: 5000 });
    const pair = response.data.pairs[0];
    if (!pair) return null;
    return {
      price: pair.priceUsd,
      change: pair.priceChange.h24,
      liq: pair.liquidity.usd,
      vol: pair.volume.h24
    };
  } catch (error) { return null; }
}

function getRandomMedia() {
  try {
    const memeFolder = path.join(__dirname, 'memes');
    if (!fs.existsSync(memeFolder)) return null;
    const files = fs.readdirSync(memeFolder);
    if (files.length === 0) return null;
    return path.join(memeFolder, files[Math.floor(Math.random() * files.length)]);
  } catch (error) { return null; }
}

async function sendSmartMedia(ctx, filePath, captionText) {
  const ext = path.extname(filePath).toLowerCase();
  const fileSource = { source: filePath };
  const options = { caption: captionText, parse_mode: 'Markdown' };
  try {
    if (['.mp4', '.mov', '.avi'].includes(ext)) await ctx.replyWithVideo(fileSource, options);
    else if (ext === '.gif') await ctx.replyWithAnimation(fileSource, options);
    else await ctx.replyWithPhoto(fileSource, options);
  } catch (error) {
    await ctx.replyWithMarkdown(captionText);
  }
}

// --- 5. COMMANDS ---
bot.start(async (ctx) => {
  ctx.reply('Welcome! Check prices to see fresh memes!');
});

bot.command('price', async (ctx) => {
  console.log('⚡ Price command triggered');
  const hiney = await getTokenPrice(HINEY_ADDRESS);
  const sol = await getTokenPrice(SOL_ADDRESS);

  let msg = '📊 **Market Snapshot**\n\n';
  if (hiney) msg += '🍑 $HINEY: $' + hiney.price + ' (' + hiney.change + '%)\n';
  if (sol)   msg += '☀️ $SOL: $' + sol.price + ' (' + sol.change + '%)';

  const media = getRandomMedia();
  if (media) await sendSmartMedia(ctx, media, msg);
  else await ctx.replyWithMarkdown(msg);
});

bot.command('launch', async (ctx) => {
  const isPrivate = ctx.chat.type === 'private';
  const button = isPrivate 
    ? { text: '🚀 Launch App', web_app: { url: WEB_APP_URL } }
    : { text: '🚀 Launch App', url: DIRECT_LINK };

  await ctx.reply('🍑 **Welcome!** Tap below:', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[ button ]] }
  });
});

bot.launch();
console.log('🍑 Hineycoinbot is running...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));