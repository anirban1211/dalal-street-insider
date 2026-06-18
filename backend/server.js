import express from 'express';
import cors from 'cors';
import RSSParser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// Serve frontend static files from the parent directory
app.use(express.static(path.join(__dirname, '..')));

const parser = new RSSParser({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'
  }
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); 

const RSS_FEEDS = {
  "Tech Industry": [
    "https://economictimes.indiatimes.com/tech/rssfeeds/13357270.cms",
    "https://www.livemint.com/rss/technology"
  ],
  "Energy Industry": [
    "https://www.livemint.com/rss/industry",
    "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms"
  ],
  "Gold & Jewellery": [
    "https://www.livemint.com/rss/companies",
    "https://economictimes.indiatimes.com/markets/commodities/rssfeeds/1806263.cms"
  ],
  "Nifty & Market Outlook": [
    "https://economictimes.indiatimes.com/markets/rssfeeds/2146842.cms",
    "https://www.livemint.com/rss/markets"
  ],
  "Metals Outlook": [
    "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    "https://economictimes.indiatimes.com/markets/commodities/rssfeeds/1806263.cms"
  ],
  "Startup VC News": [
    "https://www.livemint.com/rss/technology",
    "https://economictimes.indiatimes.com/small-biz/startups/rssfeeds/11836655.cms"
  ],
  "Legal & Regulatory": [
    "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms",
    "https://www.livemint.com/rss/economy"
  ],
  "Major Updates": [
    "https://economictimes.indiatimes.com/rssfeedsdefault.cms",
    "https://www.livemint.com/rss/news"
  ],
  "Serious Politics": [
    "https://www.livemint.com/rss/politics",
    "https://economictimes.indiatimes.com/news/politics/nation/rssfeeds/1052732.cms"
  ],
  "RBI, IMF, WB News": [
    "https://www.livemint.com/rss/economy",
    "https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms"
  ],
  "Bond Markets": [
    "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    "https://economictimes.indiatimes.com/markets/rssfeeds/2146842.cms"
  ],
  "Other Industries": [
    "https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms",
    "https://www.livemint.com/rss/industry"
  ]
};

async function scrapeArticleText(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(response.data);
    
    // Remove script, style, nav, footer, header, aside, and tracking elements
    $('script, style, nav, footer, header, aside, iframe, img, noscript, svg, form, button, input').remove();

    // Determine the best container for article text
    let container;
    if ($('div.artText').length > 0) {
      container = $('div.artText');
    } else if ($('div.article-content').length > 0) {
      container = $('div.article-content');
    } else if ($('article').length > 0) {
      container = $('article');
    } else {
      container = $('body');
    }

    // Extract text from each <p> tag individually to preserve paragraph structure
    let paragraphs = [];
    container.find('p').each((i, el) => {
      let text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length > 30) {
        paragraphs.push(text);
      }
    });

    // If no <p> tags found, fall back to splitting container text by double newlines
    if (paragraphs.length === 0) {
      let raw = container.text().replace(/\s+/g, ' ').trim();
      // Try splitting on sentence boundaries for long blocks
      if (raw.length > 200) {
        let sentences = raw.split(/(?<=\.)\s+/);
        let chunk = '';
        for (let s of sentences) {
          chunk += s + ' ';
          if (chunk.length > 300) {
            paragraphs.push(chunk.trim());
            chunk = '';
          }
        }
        if (chunk.trim().length > 20) paragraphs.push(chunk.trim());
      } else if (raw.length > 30) {
        paragraphs.push(raw);
      }
    }

    // Filter out junk lines
    const junkPatterns = [
      /^by\s/i, /^edited by\s/i, /^published by\s/i, /^updated:/i,
      /min read$/i, /^\d+ min read/i, /^share this/i, /^follow us/i,
      /gift this article/i, /check your wealth/i, /mint premium/i,
      /subscribe to enjoy/i, /catch all the business news/i,
      /download the mint app/i, /oops! looks like you have exceeded/i,
      /also read\s*\|/i, /^advertisement$/i, /^read more$/i,
      /scorecardresearch/i, /facebook\.com\/tr/i
    ];

    paragraphs = paragraphs.filter(p => {
      return !junkPatterns.some(pattern => pattern.test(p));
    });

    return paragraphs.join('\n\n');
  } catch (err) {
    console.error("Scraping failed for URL:", url, err.message);
    return "";
  }
}

async function rewriteNews(title, summary, scrapedText) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
  const wordCount = scrapedText ? scrapedText.split(' ').length : summary.split(' ').length;
  // If it's very short, it's either just a snippet or paywalled
  const isLikelyPaywalled = (scrapedText && scrapedText.length < 500 && scrapedText.toLowerCase().includes('subscribe')) || (wordCount < 100);
  
  const targetWords = Math.max(300, Math.floor(wordCount / 2));
  
  const prompt = `
    You are a funny, casual friend who knows a lot about finance and tech. 
    You need to rewrite a news article. The new article must be elaborate, at least ${targetWords} words long.
    If the provided text is too short because it's paywalled or just a snippet, use your knowledge to expand on the topic to meet the length requirement, and at the end of the article, add a funny note saying the original article was likely paywalled.
    
    Original Title: ${title}
    Original Text/Snippet: ${scrapedText || summary}
    
    Output ONLY a valid JSON object with the following keys:
    - "newTitle": A catchy, funny title (1 sentence).
    - "newSummary": A brief 1-2 sentence summary for the front page.
    - "longArticle": The elaborate, funny, and informative article body (at least ${targetWords} words). Do not use markdown.
    
    Format: {"newTitle": "...", "newSummary": "...", "longArticle": "..."}
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonStr = responseText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("AI rewrite failed for:", title, "| Error:", e.message);
    let paywallNotice = isLikelyPaywalled ? "\n\n(Note: The original article was quite short, possibly paywalled!)" : "";
    
    const funnyIntro = "Yo! So here's the deal with this latest update:\n\n";
    const wittyJokes = [
      "I'm not saying this is financial advice, but my hamster said buy.",
      "If this news was a stock, I'd short it purely on vibes.",
      "Just when you thought the market couldn't get weirder...",
      "Reading this made my wallet physically cringe.",
      "Tech bros are probably hyperventilating over this right now.",
      "My portfolio just dropped 5% while I was reading this headline.",
      "This is why we can't have nice things in the economy.",
      "I asked an AI to explain this and it just started crying.",
      "Somewhere, a CEO is aggressively typing an angry email.",
      "If I had a dollar for every time this happened, I'd be able to afford eggs."
    ];
    const randomJoke = wittyJokes[Math.floor(Math.random() * wittyJokes.length)];
    const funnyOutro = "\n\nAnyway, that's the gist of it! Pretty crazy, right? Stay tuned for more.";

    return { 
      newTitle: title, 
      newSummary: summary.length > 60 ? summary.substring(0, 60) + "... " + randomJoke : summary + " " + randomJoke, 
      longArticle: funnyIntro + (scrapedText || summary) + paywallNotice + funnyOutro
    };
  }
}

async function updateNewsCache() {
  console.log("Fetching and rewriting new articles...");
  let newCache = {};

  for (const [category, feedUrls] of Object.entries(RSS_FEEDS)) {
    try {
      let combinedArticles = [];
      for (const url of feedUrls) {
        try {
          let feed = await parser.parseURL(url);
          const sourceName = url.includes('livemint.com') ? 'Mint' : url.includes('economictimes') ? 'ET' : 'Dow Jones';
          feed.items.forEach(item => {
            item.source = sourceName;
          });
          combinedArticles.push(...feed.items);
        } catch (err) {
          console.error(`Failed fetching feed ${url} for ${category}:`, err.message);
        }
      }

      // Sort by publication date (newest first)
      combinedArticles.sort((a, b) => new Date(b.isoDate || b.pubDate) - new Date(a.isoDate || a.pubDate));

      // Deduplicate articles by title and URL
      const seen = new Set();
      const uniqueArticles = [];
      for (const article of combinedArticles) {
        const titleKey = (article.title || "").toLowerCase().trim();
        if (!seen.has(article.link) && !seen.has(titleKey) && titleKey.length > 5) {
          seen.add(article.link);
          seen.add(titleKey);
          uniqueArticles.push(article);
        }
      }

      let top5Articles = uniqueArticles.slice(0, 5);
      newCache[category] = [];
      
      for (let article of top5Articles) {
        console.log("Scraping:", article.link);
        let scrapedText = await scrapeArticleText(article.link);
        
        const wordCount = scrapedText ? scrapedText.split(' ').length : (article.contentSnippet || "").split(' ').length;
        const isPaywalled = wordCount < 200 || article.link.includes('wsj.com') || article.title.toLowerCase().includes('premium');
        
        const rewritten = await rewriteNews(article.title, article.contentSnippet || article.content || "No summary provided.", scrapedText);
        
        newCache[category].push({
          title: rewritten.newTitle || article.title,
          summary: rewritten.newSummary || article.contentSnippet,
          longArticle: rewritten.longArticle || rewritten.newSummary || article.contentSnippet,
          url: article.link,
          isPaywalled: isPaywalled,
          source: article.source
        });
      }
    } catch (err) {
      console.error("Failed fetching for", category, err.message);
      newCache[category] = [];
    }
  }

  fs.writeFileSync('news-cache.json', JSON.stringify(newCache, null, 2));
  console.log("News updated successfully!");
}

cron.schedule('0 */12 * * *', () => {
  updateNewsCache();
});

app.get('/api/news', (req, res) => {
  try {
    const data = fs.readFileSync('news-cache.json');
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: "No news cached yet. Please wait.", wait: true });
  }
});

app.get('/api/market-pulse', async (req, res) => {
  const fetchTicker = async (symbol) => {
    try {
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'
        },
        timeout: 5000
      });
      const result = response.data.chart.result[0].meta;
      return {
        price: result.regularMarketPrice,
        prevClose: result.previousClose
      };
    } catch (err) {
      console.error(`Failed to fetch market pulse for ${symbol}:`, err.message);
      return null;
    }
  };

  const tickers = {
    nifty: '%5ENSEI',
    sensex: '%5EBSESN',
    gold: 'GC=F',
    usdinr: 'USDINR=X'
  };

  const results = {};
  for (const [key, symbol] of Object.entries(tickers)) {
    results[key] = await fetchTicker(symbol);
  }

  // Calculate Gold per 10g in INR
  if (results.gold && results.usdinr) {
    const goldOzUsd = results.gold.price;
    const goldOzUsdPrev = results.gold.prevClose;
    const usdInr = results.usdinr.price;
    const usdInrPrev = results.usdinr.prevClose;

    const goldInr10g = (goldOzUsd * usdInr / 31.1034768) * 10;
    const goldInr10gPrev = (goldOzUsdPrev * usdInrPrev / 31.1034768) * 10;

    results.goldInr = {
      price: Math.round(goldInr10g),
      prevClose: Math.round(goldInr10gPrev)
    };
  }

  res.json(results);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  if (!fs.existsSync('news-cache.json')) {
    updateNewsCache(); 
  }
});
