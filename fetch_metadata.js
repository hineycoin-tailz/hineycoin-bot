const axios = require('axios');
const fs = require('fs');

//⚠️ PASTE YOUR HELIUS API KEY HERE
const HELIUS_KEY = '1d8e8a5c-20b5-44aa-8023-0c8173bd6e2d'; 
const URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

// The Hiney-Kin Collection Address
const COLLECTION_ADDR = '2WLmS56uF9MuLpd8V4om3XEzMzXvThM3apQfwtw8LeEn';

async function fetchAllNFTs() {
    let page = 1;
    let allAssets = [];
    console.log("🍑 Starting Metadata Fetch... this might take a minute.");

    while (true) {
        console.log(`Fetching page ${page}...`);
        try {
            const response = await axios.post(URL, {
                jsonrpc: '2.0',
                id: 'my-id',
                method: 'getAssetsByGroup',
                params: {
                    groupKey: 'collection',
                    groupValue: COLLECTION_ADDR,
                    page: page,
                    limit: 1000
                }
            });

            const items = response.data.result.items;
            if (!items || items.length === 0) break;

            items.forEach(item => {
                // We map the Mint Address (id) to the Name
                allAssets.push({
                    mint: item.id,
                    name: item.content.metadata.name,
                    image: item.content.files?.[0]?.uri || item.content.links?.image
                });
            });

            if (items.length < 1000) break; // Finished
            page++;
        } catch (e) {
            console.error("Error fetching:", e.message);
            break;
        }
    }

    // Convert array to a fast Lookup Object: { "MINT_ADDRESS": "Name" }
    const lookupMap = {};
    allAssets.forEach(a => {
        lookupMap[a.mint] = a.name;
    });

    // Save to file
    fs.writeFileSync('hiney_data.json', JSON.stringify(lookupMap, null, 2));
    console.log(`✅ Success! Saved ${allAssets.length} Hiney-Kins to hiney_data.json`);
}

fetchAllNFTs();