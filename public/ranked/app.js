// User ID for voting (stored locally)
const userId = localStorage.getItem('ranked_user_id') || (() => {
  const id = 'user_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('ranked_user_id', id);
  return id;
})();

const API = 'https://api.heyjarvis.me/api/ranked';
let categories = [];
let currentCategory = 'all';
let userVotes = {};
let pollInterval;

// Initialize
async function init() {
  await loadCategories();
  await loadUserVotes();
  await loadLeaderboard();
  
  // Poll for updates every 5 seconds
  pollInterval = setInterval(loadLeaderboard, 5000);
  
  // Search functionality
  const searchInput = document.getElementById('searchInput');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      if (e.target.value.trim()) {
        searchItems(e.target.value);
      } else {
        loadLeaderboard();
      }
    }, 300);
  });
}

async function loadCategories() {
  try {
    const res = await fetch(API + '/categories');
    categories = await res.json();
    
    const nav = document.getElementById('categories');
    const catSelect = document.getElementById('itemCategory');
    
    // Category icons mapping
    const icons = {
      'Songs': '\u{1F3B5}',
      'Movies': '\u{1F3AC}',
      'Foods': '\u{1F355}',
      'People': '\u{1F464}',
      'Games': '\u{1F3AE}',
      'Shows': '\u{1F4FA}'
    };
    
    categories.forEach(cat => {
      // Add to nav
      const btn = document.createElement('button');
      btn.className = 'cat-btn';
      btn.dataset.id = cat.id;
      btn.innerHTML = '<span class="cat-icon">' + (icons[cat.name] || cat.icon) + '</span><span>' + cat.name + '</span>';
      btn.onclick = () => selectCategory(cat.id, cat.name);
      nav.appendChild(btn);
      
      // Add to select
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = (icons[cat.name] || cat.icon) + ' ' + cat.name;
      catSelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadUserVotes() {
  try {
    const res = await fetch(API + '/user-votes/' + userId);
    userVotes = await res.json();
  } catch (err) {
    console.error('Failed to load user votes:', err);
  }
}

function selectCategory(id, name) {
  currentCategory = id;
  
  // Update active state
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id == id);
  });
  
  // Update title
  document.getElementById('categoryTitle').textContent = 
    id === 'all' ? 'All Rankings' : 
    id === 'trending' ? 'Trending Now' : 
    name + ' Rankings';
  
  loadLeaderboard();
}

async function loadLeaderboard() {
  try {
    let url;
    if (currentCategory === 'trending') {
      url = API + '/trending';
    } else {
      url = API + '/leaderboard/' + (currentCategory === 'all' ? '' : currentCategory);
    }
    
    const res = await fetch(url);
    const items = await res.json();
    renderItems(items);
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
  }
}

async function searchItems(query) {
  try {
    const res = await fetch(API + '/search?q=' + encodeURIComponent(query));
    const items = await res.json();
    document.getElementById('categoryTitle').textContent = 'Search: "' + query + '"';
    renderItems(items);
  } catch (err) {
    console.error('Search failed:', err);
  }
}

function renderItems(items) {
  const list = document.getElementById('itemsList');
  
  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state"><h3>Nothing here yet</h3><p>Be the first to submit something!</p></div>';
    return;
  }
  
  const icons = {
    'Songs': '\u{1F3B5}',
    'Movies': '\u{1F3AC}',
    'Foods': '\u{1F355}',
    'People': '\u{1F464}',
    'Games': '\u{1F3AE}',
    'Shows': '\u{1F4FA}'
  };
  
  list.innerHTML = items.map((item, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'normal';
    const scoreClass = item.hype_score > 0 ? 'positive' : item.hype_score < 0 ? 'negative' : 'zero';
    const userVote = userVotes[item.id];
    const catIcon = icons[item.category_name] || item.icon;
    
    return '<div class="item-card" data-id="' + item.id + '">' +
      '<div class="item-rank ' + rankClass + '">' + rank + '</div>' +
      (item.image_url ? '<img src="' + item.image_url + '" class="item-image" onerror="this.style.display=\'none\'">' : '') +
      '<div class="item-info">' +
        '<div class="item-name">' + escapeHtml(item.name) + '</div>' +
        '<div class="item-meta">' +
          '<span class="item-category">' + catIcon + ' ' + item.category_name + '</span>' +
          '<span class="item-submitter">by ' + escapeHtml(item.submitted_by || 'Anonymous') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="vote-section">' +
        '<button class="vote-btn up ' + (userVote === 'up' ? 'active' : '') + '" onclick="vote(' + item.id + ', \'up\')">' +
          '\u{2191}' +
        '</button>' +
        '<div class="hype-score ' + scoreClass + '">' + (item.hype_score > 0 ? '+' : '') + item.hype_score + '</div>' +
        '<button class="vote-btn down ' + (userVote === 'down' ? 'active' : '') + '" onclick="vote(' + item.id + ', \'down\')">' +
          '\u{2193}' +
        '</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function vote(itemId, voteType) {
  try {
    const card = document.querySelector('.item-card[data-id="' + itemId + '"]');
    const scoreEl = card.querySelector('.hype-score');
    
    // Animate
    scoreEl.classList.add('vote-anim-' + voteType);
    setTimeout(() => scoreEl.classList.remove('vote-anim-' + voteType), 300);
    
    const res = await fetch(API + '/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, user_id: userId, vote_type: voteType })
    });
    
    const updated = await res.json();
    
    // Update local state
    if (updated.user_vote) {
      userVotes[itemId] = updated.user_vote;
    } else {
      delete userVotes[itemId];
    }
    
    // Update UI
    const upBtn = card.querySelector('.vote-btn.up');
    const downBtn = card.querySelector('.vote-btn.down');
    upBtn.classList.toggle('active', updated.user_vote === 'up');
    downBtn.classList.toggle('active', updated.user_vote === 'down');
    
    scoreEl.textContent = (updated.hype_score > 0 ? '+' : '') + updated.hype_score;
    scoreEl.className = 'hype-score ' + (updated.hype_score > 0 ? 'positive' : updated.hype_score < 0 ? 'negative' : 'zero');
    
  } catch (err) {
    console.error('Vote failed:', err);
  }
}

function openSubmitModal() {
  document.getElementById('submitModal').classList.add('active');
}

function closeSubmitModal() {
  document.getElementById('submitModal').classList.remove('active');
  document.getElementById('submitForm').reset();
}

document.getElementById('submitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const data = {
    name: document.getElementById('itemName').value.trim(),
    category_id: parseInt(document.getElementById('itemCategory').value),
    image_url: document.getElementById('itemImage').value.trim() || null,
    submitted_by: document.getElementById('submitterName').value.trim() || 'Anonymous'
  };
  
  try {
    const res = await fetch(API + '/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (res.ok) {
      closeSubmitModal();
      
      // Switch to that category
      const cat = categories.find(c => c.id === data.category_id);
      if (cat) {
        selectCategory(cat.id, cat.name);
      } else {
        loadLeaderboard();
      }
    }
  } catch (err) {
    console.error('Submit failed:', err);
  }
});

// Close modal on overlay click
document.getElementById('submitModal').addEventListener('click', (e) => {
  if (e.target.id === 'submitModal') closeSubmitModal();
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start the app
init();