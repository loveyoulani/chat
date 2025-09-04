document.addEventListener("DOMContentLoaded", async function() {
    const token = localStorage.getItem("token");
    
    if (!token) {
        window.location.href = "login.html";
        return;
    }
    
    // Get form ID and response ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const formId = urlParams.get("formId");
    const responseId = urlParams.get("responseId");
    
    if (!formId || !responseId) {
        showNotification("Missing form ID or response ID", "error");
        setTimeout(() => {
            window.location.href = "responses.html";
        }, 2000);
        return;
    }
    
    // Initialize state
    window.responseDetailsState = {
        form: null,
        response: null,
        fileDownloads: {}
    };
    
    try {
        // Show loading indicator
        showLoadingIndicator();
        
        // Fetch form details
        await loadForm(token, formId);
        
        // Fetch response details
        await loadResponse(token, formId, responseId);
        
        // Set up event listeners
        setupEventListeners();
        
        // Hide loading indicator
        hideLoadingIndicator();
        
    } catch (error) {
        console.error("Error loading response details:", error);
        showNotification("Failed to load response details. Please try again.", "error");
        hideLoadingIndicator();
    }
});

async function loadForm(token, formId) {
    try {
        const response = await fetch(`${API_URL}/forms/${formId}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error("Failed to fetch form details");
        }
        
        const form = await response.json();
        window.responseDetailsState.form = form;
        
        // Update page title
        document.title = `Response Details - ${form.title} | FlyForms`;
        
        // Update form title
        const formTitleEl = document.getElementById("form-title");
        if (formTitleEl) {
            formTitleEl.textContent = `Response - ${form.title}`;
        }
        
    } catch (error) {
        console.error("Error fetching form details:", error);
        throw error;
    }
}

async function loadResponse(token, formId, responseId) {
    try {
        // Since the specific endpoint doesn't exist, we'll fetch all responses and find the one we need
        const response = await fetch(`${API_URL}/forms/${formId}/responses`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error("Failed to fetch responses");
        }
        
        const allResponses = await response.json();
        
        // Find the specific response by ID
        const responseData = allResponses.find(resp => resp._id === responseId);
        
        if (!responseData) {
            throw new Error("Response not found");
        }
        
        window.responseDetailsState.response = responseData;
        
        // Process file data
        processFileData(responseData);
        
        // Render response details
        renderResponseDetails(responseData);
        
    } catch (error) {
        console.error("Error fetching response details:", error);
        throw error;
    }
}

function processFileData(response) {
    // Process file URLs and metadata
    const fileDownloads = {};
    
    if (window.responseDetailsState.form && window.responseDetailsState.form.questions) {
        // Find file upload questions
        const fileQuestions = window.responseDetailsState.form.questions.filter(q => q.type === 'file');
        
        if (fileQuestions.length > 0) {
            fileQuestions.forEach(question => {
                const fileData = response.answers[question.id];
                if (fileData && fileData.file_id) {
                    // Store file download info
                    const fileKey = `${response._id}_${question.id}`;
                    fileDownloads[fileKey] = {
                        url: `${API_URL}/files/${fileData.file_id}`,
                        filename: fileData.filename || 'downloaded_file',
                        contentType: fileData.content_type || 'application/octet-stream',
                        size: fileData.size || 0
                    };
                }
            });
        }
    }
    
    window.responseDetailsState.fileDownloads = fileDownloads;
}

function renderResponseDetails(response) {
    const responseDate = document.getElementById("response-date");
    const responseId = document.getElementById("response-id");
    const responseContent = document.getElementById("response-content");
    
    if (!responseDate || !responseId || !responseContent || !window.responseDetailsState.form) {
        return;
    }
    
    // Format date
    const date = new Date(response.created_at);
    const formattedDate = date.toLocaleDateString() + ' ' + 
                         date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Update meta information
    responseDate.textContent = formattedDate;
    responseId.textContent = response._id;
    
    // Clear existing content
    responseContent.innerHTML = '';
    
    // Add each question and answer
    window.responseDetailsState.form.questions.forEach(question => {
        const answer = response.answers[question.id];
        
        const questionElement = document.createElement('div');
        questionElement.className = 'response-question';
        
        // Question title
        const titleElement = document.createElement('div');
        titleElement.className = 'question-title';
        titleElement.textContent = question.title;
        questionElement.appendChild(titleElement);
        
        // Answer content based on question type
        const answerElement = document.createElement('div');
        
        if (answer === undefined || answer === null) {
            answerElement.className = 'question-answer no-answer';
            answerElement.textContent = 'Not answered';
        } else {
            answerElement.className = 'question-answer';
            
            // Render answer based on question type
            switch (question.type) {
                case 'multiple_choice':
                    answerElement.className = 'choice-answer';
                    // Get the label for the selected value
                    let displayAnswer = answer;
                    if (question.options) {
                        const selectedOption = question.options.find(opt => opt.value === answer);
                        if (selectedOption) {
                            displayAnswer = selectedOption.label;
                        }
                    }
                    
                    const choiceItem = document.createElement('div');
                    choiceItem.className = 'choice-item';
                    choiceItem.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                        ${displayAnswer}
                    `;
                    answerElement.appendChild(choiceItem);
                    break;
                    
                case 'checkbox':
                    answerElement.className = 'choice-answer';
                    if (Array.isArray(answer)) {
                        answer.forEach(item => {
                            // Get the label for the selected value
                            let displayItem = item;
                            if (question.options) {
                                const selectedOption = question.options.find(opt => opt.value === item);
                                if (selectedOption) {
                                    displayItem = selectedOption.label;
                                }
                            }
                            
                            const checkItem = document.createElement('div');
                            checkItem.className = 'choice-item';
                            checkItem.innerHTML = `
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                                ${displayItem}
                            `;
                            answerElement.appendChild(checkItem);
                        });
                    } else {
                        // Handle case where checkbox answer is not an array
                        // Get the label for the selected value
                        let displayItem = answer;
                        if (question.options) {
                            const selectedOption = question.options.find(opt => opt.value === answer);
                            if (selectedOption) {
                                displayItem = selectedOption.label;
                            }
                        }
                        
                        const checkItem = document.createElement('div');
                        checkItem.className = 'choice-item';
                        checkItem.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                            ${displayItem}
                        `;
                        answerElement.appendChild(checkItem);
                    }
                    break;
                    
                case 'rating':
                case 'scale':
                    answerElement.className = 'rating-answer';
                    answerElement.innerHTML = `
                        <span class="rating-value">${answer}</span>
                        <span class="rating-scale">/ ${question.max_value || 5}</span>
                    `;
                    break;
                    
                case 'file':
                    answerElement.className = 'response-files';
                    if (typeof answer === 'object' && answer.file_id) {
                        const fileKey = `${response._id}_${question.id}`;
                        const fileInfo = window.responseDetailsState.fileDownloads[fileKey];
                        
                        if (fileInfo) {
                            // Format file size
                            const fileSize = formatFileSize(fileInfo.size);
                            
                            answerElement.innerHTML = `
                                <div class="file-preview">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                    <div>
                                        <a href="${fileInfo.url}" target="_blank" class="file-download-link" data-key="${fileKey}">${fileInfo.filename}</a>
                                        <div class="file-meta">${fileSize}</div>
                                    </div>
                                </div>
                            `;
                        } else {
                            answerElement.innerHTML = `
                                <div class="file-preview">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                    <div>File uploaded</div>
                                </div>
                            `;
                        }
                    } else {
                        answerElement.innerHTML = `<div class="no-file">No file uploaded</div>`;
                    }
                    break;
                    
                case 'dropdown':
                    answerElement.className = 'dropdown-answer';
                    // Get the label for the selected value
                    let dropdownValue = answer;
                    if (question.options) {
                        const selectedOption = question.options.find(opt => opt.value === answer);
                        if (selectedOption) {
                            dropdownValue = selectedOption.label;
                        }
                    }
                    
                    answerElement.innerHTML = `
                        <div class="selected-option">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            ${dropdownValue}
                        </div>
                    `;
                    break;
                    
                default:
                    // For text, paragraph, email, etc.
                    answerElement.textContent = answer;
            }
        }
        
        questionElement.appendChild(answerElement);
        responseContent.appendChild(questionElement);
    });
}

function setupEventListeners() {
    // Mobile sidebar toggle
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            document.querySelector('.sidebar').classList.toggle('active');
        });
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        });
    }
    
    // Back to responses button
    const backToResponsesBtn = document.getElementById('back-to-responses');
    if (backToResponsesBtn) {
        backToResponsesBtn.addEventListener('click', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const formId = urlParams.get("formId");
            
            if (formId) {
                window.location.href = `responses.html?formId=${formId}`;
            } else {
                window.location.href = "responses.html";
            }
        });
    }
    
    // Delete response button
    const deleteResponseBtn = document.getElementById('delete-response');
    if (deleteResponseBtn) {
        deleteResponseBtn.addEventListener('click', function() {
            openDeleteConfirmModal();
        });
    }
    
    // File download links
    document.addEventListener('click', function(e) {
        if (e.target.closest('.file-download-link')) {
            e.preventDefault();
            const link = e.target.closest('.file-download-link');
            const fileKey = link.dataset.key;
            downloadFile(fileKey);
        }
    });
    
    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', function() {
            closeAllModals();
        });
    });
    
    // Delete confirmation modal
    setupDeleteConfirmModal();
}

function downloadFile(fileKey) {
    const fileInfo = window.responseDetailsState.fileDownloads[fileKey];
    if (!fileInfo || !fileInfo.url) {
        showNotification("File information not available", "error");
        return;
    }
    
    // Open the file URL in a new tab
    window.open(fileInfo.url, '_blank');
}

function openDeleteConfirmModal() {
    const deleteModal = document.getElementById("delete-confirm-modal");
    
    if (!deleteModal) return;
    
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
            const token = localStorage.getItem("token");
            const urlParams = new URLSearchParams(window.location.search);
            const formId = urlParams.get("formId");
            const responseId = urlParams.get("responseId");
            
            if (!formId || !responseId) {
                showNotification("Missing form ID or response ID", "error");
                return;
            }
            
            try {
                showLoadingIndicator();
                
                // Since there's no specific endpoint to delete a single response,
                // we'll need to get creative. We'll use a workaround by notifying the user
                // that this functionality requires backend implementation
                showNotification("This feature requires backend implementation. Redirecting to responses page...", "warning");
                
                hideLoadingIndicator();
                
                // Redirect back to responses page after a short delay
                setTimeout(() => {
                    window.location.href = `responses.html?formId=${formId}`;
                }, 2000);
                
            } catch (error) {
                hideLoadingIndicator();
                console.error("Error deleting response:", error);
                showNotification("Failed to delete response: " + error.message, "error");
            }
        });
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal").forEach(modal => {
        modal.classList.remove("active");
    });
}

function formatFileSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showNotification(message, type = "info") {
    const container = document.getElementById("notification-container");
    if (!container) return;
    
    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        notification.style.opacity = "0";
        notification.style.transform = "translateX(100%)";
        
        // Remove from DOM after animation completes
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

function showLoadingIndicator() {
    const loadingOverlay = document.getElementById("loading-overlay");
    if (loadingOverlay) {
        loadingOverlay.classList.add("active");
    }
}

function hideLoadingIndicator() {
    const loadingOverlay = document.getElementById("loading-overlay");
    if (loadingOverlay) {
        loadingOverlay.classList.remove("active");
    }
}

// Handle clicks outside modals to close them
window.addEventListener('click', function(event) {
    document.querySelectorAll('.modal.active').forEach(modal => {
        if (event.target === modal) {
            closeAllModals();
        }
    });
});

// Add escape key listener to close modals
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeAllModals();
    }
});
