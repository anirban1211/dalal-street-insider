let newsData = {};
let currentCategory = "All";

async function fetchLiveNews() {
  try {
    const response = await fetch('/api/news');
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    newsData = data;
    if (document.getElementById('news-container')) {
      renderTabs();
      renderNews();
    }
  } catch (error) {
    console.error("Error fetching live news:", error);
    if (document.getElementById('news-container')) {
      document.getElementById('news-container').innerHTML = '<h2 style="text-align:center; padding: 50px;">Waiting for backend to fetch news... Refresh in a minute.</h2>';
    }
  }
}

const books = {
  finance: [
    {
      title: "The Psychology of Money",
      author: "Morgan Housel",
      desc: "Doing well with money isn't necessarily about what you know. It's about how you behave. A fantastic, easy read.",
      link: "https://www.amazon.in/Psychology-Money-Morgan-Housel/dp/9390166268",
      imgUrl: "https://covers.openlibrary.org/b/isbn/9780857197689-L.jpg"
    },
    {
      title: "A Random Walk Down Wall Street",
      author: "Burton G. Malkiel",
      desc: "The classic book that proves a blindfolded monkey throwing darts at a newspaper's financial pages could select a portfolio that would do just as well as one carefully selected by experts.",
      link: "https://www.amazon.in/Random-Walk-Down-Wall-Street/dp/0393358380",
      imgUrl: "https://covers.openlibrary.org/b/isbn/9780393358384-L.jpg"
    },
    {
      title: "One Up On Wall Street",
      author: "Peter Lynch",
      desc: "Use what you already know to make money in the market. A legendary manager's guide.",
      link: "https://www.amazon.in/One-Up-Wall-Street-Already/dp/0743200403",
      imgUrl: "https://covers.openlibrary.org/b/isbn/9780743200400-L.jpg"
    }
  ],
  misc: [
    {
      title: "Atomic Habits",
      author: "James Clear",
      desc: "An easy and proven way to build good habits and break bad ones. Totally shifts how you think about self-improvement.",
      link: "https://www.amazon.in/Atomic-Habits-James-Clear/dp/1847941834",
      imgUrl: "https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg"
    },
    {
      title: "Thinking, Fast and Slow",
      author: "Daniel Kahneman",
      desc: "A deep dive into the two systems that drive the way we think. Warning: might cause an existential crisis about your decision-making.",
      link: "https://www.amazon.in/Thinking-Fast-Slow-Daniel-Kahneman/dp/0141033576",
      imgUrl: "https://covers.openlibrary.org/b/isbn/9780374533557-L.jpg"
    }
  ]
};

async function init() {
  updateDateAndDate();
  renderBookOfTheWeek();
  await fetchLiveNews();
  await updateMarketPulse();

  document.getElementById('refresh-btn').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.classList.add('spinning');
    btn.innerText = "Refreshing...";
    
    await fetchLiveNews();
    await updateMarketPulse();
    updateDateAndDate(true);
    
    btn.classList.remove('spinning');
    btn.innerText = "Refresh Now";
  });
}

async function updateMarketPulse() {
  try {
    const response = await fetch('/api/market-pulse');
    const data = await response.json();

    const formatChange = (item, prefix = "") => {
      if (!item || item.price === undefined || item.prevClose === undefined) return "";
      const price = item.price;
      const prevClose = item.prevClose;
      const diff = price - prevClose;
      const pct = (diff / prevClose) * 100;
      const arrow = diff >= 0 ? "▲" : "▼";
      const color = diff >= 0 ? "green" : "red";
      const formattedPrice = prefix + price.toLocaleString('en-IN', { maximumFractionDigits: 2 });
      return `${formattedPrice} <span style="color:${color}">${arrow} ${Math.abs(pct).toFixed(2)}%</span>`;
    };

    if (data.nifty && document.getElementById('pulse-nifty')) {
      document.getElementById('pulse-nifty').innerHTML = formatChange(data.nifty);
    }
    if (data.sensex && document.getElementById('pulse-sensex')) {
      document.getElementById('pulse-sensex').innerHTML = formatChange(data.sensex);
    }
    if (data.goldInr && document.getElementById('pulse-gold')) {
      document.getElementById('pulse-gold').innerHTML = formatChange(data.goldInr, "₹");
    }
    if (data.usdinr && document.getElementById('pulse-usdinr')) {
      document.getElementById('pulse-usdinr').innerHTML = formatChange(data.usdinr);
    }
  } catch (error) {
    console.error("Error updating market pulse:", error);
  }
}

function updateDateAndDate(isRefresh = false) {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('header-date').innerText = now.toLocaleDateString('en-US', options);
  
  if (isRefresh) {
    const timeOpts = { hour: '2-digit', minute:'2-digit' };
    document.getElementById('last-updated').innerText = "Last Updated: Today at " + now.toLocaleTimeString('en-US', timeOpts);
  }
}

function renderTabs() {
  const tabsContainer = document.getElementById('tabs-container');
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';
  
  const categories = ["All", ...Object.keys(newsData)];
  
  categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (currentCategory === cat ? ' active' : '');
    btn.innerText = cat;
    btn.addEventListener('click', () => {
      currentCategory = cat;
      renderTabs(); // re-render to update active state
      renderNews();
    });
    tabsContainer.appendChild(btn);
  });
}

function renderNews() {
  const container = document.getElementById('news-container');
  if (!container) return;
  container.innerHTML = ''; // clear

  for (const [category, articles] of Object.entries(newsData)) {
    if (currentCategory !== "All" && category !== currentCategory) continue;

    const section = document.createElement('section');
    section.className = 'news-section';

    const header = document.createElement('h2');
    header.className = 'section-header';
    header.innerText = category;
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'news-grid';

    articles.forEach(article => {
      const card = document.createElement('article');
      card.className = 'article-card';
      
      const linkHref = article.isPaywalled ? article.url : `article.html?cat=${encodeURIComponent(category)}&id=${articles.indexOf(article)}`;
      const targetBlank = article.isPaywalled ? 'target="_blank"' : '';
      const buttonText = article.isPaywalled ? 'Read on Source &nearr;' : 'Read More &rarr;';

      card.innerHTML = `
        <h3 class="article-title">${article.title}</h3>
        <p class="article-summary">${article.summary.length > 150 ? article.summary.substring(0, 150) + '...' : article.summary}</p>
        <a href="${linkHref}" ${targetBlank} class="read-more">${buttonText}</a>
      `;
      grid.appendChild(card);
    });

    section.appendChild(grid);
    container.appendChild(section);
  }
}

function renderBookOfTheWeek() {
  const now = new Date();
  
  // Logic to determine if it's the last week of the month
  // A simple approximation: if the date + 7 is in the next month, it's the last week
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const isLastWeek = now.getMonth() !== nextWeek.getMonth();

  let selectedBook;
  if (isLastWeek) {
    // Pick a random misc book
    selectedBook = books.misc[Math.floor(Math.random() * books.misc.length)];
  } else {
    // Pick a random finance book
    selectedBook = books.finance[Math.floor(Math.random() * books.finance.length)];
  }

  const container = document.getElementById('book-container');
  container.innerHTML = `
    <div class="book-cover" style="padding: 0; background-color: transparent; border: none; box-shadow: none;">
      <img src="${selectedBook.imgUrl}" alt="${selectedBook.title} Cover" style="max-width: 100%; max-height: 100%; object-fit: contain; box-shadow: 0 4px 6px rgba(0,0,0,0.1);" onerror="this.src='https://via.placeholder.com/150x220?text=Cover+Not+Found';"/>
    </div>
    <h3 class="book-title">${selectedBook.title}</h3>
    <p class="book-author">by ${selectedBook.author}</p>
    <p class="book-desc">${selectedBook.desc}</p>
    <a href="${selectedBook.link}" target="_blank" class="book-link">Buy on Amazon</a>
  `;
}

// Run on load
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('news-container')) {
    init();
  }
});
