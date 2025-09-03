document.addEventListener("DOMContentLoaded", async function() {
    const token = localStorage.getItem("token");
    
    if (!token) {
        window.location.href = "login.html";
        return;
    }
    
    // Initialize state
    window.formsState = {
        forms: [],
        currentPage: 1,
        totalPages: 1,
        filter: {
            status: "all",
            sort: "newest",
            search: ""
        }
    };
    
    try {
        // Fetch forms
        await loadForms(token);
        
        // Set up event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error("Error loading forms:", error);
    }
});

async function loadForms(token) {
    try {
        const response = await fetch(`${API_URL}/forms`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error("Failed to fetch forms");
        }
        
        const forms = await response.json();
        window.formsState.forms = forms;
        
        // Apply filters and sort
        const filteredForms = applyFilters(forms);
        
        // Update UI
        renderForms(filteredForms);
        updatePagination();
        
    } catch (error) {
        console.error("Error fetching forms:", error);
    }
}

function applyFilters(forms) {
    const { status, sort, search } = window.formsState.filter;
    
    // Filter by status
    let filtered = forms;
    if (status !== "all") {
        const isActive = status === "active";
        filtered = forms.filter(form => form.is_active === isActive);
    }
    
    // Filter by search term
    if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(form => 
            form.title.toLowerCase().includes(searchLower) || 
            (form.description && form.description.toLowerCase().includes(searchLower))
        );
    }
    
    // Sort
    switch (sort) {
        case "newest":
            filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
        case "oldest":
            filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case "name-asc":
            filtered.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case "name-desc":
            filtered.sort((a, b) => b.title.localeCompare(a.title));
            break;
        case "responses":
            filtered.sort((a, b) => b.response_count - a.response_count);
            break;
    }
    
    return filtered;
}

function renderForms(forms) {
    const formsList = document.getElementById("forms-list");
    const emptyState = document.getElementById("empty-forms");
    
    if (!formsList) return;
    
    // Clear previous forms
    formsList.innerHTML = "";
    
    if (forms.length === 0) {
        // Show empty state
        if (emptyState) emptyState.style.display = "flex";
        return;
    }
    
    // Hide empty state
    if (emptyState) emptyState.style.display = "none";
    
    // Calculate pagination
    const itemsPerPage = 12;
    const startIndex = (window.formsState.currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedForms = forms.slice(startIndex, endIndex);
    
    // Update total pages
    window.formsState.totalPages = Math.ceil(forms.length / itemsPerPage);
    
    // Render forms
    paginatedForms.forEach(form => {
        const formCard = document.createElement("div");
        formCard.className = "form-card";
        formCard.dataset.id = form._id;
        
        const formDate = new Date(form.created_at);
        const formattedDate = formDate.toLocaleDateString();
        
        formCard.innerHTML = `
            <div class="form-card-header">
                <h3 class="form-card-title">${form.title}</h3>
                <div class="form-card-meta">
                    <span class="form-card-date">Created on ${formattedDate}</span>
                    <span class="form-card-status ${form.is_active ? 'active' : 'inactive'}">
                        ${form.is_active ? 'Active' : 'Inactive'}
                    </span>
                </div>
            </div>
            <div class="form-card-content">
                <div class="form-card-stats">
                    <div class="form-stat">
                        <div class="form-stat-value">${form.response_count}</div>
                        <div class="form-stat-label">Responses</div>
                    </div>
                    <div class="form-stat">
                        <div class="form-stat-value">${form.questions ? form.questions.length : 0}</div>
                        <div class="form-stat-label">Questions</div>
                    </div>
                </div>
                <div class="form-card-actions">
                    <a href="edit-form.html?id=${form._id}" class="btn btn-outline form-action-btn">Edit</a>
                    <a href="responses.html?formId=${form._id}" class="btn btn-outline form-action-btn">Responses</a>
                </div>
            </div>
            <div class="form-more-actions">
                <button class="more-actions-btn" data-id="${form._id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                </button>
            </div>
        `;
        
        formsList.appendChild(formCard);
    });
    
    // Update pagination UI
    updatePagination();
}

function updatePagination() {
    const currentPageEl = document.getElementById("current-page");
    const totalPagesEl = document.getElementById("total-pages");
    const prevPageBtn = document.getElementById("prev-page");
    const nextPageBtn = document.getElementById("next-page");
    
    if (currentPageEl) currentPageEl.textContent = window.formsState.currentPage;
    if (totalPagesEl) totalPagesEl.textContent = window.formsState.totalPages;
    
    if (prevPageBtn) prevPageBtn.disabled = window.formsState.currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = window.formsState.currentPage >= window.formsState.totalPages;
}

function setupEventListeners() {
    // Search forms
    const searchInput = document.getElementById("search-forms");
    if (searchInput) {
        searchInput.addEventListener("input", debounce(function() {
            window.formsState.filter.search = this.value;
            window.formsState.currentPage = 1; // Reset to first page
            const filteredForms = applyFilters(window.formsState.forms);
            renderForms(filteredForms);
        }, 300));
    }
    
    // Filter by status
    const statusFilter = document.getElementById("status-filter");
    if (statusFilter) {
        statusFilter.addEventListener("change", function() {
            window.formsState.filter.status = this.value;
            window.formsState.currentPage = 1; // Reset to first page
            const filteredForms = applyFilters(window.formsState.forms);
            renderForms(filteredForms);
        });
    }
    
    // Sort forms
    const sortFilter = document.getElementById("sort-filter");
    if (sortFilter) {
        sortFilter.addEventListener("change", function() {
            window.formsState.filter.sort = this.value;
            const filteredForms = applyFilters(window.formsState.forms);
            renderForms(filteredForms);
        });
    }
    
    // Pagination
    const prevPageBtn = document.getElementById("prev-page");
    const nextPageBtn = document.getElementById("next-page");
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener("click", function() {
            if (window.formsState.currentPage > 1) {
                window.formsState.currentPage--;
                const filteredForms = applyFilters(window.formsState.forms);
                renderForms(filteredForms);
            }
        });
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener("click", function() {
            if (window.formsState.currentPage < window.formsState.totalPages) {
                window.formsState.currentPage++;
                const filteredForms = applyFilters(window.formsState.forms);
                renderForms(filteredForms);
            }
        });
    }
    
    // Form actions (more button)
    document.addEventListener("click", function(e) {
        if (e.target.closest(".more-actions-btn")) {
            const formId = e.target.closest(".more-actions-btn").dataset.id;
            openFormActionsModal(formId);
        }
    });
    
    // Close modals
    document.querySelectorAll(".modal-close").forEach(btn => {
        btn.addEventListener("click", function() {
            closeAllModals();
        });
    });
    
    // Form actions modal
    setupFormActionsModal();
    
    // Share form modal
    setupShareFormModal();
    
    // Delete confirmation modal
    setupDeleteConfirmModal();
}

function openFormActionsModal(formId) {
    const modal = document.getElementById("form-actions-modal");
    if (!modal) return;
    
    // Store the form ID in the modal
    modal.dataset.formId = formId;
    
    // Find the form
    const form = window.formsState.forms.find(f => f._id === formId);
    
    // Update toggle status text
    const toggleStatusEl = document.getElementById("toggle-status");
    if (toggleStatusEl) {
        toggleStatusEl.textContent = form.is_active ? "Deactivate Form" : "Activate Form";
    }
    
    // Show the modal
    modal.classList.add("active");
}

function closeAllModals() {
    document.querySelectorAll(".modal").forEach(modal => {
        modal.classList.remove("active");
    });
}

function setupFormActionsModal() {
    const modal = document.getElementById("form-actions-modal");
    if (!modal) return;
    
    // View form
    const viewFormBtn = document.getElementById("view-form");
    if (viewFormBtn) {
        viewFormBtn.addEventListener("click", function(e) {
            e.preventDefault();
            const formId = modal.dataset.formId;
            const form = window.formsState.forms.find(f => f._id === formId);
            
            // Open the form in a new tab
            window.open(`${window.location.origin}/f/${form.slug}`, "_blank");
            
            closeAllModals();
        });
    }
    
    // Edit form
    const editFormBtn = document.getElementById("edit-form");
    if (editFormBtn) {
        editFormBtn.addEventListener("click", function(e) {
            e.preventDefault();
            const formId = modal.dataset.formId;
            window.location.href = `edit-form.html?id=${formId}`;
        });
    }
    
    // Duplicate form
    const duplicateFormBtn = document.getElementById("duplicate-form");
    if (duplicateFormBtn) {
        duplicateFormBtn.addEventListener("click", async function(e) {
            e.preventDefault();
            const formId = modal.dataset.formId;
            const token = localStorage.getItem("token");
            
            try {
                const response = await fetch(`${API_URL}/forms/${formId}/duplicate`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error("Failed to duplicate form");
                }
                
                // Reload forms
                await loadForms(token);
                closeAllModals();
                
            } catch (error) {
                console.error("Error duplicating form:", error);
                alert("Failed to duplicate form. Please try again.");
            }
        });
    }
    
    // Share form
    const shareFormBtn = document.getElementById("share-form");
    if (shareFormBtn) {
        shareFormBtn.addEventListener("click", function(e) {
            e.preventDefault();
            const formId = modal.dataset.formId;
            openShareFormModal(formId);
        });
    }
    
    // View responses
    const viewResponsesBtn = document.getElementById("view-responses");
    if (viewResponsesBtn) {
        viewResponsesBtn.addEventListener("click", function(e) {
            e.preventDefault();
            const formId = modal.dataset.formId;
            window.location.href = `responses.html?formId=${formId}`;
        });
    }
    
    // Toggle status
    const toggleStatusBtn = document.getElementById("toggle-status");
    if (toggleStatusBtn) {
        toggleStatusBtn.addEventListener("click", async function(e) {
            e.preventDefault();
            const formId = modal.dataset.formId;
            const token = localStorage.getItem("token");
            
            try {
                const response = await fetch(`${API_URL}/forms/${formId}/toggle-status`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error("Failed to toggle form status");
                }
                
                // Reload forms
                await loadForms(token);
                closeAllModals();
                
            } catch (error) {
                console.error("Error toggling form status:", error);
                alert("Failed to update form status. Please try again.");
            }
        });
    }
    
    // Delete form
    const deleteFormBtn = document.getElementById("delete-form");
    if (deleteFormBtn) {
        deleteFormBtn.addEventListener("click", function(e) {
            e.preventDefault();
            const formId = modal.dataset.formId;
            openDeleteConfirmModal(formId);
        });
    }
}

function openShareFormModal(formId) {
    const shareModal = document.getElementById("share-form-modal");
    const formActionsModal = document.getElementById("form-actions-modal");
    
    if (!shareModal) return;
    
    // Hide form actions modal
    if (formActionsModal) {
        formActionsModal.classList.remove("active");
    }
    
    // Find the form
    const form = window.formsState.forms.find(f => f._id === formId);
    
    // Set form link
    const formLinkInput = document.getElementById("form-link");
    if (formLinkInput) {
        const formUrl = `${window.location.origin}/f/${form.slug}`;
        formLinkInput.value = formUrl;
    }
    
    // Set custom URL input
    const customUrlInput = document.getElementById("custom-url");
    if (customUrlInput) {
        customUrlInput.value = form.custom_slug || "";
    }
    
    // Set embed code
    const embedCodeInput = document.getElementById("embed-code");
    if (embedCodeInput) {
        const embedCode = `<iframe src="${window.location.origin}/f/${form.slug}" width="100%" height="600" frameborder="0"></iframe>`;
        embedCodeInput.value = embedCode;
    }
    
    // Store form ID in modal
    shareModal.dataset.formId = formId;
    
    // Show share modal
    shareModal.classList.add("active");
}

function setupShareFormModal() {
    const modal = document.getElementById("share-form-modal");
    if (!modal) return;
    
    // Copy form link
    const copyLinkBtn = document.getElementById("copy-link");
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener("click", function() {
            const formLinkInput = document.getElementById("form-link");
            if (formLinkInput) {
                formLinkInput.select();
                document.execCommand("copy");
                
                // Show copied feedback
                const originalText = this.textContent;
                this.textContent = "Copied!";
                setTimeout(() => {
                    this.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
                }, 2000);
            }
        });
    }
    
    // Copy embed code
    const copyEmbedBtn = document.getElementById("copy-embed");
    if (copyEmbedBtn) {
        copyEmbedBtn.addEventListener("click", function() {
            const embedCodeInput = document.getElementById("embed-code");
            if (embedCodeInput) {
                embedCodeInput.select();
                document.execCommand("copy");
                
                // Show copied feedback
                const originalText = this.textContent;
                this.textContent = "Copied!";
                setTimeout(() => {
                    this.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy`;
                }, 2000);
            }
        });
    }
    
    // Save custom URL
    const saveCustomUrlBtn = document.getElementById("save-custom-url");
    if (saveCustomUrlBtn) {
        saveCustomUrlBtn.addEventListener("click", async function() {
            const customUrlInput = document.getElementById("custom-url");
            if (!customUrlInput) return;
            
            const customSlug = customUrlInput.value.trim();
            const formId = modal.dataset.formId;
            const token = localStorage.getItem("token");
            
            try {
                // Get current form data
                const form = window.formsState.forms.find(f => f._id === formId);
                
                // Update form with custom slug
                const response = await fetch(`${API_URL}/forms/${formId}`, {
                    method: "PUT",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        ...form,
                        custom_slug: customSlug
                    })
                });
                
                if (!response.ok) {
                    throw new Error("Failed to update custom URL");
                }
                
                // Update form link input with new URL
                const formLinkInput = document.getElementById("form-link");
                if (formLinkInput) {
                    const updatedForm = await response.json();
                    const formUrl = `${window.location.origin}/f/${updatedForm.slug}`;
                    formLinkInput.value = formUrl;
                }
                
                // Show success feedback
                const originalText = this.textContent;
                this.textContent = "Saved!";
                setTimeout(() => {
                    this.textContent = originalText;
                }, 2000);
                
                // Reload forms
                await loadForms(token);
                
            } catch (error) {
                console.error("Error updating custom URL:", error);
                alert("Failed to update custom URL. It may already be in use.");
            }
        });
    }
    
    // Share via email
    const shareEmailBtn = document.getElementById("share-email");
    if (shareEmailBtn) {
        shareEmailBtn.addEventListener("click", function() {
            const formLinkInput = document.getElementById("form-link");
            if (formLinkInput) {
                const form = window.formsState.forms.find(f => f._id === modal.dataset.formId);
                const subject = encodeURIComponent(`Please fill out this form: ${form.title}`);
                const body = encodeURIComponent(`Please fill out this form:\n\n${formLinkInput.value}\n\nThank you!`);
                window.open(`mailto:?subject=${subject}&body=${body}`);
            }
        });
    }
    
    // Share via social media
    const shareSocialBtns = {
        twitter: document.getElementById("share-twitter"),
        facebook: document.getElementById("share-facebook"),
        linkedin: document.getElementById("share-linkedin")
    };
    
    if (shareSocialBtns.twitter) {
        shareSocialBtns.twitter.addEventListener("click", function() {
            const formLinkInput = document.getElementById("form-link");
            if (formLinkInput) {
                const form = window.formsState.forms.find(f => f._id === modal.dataset.formId);
                const text = encodeURIComponent(`Please fill out this form: ${form.title}`);
                const url = encodeURIComponent(formLinkInput.value);
                window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`);
            }
        });
    }
    
    if (shareSocialBtns.facebook) {
        shareSocialBtns.facebook.addEventListener("click", function() {
            const formLinkInput = document.getElementById("form-link");
            if (formLinkInput) {
                const url = encodeURIComponent(formLinkInput.value);
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`);
            }
        });
    }
    
    if (shareSocialBtns.linkedin) {
        shareSocialBtns.linkedin.addEventListener("click", function() {
            const formLinkInput = document.getElementById("form-link");
            if (formLinkInput) {
                const form = window.formsState.forms.find(f => f._id === modal.dataset.formId);
                const title = encodeURIComponent(form.title);
                const url = encodeURIComponent(formLinkInput.value);
                window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${title}`);
            }
        });
    }
}

function openDeleteConfirmModal(formId) {
    const deleteModal = document.getElementById("delete-confirm-modal");
    const formActionsModal = document.getElementById("form-actions-modal");
    
    if (!deleteModal) return;
    
    // Hide form actions modal
    if (formActionsModal) {
        formActionsModal.classList.remove("active");
    }
    
    // Store form ID in modal
    deleteModal.dataset.formId = formId;
    
    // Show delete confirm modal
    deleteModal.classList.add("active");
}

function setupDeleteConfirmModal() {
    const modal = document.getElementById("delete-confirm-modal");
    if (!modal) return;
    
    // Cancel delete
    const cancelBtn = document.getElementById("cancel-delete");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", function() {
            closeAllModals();
        });
    }
    
    // Confirm delete
    const confirmBtn = document.getElementById("confirm-delete");
    if (confirmBtn) {
        confirmBtn.addEventListener("click", async function() {
            const formId = modal.dataset.formId;
            const token = localStorage.getItem("token");
            
            try {
                const response = await fetch(`${API_URL}/forms/${formId}`, {
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error("Failed to delete form");
                }
                
                // Reload forms
                await loadForms(token);
                closeAllModals();
                
            } catch (error) {
                console.error("Error deleting form:", error);
                alert("Failed to delete form. Please try again.");
            }
        });
    }
}

// Utility function for debouncing
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}