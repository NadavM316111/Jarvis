
// ===== SESAMI EDIT MODE SYSTEM =====
// Persistent editing across all pages

(function() {
    const EDIT_MODE_KEY = 'sesami_edit_mode';
    
    // Check if edit mode is active from localStorage
    function isEditModeActive() {
        return localStorage.getItem(EDIT_MODE_KEY) === 'true';
    }
    
    // Set edit mode state
    function setEditMode(active) {
        localStorage.setItem(EDIT_MODE_KEY, active ? 'true' : 'false');
    }
    
    // Initialize edit mode on page load
    function initEditMode() {
        createEditButton();
        createEditToolbar();
        createDeleteConfirmModal();
        
        if (isEditModeActive()) {
            enableEditMode();
        }
    }
    
    // Create the floating edit button
    function createEditButton() {
        const existingBtn = document.getElementById('sesamiEditBtn');
        if (existingBtn) existingBtn.remove();
        
        const btn = document.createElement('button');
        btn.id = 'sesamiEditBtn';
        btn.innerHTML = '<i class="fas fa-pen"></i> <span>Edit Site</span>';
        btn.onclick = toggleEditMode;
        document.body.appendChild(btn);
        
        updateEditButtonState();
    }
    
    // Create the edit toolbar
    function createEditToolbar() {
        const existingToolbar = document.getElementById('sesamiEditToolbar');
        if (existingToolbar) existingToolbar.remove();
        
        const toolbar = document.createElement('div');
        toolbar.id = 'sesamiEditToolbar';
        toolbar.innerHTML = `
            <div class="toolbar-inner">
                <div class="toolbar-left">
                    <i class="fas fa-wand-magic-sparkles"></i>
                    <span>Edit Mode Active</span>
                </div>
                <div class="toolbar-center">
                    <span class="toolbar-hint"><i class="fas fa-mouse-pointer"></i> Click any text to edit</span>
                    <span class="toolbar-hint"><i class="fas fa-trash"></i> Hover cards to delete</span>
                </div>
                <div class="toolbar-right">
                    <button class="toolbar-btn save-btn" onclick="window.sesamiEditMode.saveChanges()">
                        <i class="fas fa-save"></i> Save
                    </button>
                    <button class="toolbar-btn exit-btn" onclick="window.sesamiEditMode.exitEditMode()">
                        <i class="fas fa-times"></i> Exit Edit Mode
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(toolbar);
    }
    
    // Create delete confirmation modal
    function createDeleteConfirmModal() {
        const existingModal = document.getElementById('deleteConfirmModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'deleteConfirmModal';
        modal.className = 'delete-modal';
        modal.innerHTML = `
            <div class="delete-modal-content">
                <div class="delete-modal-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <h3>Delete this item?</h3>
                <p>This action cannot be undone.</p>
                <div class="delete-modal-actions">
                    <button class="modal-btn cancel-btn" onclick="window.sesamiEditMode.hideDeleteModal()">Cancel</button>
                    <button class="modal-btn confirm-btn" onclick="window.sesamiEditMode.confirmDelete()">Delete</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    // Update edit button appearance
    function updateEditButtonState() {
        const btn = document.getElementById('sesamiEditBtn');
        if (!btn) return;
        
        if (isEditModeActive()) {
            btn.classList.add('editing');
            btn.innerHTML = '<i class="fas fa-eye"></i> <span>View Mode</span>';
        } else {
            btn.classList.remove('editing');
            btn.innerHTML = '<i class="fas fa-pen"></i> <span>Edit Site</span>';
        }
    }
    
    // Toggle edit mode
    function toggleEditMode() {
        if (isEditModeActive()) {
            exitEditMode();
        } else {
            enableEditMode();
        }
    }
    
    // Enable edit mode
    function enableEditMode() {
        setEditMode(true);
        document.body.classList.add('edit-mode-active');
        updateEditButtonState();
        
        // Show toolbar
        const toolbar = document.getElementById('sesamiEditToolbar');
        if (toolbar) toolbar.classList.add('visible');
        
        // Make all text editable
        makeContentEditable();
        
        // Add delete buttons to cards
        addDeleteButtons();
        
        // Show toast
        showToast('Edit mode enabled - Click any text to edit', 'info');
    }
    
    // Exit edit mode
    function exitEditMode() {
        setEditMode(false);
        document.body.classList.remove('edit-mode-active');
        updateEditButtonState();
        
        // Hide toolbar
        const toolbar = document.getElementById('sesamiEditToolbar');
        if (toolbar) toolbar.classList.remove('visible');
        
        // Remove editable from all elements
        removeContentEditable();
        
        // Remove delete buttons
        removeDeleteButtons();
        
        showToast('Edit mode disabled', 'success');
    }
    
    // Make content editable
    function makeContentEditable() {
        const editableSelectors = [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'span:not(.stat-number):not(.stat-label)',
            'li', 'blockquote', '.card-title', '.card-text',
            '.hero-title', '.hero-subtitle', '.section-title',
            '.feature-title', '.feature-desc', '.stat-number', '.stat-label'
        ];
        
        editableSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                // Skip nav elements and buttons
                if (el.closest('nav') || el.closest('button') || el.closest('.edit-btn') || 
                    el.closest('#sesamiEditToolbar') || el.closest('#sesamiEditBtn') ||
                    el.closest('.delete-btn') || el.closest('.toast')) return;
                
                el.contentEditable = 'true';
                el.classList.add('editable-element');
                
                // Add focus styling
                el.addEventListener('focus', handleEditFocus);
                el.addEventListener('blur', handleEditBlur);
            });
        });
    }
    
    // Remove content editable
    function removeContentEditable() {
        document.querySelectorAll('.editable-element').forEach(el => {
            el.contentEditable = 'false';
            el.classList.remove('editable-element', 'editing-active');
            el.removeEventListener('focus', handleEditFocus);
            el.removeEventListener('blur', handleEditBlur);
        });
    }
    
    // Handle edit focus
    function handleEditFocus(e) {
        e.target.classList.add('editing-active');
    }
    
    // Handle edit blur
    function handleEditBlur(e) {
        e.target.classList.remove('editing-active');
    }
    
    // Add delete buttons to cards and sections
    function addDeleteButtons() {
        const deletableSelectors = [
            '.glass-card', '.feature-card', '.process-card', '.stat-item',
            '.interview-card', '.persona-card', '.idea-card', '.test-card',
            '.insight-card', '.timeline-item', '.nav-item.has-dropdown'
        ];
        
        deletableSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach((el, index) => {
                if (el.querySelector('.delete-btn')) return;
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    showDeleteModal(el);
                };
                
                el.style.position = 'relative';
                el.appendChild(deleteBtn);
            });
        });
    }
    
    // Remove delete buttons
    function removeDeleteButtons() {
        document.querySelectorAll('.delete-btn').forEach(btn => btn.remove());
    }
    
    // Delete modal functionality
    let elementToDelete = null;
    
    function showDeleteModal(element) {
        elementToDelete = element;
        const modal = document.getElementById('deleteConfirmModal');
        if (modal) modal.classList.add('visible');
    }
    
    function hideDeleteModal() {
        elementToDelete = null;
        const modal = document.getElementById('deleteConfirmModal');
        if (modal) modal.classList.remove('visible');
    }
    
    function confirmDelete() {
        if (elementToDelete) {
            elementToDelete.style.transform = 'scale(0.8)';
            elementToDelete.style.opacity = '0';
            setTimeout(() => {
                elementToDelete.remove();
                showToast('Item deleted', 'success');
            }, 300);
        }
        hideDeleteModal();
    }
    
    // Save changes (stores in localStorage for demo)
    function saveChanges() {
        const pageContent = document.querySelector('main') || document.body;
        const pageName = window.location.pathname.split('/').pop() || 'index.html';
        
        // For demo purposes, just show success
        showToast('Changes saved successfully!', 'success');
    }
    
    // Toast notification
    function showToast(message, type = 'info') {
        const existingToast = document.querySelector('.edit-toast');
        if (existingToast) existingToast.remove();
        
        const toast = document.createElement('div');
        toast.className = `edit-toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'times-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('visible'), 10);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    // Expose functions globally
    window.sesamiEditMode = {
        toggle: toggleEditMode,
        enable: enableEditMode,
        exit: exitEditMode,
        exitEditMode: exitEditMode,
        saveChanges: saveChanges,
        showDeleteModal: showDeleteModal,
        hideDeleteModal: hideDeleteModal,
        confirmDelete: confirmDelete,
        isActive: isEditModeActive
    };
    
    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEditMode);
    } else {
        initEditMode();
    }
})();
