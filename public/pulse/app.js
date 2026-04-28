const API = 'https://api.heyjarvis.me/api/pulse';
const EMOJIS = ['like', 'love', 'laugh', 'wow', 'sad', 'angry'];
const EMOJI_MAP = {
  like: String.fromCodePoint(0x1F44D),
  love: String.fromCodePoint(0x2764),
  laugh: String.fromCodePoint(0x1F602),
  wow: String.fromCodePoint(0x1F62E),
  sad: String.fromCodePoint(0x1F622),
  angry: String.fromCodePoint(0x1F621)
};
const COLORS = ['#ff3366', '#3366ff', '#33cc99', '#ff9933', '#9933ff', '#33ccff', '#ff6699', '#66cc33'];

let currentSort = 'hot';
let posts = [];

// DOM Elements
const feed = document.getElementById('feed');
const confessionInput = document.getElementById('confessionInput');
const postBtn = document.getElementById('postBtn');
const charCount = document.getElementById('charCount');
const modal = document.getElementById('postModal');
const modalBody = document.getElementById('modalBody');
const tabs = document.querySelectorAll('.tab');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadPosts();
  setupEventListeners();
});

function setupEventListeners() {
  // Character count
  confessionInput.addEventListener('input', () => {
    const len = confessionInput.value.length;
    charCount.textContent = len;
    postBtn.disabled = len === 0 || len > 500;
  });

  // Post button
  postBtn.addEventListener('click', createPost);

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentSort = tab.dataset.sort;
      loadPosts();
    });
  });

  // Modal close
  modal.querySelector('.modal-overlay').addEventListener('click', closeModal);
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  
  // Escape key closes modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

async function loadPosts() {
  feed.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading confessions...</p></div>';
  
  try {
    const res = await fetch(API + '/posts?sort=' + currentSort);
    posts = await res.json();
    renderPosts();
  } catch (err) {
    feed.innerHTML = '<div class="empty-state"><h3>Could not load posts</h3><p>Please try again later</p></div>';
  }
}

function renderPosts() {
  if (posts.length === 0) {
    feed.innerHTML = '<div class="empty-state"><h3>No confessions yet</h3><p>Be the first to share anonymously!</p></div>';
    return;
  }

  feed.innerHTML = posts.map(post => createPostCard(post)).join('');
  
  // Add click listeners
  feed.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.reaction-btn')) {
        openPostModal(card.dataset.id);
      }
    });
  });

  // Add reaction listeners
  feed.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleReaction(btn.dataset.postId, btn.dataset.emoji);
    });
  });
}

function createPostCard(post) {
  const color = COLORS[post.id % COLORS.length];
  const isHot = post.heat_score > 10;
  const timeAgo = getTimeAgo(post.created_at);
  
  const reactions = post.reactions || {};
  const reactionsHtml = EMOJIS.map(emoji => {
    const count = reactions[emoji] || 0;
    return '<button class="reaction-btn" data-post-id="' + post.id + '" data-emoji="' + emoji + '">' +
      '<span>' + EMOJI_MAP[emoji] + '</span>' +
      (count > 0 ? '<span class="reaction-count">' + count + '</span>' : '') +
    '</button>';
  }).join('');

  return '<div class="post-card' + (isHot ? ' hot' : '') + '" data-id="' + post.id + '">' +
    '<div class="post-header">' +
      '<div class="post-meta">' +
        '<div class="post-avatar" style="background: ' + color + '22; color: ' + color + '">?</div>' +
        '<div class="post-info">' +
          '<span class="post-author">Anonymous</span>' +
          '<span class="post-time">' + timeAgo + '</span>' +
        '</div>' +
      '</div>' +
      (isHot ? '<div class="heat-badge">~ HOT</div>' : '') +
    '</div>' +
    '<div class="post-content">' + escapeHtml(post.content) + '</div>' +
    '<div class="reactions-bar">' +
      reactionsHtml +
      '<button class="comment-btn" onclick="event.stopPropagation(); openPostModal(' + post.id + ')">' +
        '<span>' + String.fromCodePoint(0x1F4AC) + '</span> ' + (post.comment_count || 0) +
      '</button>' +
    '</div>' +
  '</div>';
}

async function createPost() {
  const content = confessionInput.value.trim();
  if (!content) return;

  postBtn.disabled = true;
  postBtn.innerHTML = '<span>Posting...</span>';

  try {
    const res = await fetch(API + '/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    
    if (res.ok) {
      confessionInput.value = '';
      charCount.textContent = '0';
      showToast('Confession posted anonymously!');
      loadPosts();
    }
  } catch (err) {
    showToast('Failed to post. Try again.');
  }

  postBtn.disabled = false;
  postBtn.innerHTML = '<span>Post Confession</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
}

async function handleReaction(postId, emoji) {
  try {
    await fetch(API + '/reactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, emoji })
    });
    loadPosts();
  } catch (err) {
    console.error('Reaction failed:', err);
  }
}

async function openPostModal(postId) {
  modal.classList.add('active');
  modalBody.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  
  try {
    const res = await fetch(API + '/posts/' + postId);
    const data = await res.json();
    renderModalContent(data);
  } catch (err) {
    modalBody.innerHTML = '<div class="empty-state"><p>Could not load post</p></div>';
  }
}

function renderModalContent(data) {
  const { post, comments } = data;
  const color = COLORS[post.id % COLORS.length];
  const timeAgo = getTimeAgo(post.created_at);
  const reactions = post.reactions || {};
  
  const reactionsHtml = EMOJIS.map(emoji => {
    const count = reactions[emoji] || 0;
    return '<button class="reaction-btn" data-post-id="' + post.id + '" data-emoji="' + emoji + '">' +
      '<span>' + EMOJI_MAP[emoji] + '</span>' +
      (count > 0 ? '<span class="reaction-count">' + count + '</span>' : '') +
    '</button>';
  }).join('');

  const commentsHtml = comments.length > 0 
    ? comments.map(c => 
        '<div class="comment">' +
          '<div class="comment-meta">' +
            '<span class="comment-author">Anonymous</span>' +
            '<span class="comment-time">' + getTimeAgo(c.created_at) + '</span>' +
          '</div>' +
          '<div class="comment-text">' + escapeHtml(c.content) + '</div>' +
        '</div>'
      ).join('')
    : '<div class="no-comments">No comments yet. Be the first!</div>';

  modalBody.innerHTML = 
    '<div class="modal-post">' +
      '<div class="post-header">' +
        '<div class="post-meta">' +
          '<div class="post-avatar" style="background: ' + color + '22; color: ' + color + '">?</div>' +
          '<div class="post-info">' +
            '<span class="post-author">Anonymous</span>' +
            '<span class="post-time">' + timeAgo + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="post-content">' + escapeHtml(post.content) + '</div>' +
      '<div class="modal-reactions">' + reactionsHtml + '</div>' +
    '</div>' +
    '<div class="comments-section">' +
      '<div class="comments-header">' + String.fromCodePoint(0x1F4AC) + ' Comments (' + comments.length + ')</div>' +
      '<div class="comment-input-wrap">' +
        '<input type="text" class="comment-input" id="commentInput" placeholder="Add a comment..." maxlength="300">' +
        '<button class="comment-submit" id="commentSubmit">Post</button>' +
      '</div>' +
      '<div class="comments-list">' + commentsHtml + '</div>' +
    '</div>';

  // Add reaction listeners
  modalBody.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await handleReaction(btn.dataset.postId, btn.dataset.emoji);
      openPostModal(post.id);
    });
  });

  // Add comment listener
  document.getElementById('commentSubmit').addEventListener('click', () => submitComment(post.id));
  document.getElementById('commentInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitComment(post.id);
  });
}

async function submitComment(postId) {
  const input = document.getElementById('commentInput');
  const content = input.value.trim();
  if (!content) return;

  try {
    await fetch(API + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postId, content })
    });
    openPostModal(postId);
    loadPosts();
  } catch (err) {
    showToast('Failed to post comment');
  }
}

function closeModal() {
  modal.classList.remove('active');
}

function getTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
  return date.toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// Make openPostModal global for onclick
window.openPostModal = openPostModal;
