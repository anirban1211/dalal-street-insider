window.addEventListener('DOMContentLoaded', async () => {
  // Ensure newsData is loaded
  if (Object.keys(newsData).length === 0) {
    document.getElementById('article-detail').innerHTML = '<h2 class="article-page-title">Loading article data...</h2>';
    await fetchLiveNews();
  }

  const params = new URLSearchParams(window.location.search);
  const cat = params.get('cat');
  const id = parseInt(params.get('id'));

  if (!cat || isNaN(id) || !newsData[cat] || !newsData[cat][id]) {
    document.getElementById('article-detail').innerHTML = `
      <h2 class="article-page-title">Article Not Found</h2>
      <p class="article-page-content">Looks like this news story got lost in the mail. Try heading back to the main briefing.</p>
    `;
    return;
  }

  const article = newsData[cat][id];
  
  // Use the actual article URL scraped by the backend
  const sourceUrl = article.url || `https://news.google.com/search?q=${encodeURIComponent(article.title)}`;

  // Format article content: paragraphs and bold first sentence
  let rawText = article.longArticle || article.summary;
  let paragraphs = rawText.split('\n').filter(p => p.trim() !== '');
  
  let formattedContent = paragraphs.map(p => {
    // Bold the first sentence to highlight important parts
    let sentences = p.split('. ');
    let pTag = '<p style="margin-bottom: 1.5em; line-height: 1.8; font-size: 1.1em; color: #1a1a1a;">';
    if (sentences.length > 1) {
      sentences[0] = `<strong>${sentences[0]}.</strong>`;
      return `${pTag}${sentences.join(' ')}</p>`;
    }
    return `${pTag}${p}</p>`;
  }).join('');

  document.getElementById('article-detail').innerHTML = `
    <h2 class="article-page-title">${article.title}</h2>
    <div class="article-page-content">${formattedContent}</div>
    <a href="${sourceUrl}" target="_blank" class="btn-source">Read Full Original Article</a>
  `;

  // Render related articles
  const relatedContainer = document.getElementById('related-container');
  const allInCategory = newsData[cat];
  
  // Get other articles in the same category
  const related = allInCategory.filter((_, index) => index !== id).slice(0, 3);
  
  if (related.length > 0) {
    related.forEach(rel => {
      const realIndex = allInCategory.indexOf(rel);
      const linkHref = rel.isPaywalled ? rel.url : `article.html?cat=${encodeURIComponent(cat)}&id=${realIndex}`;
      const targetBlank = rel.isPaywalled ? 'target="_blank"' : '';
      const buttonText = rel.isPaywalled ? 'Read on Source &nearr;' : 'Read More &rarr;';

      const card = document.createElement('article');
      card.className = 'article-card';
      card.innerHTML = `
        <h3 class="article-title">${rel.title}</h3>
        <p class="article-summary">${rel.summary.length > 150 ? rel.summary.substring(0, 150) + '...' : rel.summary}</p>
        <a href="${linkHref}" ${targetBlank} class="read-more">${buttonText}</a>
      `;
      relatedContainer.appendChild(card);
    });
  } else {
    document.querySelector('.related-section').style.display = 'none';
  }
});
