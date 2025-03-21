document.addEventListener("DOMContentLoaded", async function() {
    const token = localStorage.getItem("token");
    
    if (!token) {
        window.location.href = "login.html";
        return;
    }
    
    // Get form ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const formId = urlParams.get("formId");
    
    if (!formId) {
        // If no form ID provided, redirect to forms page
        window.location.href = "forms.html";
        return;
    }
    
    // Initialize state
    window.responsesState = {
        form: null,
        responses: [],
        currentPage: 1,
        totalPages: 1,
        itemsPerPage: 10,
        currentView: "table", // table or individual
        currentResponseIndex: 0,
        filter: {
            dateRange: "all",
            search: ""
        }
    };
    
    try {
        // Fetch form details
        await loadForm(token, formId);
        
        // Fetch responses
        await loadResponses(token, formId);
        
        // Set up event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error("Error loading responses:", error);
        showErrorMessage("Failed to load responses. Please try again.");
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
        window.responsesState.form = form;
        
        // Update UI with form details
        updateFormDetails(form);
        
    } catch (error) {
        console.error("Error fetching form details:", error);
        throw error;
    }
}

async function loadResponses(token, formId) {
    try {
        const response = await fetch(`${API_URL}/forms/${formId}/responses`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error("Failed to fetch responses");
        }
        
        const responses = await response.json();
        window.responsesState.responses = responses;
        
        // Update stats
        updateResponseStats(responses);
        
        // Apply filters and render
        const filteredResponses = applyFilters(responses);
        renderResponses(filteredResponses);
        
    } catch (error) {
        console.error("Error fetching responses:", error);
        throw error;
    }
}

function updateFormDetails(form) {
    // Update page title
    document.title = `${form.title} - Responses | FlyForms`;
    
    // Update form title and meta
    const formTitleEl = document.getElementById("form-title");
    const formMetaEl = document.getElementById("form-meta");
    
    if (formTitleEl) formTitleEl.textContent = form.title;
    
    if (formMetaEl) {
        const createdDate = new Date(form.created_at).toLocaleDateString();
        formMetaEl.textContent = `Created on ${createdDate} • ${form.response_count} responses`;
    }
    
    // Update back to form button
    const backToFormBtn = document.getElementById("back-to-form");
    if (backToFormBtn) {
        backToFormBtn.addEventListener("click", function() {
            window.location.href = `edit-form.html?id=${form._id}`;
        });
    }
}

function updateResponseStats(responses) {
    const totalResponsesEl = document.getElementById("total-responses");
    const completionRateEl = document.getElementById("completion-rate");
    const avgTimeEl = document.getElementById("avg-time");
    
    if (totalResponsesEl) {
        totalResponsesEl.textContent = responses.length;
    }
    
    if (completionRateEl) {
        // In a real app, you might track partial submissions vs complete submissions
        // For now, we'll assume all submissions are complete
        completionRateEl.textContent = responses.length > 0 ? "100%" : "0%";
    }
    
    if (avgTimeEl) {
        // This would require tracking time spent on the form
        // For now, just display placeholder
        avgTimeEl.textContent = "N/A";
    }
    
    // Update total responses in individual view navigation
    const totalResponsesNavEl = document.getElementById("total-responses-nav");
    if (totalResponsesNavEl) {
        totalResponsesNavEl.textContent = responses.length;
    }
}

function applyFilters(responses) {
    const { dateRange, search } = window.responsesState.filter;
    
    let filtered = [...responses];
    
    // Filter by date range
    if (dateRange !== "all") {
        const now = new Date();
        let startDate;
        
        switch (dateRange) {
            case "today":
                startDate = new Date(now.setHours(0, 0, 0, 0));
                break;
            case "week":
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - startDate.getDay());
                startDate.setHours(0, 0, 0, 0);
                break;
            case "month":
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            // Custom range would be handled separately with date pickers
        }
        
        if (startDate) {
            filtered = filtered.filter(response => {
                const responseDate = new Date(response.created_at);
                return responseDate >= startDate;
            });
        }
    }
    
    // Filter by search term
    if (search) {
        const searchLower = search.toLowerCase();
        filtered = filtered.filter(response => {
            // Search in all answer values
            for (const [questionId, answer] of Object.entries(response.answers)) {
                if (typeof answer === 'string' && answer.toLowerCase().includes(searchLower)) {
                    return true;
                } else if (Array.isArray(answer)) {
                    // Handle array answers (checkboxes, etc.)
                    for (const item of answer) {
                        if (typeof item === 'string' && item.toLowerCase().includes(searchLower)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        });
    }
    
    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return filtered;
}

function renderResponses(responses) {
    // Update pagination
    const totalItems = responses.length;
    window.responsesState.totalPages = Math.ceil(totalItems / window.responsesState.itemsPerPage);
    
    if (window.responsesState.currentPage > window.responsesState.totalPages && window.responsesState.totalPages > 0) {
        window.responsesState.currentPage = window.responsesState.totalPages;
    }
    
    updatePagination();
    
    // Show appropriate view based on current selection
    if (window.responsesState.currentView === "table") {
        renderTableView(responses);
    } else {
        renderIndividualView(responses);
    }
}

function renderTableView(responses) {
    const tableView = document.getElementById("responses-table-view");
    const individualView = document.getElementById("individual-view");
    const emptyResponses = document.getElementById("empty-responses");
    const tableBody = document.getElementById("table-body");
    const tableHeader = document.getElementById("table-header");
    
    // Show table view, hide individual view
    if (tableView) tableView.style.display = "block";
    if (individualView) individualView.style.display = "none";
    
    // If no responses, show empty state
    if (responses.length === 0) {
        if (emptyResponses) emptyResponses.style.display = "flex";
        if (tableBody) tableBody.innerHTML = "";
        return;
    }
    
    // Hide empty state
    if (emptyResponses) emptyResponses.style.display = "none";
    
    // Clear existing table
    if (tableBody) tableBody.innerHTML = "";
    
    // Set up table headers based on form questions
    if (tableHeader && window.responsesState.form) {
        // Start with basic headers
        let headerHTML = `
            <th>Response ID</th>
            <th>Submitted</th>
        `;
        
        // Add headers for each question (limit to first 3-5 questions to avoid overwhelming the table)
        const questions = window.responsesState.form.questions.slice(0, 4);
        questions.forEach(question => {
            headerHTML += `<th>${question.title}</th>`;
        });
        
        // Add actions column
        headerHTML += `<th>Actions</th>`;
        
        tableHeader.innerHTML = headerHTML;
    }
    
    // Calculate pagination
    const startIndex = (window.responsesState.currentPage - 1) * window.responsesState.itemsPerPage;
    const endIndex = Math.min(startIndex + window.responsesState.itemsPerPage, responses.length);
    const paginatedResponses = responses.slice(startIndex, endIndex);
    
    // Render table rows
    if (tableBody) {
        paginatedResponses.forEach((response, index) => {
            const row = document.createElement("tr");
            
            // Format date
            const responseDate = new Date(response.created_at);
            const formattedDate = responseDate.toLocaleDateString() + ' ' + 
                                 responseDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // Start with basic columns
            let rowHTML = `
                <td>${response._id.substring(0, 8)}...</td>
                <td><span class="response-date">${formattedDate}</span></td>
            `;
            
            // Add answers for each question in the header
            const questions = window.responsesState.form.questions.slice(0, 4);
            questions.forEach(question => {
                const answer = response.answers[question.id] || "";
                let displayAnswer = "";
                
                if (Array.isArray(answer)) {
                    // For multiple choice or checkbox answers
                    displayAnswer = answer.join(", ");
                } else if (typeof answer === "object") {
                    // For complex answers
                    displayAnswer = JSON.stringify(answer);
                } else {
                    // For simple answers
                    displayAnswer = answer.toString();
                }
                
                // Truncate long answers
                if (displayAnswer.length > 30) {
                    displayAnswer = displayAnswer.substring(0, 30) + "...";
                }
                
                rowHTML += `<td>${displayAnswer}</td>`;
            });
            
            // Add actions column
            rowHTML += `
                <td>
                    <div class="response-actions">
                        <button class="action-btn view-response" data-index="${startIndex + index}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </button>
                        <button class="action-btn edit-response" data-id="${response._id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="action-btn delete delete-response" data-id="${response._id}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                </td>
            `;
            
            row.innerHTML = rowHTML;
            tableBody.appendChild(row);
        });
    }
}

function renderIndividualView(responses) {
    const tableView = document.getElementById("responses-table-view");
    const individualView = document.getElementById("individual-view");
    
    // Show individual view, hide table view
    if (tableView) tableView.style.display = "none";
    if (individualView) individualView.style.display = "block";
    
    if (responses.length === 0) {
        if (individualView) {
            individualView.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <h3>No responses yet</h3>
                    <p>Share your form to start collecting responses</p>
                    <button id="share-form-btn" class="btn btn-primary">Share Form</button>
                </div>
            `;
            
            // Add event listener to share button
            const shareFormBtn = document.getElementById("share-form-btn");
            if (shareFormBtn) {
                shareFormBtn.addEventListener("click", function() {
                    openShareFormModal(window.responsesState.form._id);
                });
            }
        }
        return;
    }
    
    // If we have responses, show the current response
    if (window.responsesState.currentResponseIndex >= responses.length) {
        window.responsesState.currentResponseIndex = 0;
    }
    
    const currentResponse = responses[window.responsesState.currentResponseIndex];
    
    // Update navigation UI
    const prevBtn = document.getElementById("prev-response");
    const nextBtn = document.getElementById("next-response");
    const currentResponseEl = document.getElementById("current-response");
    
    if (prevBtn) prevBtn.disabled = window.responsesState.currentResponseIndex === 0;
    if (nextBtn) nextBtn.disabled = window.responsesState.currentResponseIndex === responses.length - 1;
    if (currentResponseEl) currentResponseEl.textContent = window.responsesState.currentResponseIndex + 1;
    
    // Update response details
    renderResponseDetails(currentResponse);
}

function renderResponseDetails(response) {
    const responseDate = document.getElementById("response-date");
    const responseId = document.getElementById("response-id");
    const responseContent = document.getElementById("response-content");
    
    if (!responseDate || !responseId || !responseContent || !window.responsesState.form) {
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
    window.responsesState.form.questions.forEach(question => {
        const answer = response.answers[question.id];
        
        if (answer === undefined || answer === null) {
            // Skip unanswered questions
            return;
        }
        
        const questionElement = document.createElement('div');
        questionElement.className = 'response-question';
        
        // Question title
        const titleElement = document.createElement('div');
        titleElement.className = 'question-title';
        titleElement.textContent = question.title;
        questionElement.appendChild(titleElement);
        
        // Answer content based on question type
        const answerElement = document.createElement('div');
        answerElement.className = 'question-answer';
        
        switch (question.type) {
            case 'multiple_choice':
                answerElement.className = 'choice-answer';
                // For multiple choice, answer is a single string
                const choiceItem = document.createElement('div');
                choiceItem.className = 'choice-item';
                choiceItem.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                    ${answer}
                `;
                answerElement.appendChild(choiceItem);
                break;
                
            case 'checkbox':
                answerElement.className = 'choice-answer';
                // For checkboxes, answer is an array of strings
                if (Array.isArray(answer)) {
                    answer.forEach(item => {
                        const checkItem = document.createElement('div');
                        checkItem.className = 'choice-item';
                        checkItem.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                            ${item}
                        `;
                        answerElement.appendChild(checkItem);
                    });
                }
                break;
                
            case 'rating':
            case 'scale':
                answerElement.className = 'rating-answer';
                // For ratings, we show the value and the scale
                answerElement.innerHTML = `
                    <span class="rating-value">${answer}</span>
                    <span class="rating-scale">/ ${question.max_value || 5}</span>
                `;
                break;
                
            case 'file':
                answerElement.className = 'response-files';
                // For files, we would show a link to download the file
                // This depends on how file uploads are handled in your API
                answerElement.innerHTML = `
                    <div class="file-preview">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <a href="${answer}" target="_blank">Download File</a>
                    </div>
                `;
                break;
                
            default:
                // For text, paragraph, email, etc.
                answerElement.textContent = answer;
        }
        
        questionElement.appendChild(answerElement);
        responseContent.appendChild(questionElement);
    });
}

function updatePagination() {
    const currentPageEl = document.getElementById("current-page");
    const totalPagesEl = document.getElementById("total-pages");
    const prevPageBtn = document.getElementById("prev-page");
    const nextPageBtn = document.getElementById("next-page");
    
    if (currentPageEl) currentPageEl.textContent = window.responsesState.currentPage;
    if (totalPagesEl) totalPagesEl.textContent = window.responsesState.totalPages;
    
    if (prevPageBtn) prevPageBtn.disabled = window.responsesState.currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = window.responsesState.currentPage >= window.responsesState.totalPages;
}

function setupEventListeners() {
    // View toggle
    const viewFilter = document.getElementById("view-filter");
    if (viewFilter) {
        viewFilter.addEventListener("change", function() {
            window.responsesState.currentView = this.value;
            const filteredResponses = applyFilters(window.responsesState.responses);
            renderResponses(filteredResponses);
        });
    }
    
    // Date range filter
    const dateFilter = document.getElementById("date-filter");
    if (dateFilter) {
        dateFilter.addEventListener("change", function() {
            window.responsesState.filter.dateRange = this.value;
            window.responsesState.currentPage = 1; // Reset to first page
            const filteredResponses = applyFilters(window.responsesState.responses);
            renderResponses(filteredResponses);
        });
    }
    
    // Search responses
    const searchInput = document.getElementById("search-responses");
    if (searchInput) {
        searchInput.addEventListener("input", debounce(function() {
            window.responsesState.filter.search = this.value;
            window.responsesState.currentPage = 1; // Reset to first page
            const filteredResponses = applyFilters(window.responsesState.responses);
            renderResponses(filteredResponses);
        }, 300));
    }
    
    // Pagination
    const prevPageBtn = document.getElementById("prev-page");
    const nextPageBtn = document.getElementById("next-page");
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener("click", function() {
            if (window.responsesState.currentPage > 1) {
                window.responsesState.currentPage--;
                const filteredResponses = applyFilters(window.responsesState.responses);
                renderResponses(filteredResponses);
            }
        });
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener("click", function() {
            if (window.responsesState.currentPage < window.responsesState.totalPages) {
                window.responsesState.currentPage++;
                const filteredResponses = applyFilters(window.responsesState.responses);
                renderResponses(filteredResponses);
            }
        });
    }
    
    // Individual view navigation
    const prevResponseBtn = document.getElementById("prev-response");
    const nextResponseBtn = document.getElementById("next-response");
    
    if (prevResponseBtn) {
        prevResponseBtn.addEventListener("click", function() {
            if (window.responsesState.currentResponseIndex > 0) {
                window.responsesState.currentResponseIndex--;
                const filteredResponses = applyFilters(window.responsesState.responses);
                renderIndividualView(filteredResponses);
            }
        });
    }
    
    if (nextResponseBtn) {
        nextResponseBtn.addEventListener("click", function() {
            const filteredResponses = applyFilters(window.responsesState.responses);
            if (window.responsesState.currentResponseIndex < filteredResponses.length - 1) {
                window.responsesState.currentResponseIndex++;
                renderIndividualView(filteredResponses);
            }
        });
    }
    
    // Export to CSV
    const exportCsvBtn = document.getElementById("export-csv");
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener("click", function() {
            exportResponsesToCSV();
        });
    }
    
    // Share form button
    const shareFormBtn = document.getElementById("share-form-btn");
    if (shareFormBtn) {
        shareFormBtn.addEventListener("click", function() {
            openShareFormModal(window.responsesState.form._id);
        });
    }
    
    // Table view actions
    document.addEventListener("click", function(e) {
        // View response
        if (e.target.closest(".view-response")) {
            const index = parseInt(e.target.closest(".view-response").dataset.index);
            openResponseModal(index);
        }
        
        // Edit response
        if (e.target.closest(".edit-response")) {
            const responseId = e.target.closest(".edit-response").dataset.id;
            window.location.href = `edit-response.html?formId=${window.responsesState.form._id}&responseId=${responseId}`;
        }
        
        // Delete response
        if (e.target.closest(".delete-response")) {
            const responseId = e.target.closest(".delete-response").dataset.id;
            openDeleteConfirmModal(responseId);
        }
    });
    
    // Modal close buttons
    document.querySelectorAll(".modal-close, #close-response-modal").forEach(btn => {
        btn.addEventListener("click", function() {
            closeAllModals();
        });
    });
    
    // Share form modal
    setupShareFormModal();
    
    // Delete confirmation modal
    setupDeleteConfirmModal();
}

function openResponseModal(index) {
    const filteredResponses = applyFilters(window.responsesState.responses);
    const response = filteredResponses[index];
    
    if (!response) return;
    
    const modal = document.getElementById("view-response-modal");
    const modalContent = document.getElementById("response-modal-content");
    
    if (!modal || !modalContent) return;
    
    // Store the response ID in the modal
    modal.dataset.responseId = response._id;
    
    // Clear existing content
    modalContent.innerHTML = '';
    
    // Response meta information
    const date = new Date(response.created_at);
    const formattedDate = date.toLocaleDateString() + ' ' + 
                         date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    const metaHTML = `
        <div class="response-meta">
            <div class="meta-item">
                <span class="meta-label">Submitted:</span>
                <span class="meta-value">${formattedDate}</span>
            </div>
            <div class="meta-item">
                <span class="meta-label">Response ID:</span>
                <span class="meta-value">${response._id}</span>
            </div>
        </div>
    `;
    
    modalContent.innerHTML = metaHTML;
    
    // Add each question and answer
    const responseContent = document.createElement('div');
    responseContent.className = 'response-content';
    
    window.responsesState.form.questions.forEach(question => {
        const answer = response.answers[question.id];
        
        if (answer === undefined || answer === null) {
            // Skip unanswered questions
            return;
        }
        
        const questionElement = document.createElement('div');
        questionElement.className = 'response-question';
        
        // Question title
        const titleElement = document.createElement('div');
        titleElement.className = 'question-title';
        titleElement.textContent = question.title;
        questionElement.appendChild(titleElement);
        
        // Answer content based on question type
        const answerElement = document.createElement('div');
        answerElement.className = 'question-answer';
        
        // Render answer based on question type (same as in renderResponseDetails)
        switch (question.type) {
            case 'multiple_choice':
                answerElement.className = 'choice-answer';
                const choiceItem = document.createElement('div');
                choiceItem.className = 'choice-item';
                choiceItem.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
                    ${answer}
                `;
                answerElement.appendChild(choiceItem);
                break;
                
            case 'checkbox':
                answerElement.className = 'choice-answer';
                if (Array.isArray(answer)) {
                    answer.forEach(item => {
                        const checkItem = document.createElement('div');
                        checkItem.className = 'choice-item';
                        checkItem.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                            ${item}
                        `;
                        answerElement.appendChild(checkItem);
                    });
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
                answerElement.innerHTML = `
                    <div class="file-preview">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <a href="${answer}" target="_blank">Download File</a>
                    </div>
                `;
                break;
                
            default:
                answerElement.textContent = answer;
        }
        
        questionElement.appendChild(answerElement);
        responseContent.appendChild(questionElement);
    });
    
    modalContent.appendChild(responseContent);
    
    // Show the modal
    modal.classList.add("active");
    
    // Set up delete button
    const deleteResponseBtn = document.getElementById("delete-response");
    if (deleteResponseBtn) {
        deleteResponseBtn.onclick = function() {
            closeAllModals();
            openDeleteConfirmModal(response._id);
        };
    }
}

function openShareFormModal(formId) {
    const shareModal = document.getElementById("share-form-modal");
    
    if (!shareModal) return;
    
    // Find the form
    const form = window.responsesState.form;
    
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
                const form = window.responsesState.form;
                
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
                    
                    // Update local form data
                    window.responsesState.form = updatedForm;
                }
                
                // Show success feedback
                const originalText = this.textContent;
                this.textContent = "Saved!";
                setTimeout(() => {
                    this.textContent = originalText;
                }, 2000);
                
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
                const form = window.responsesState.form;
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
                const form = window.responsesState.form;
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
                const form = window.responsesState.form;
                const title = encodeURIComponent(form.title);
                const url = encodeURIComponent(formLinkInput.value);
                window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${title}`);
            }
        });
    }
}

function openDeleteConfirmModal(responseId) {
    const deleteModal = document.getElementById("delete-confirm-modal");
    
    if (!deleteModal) return;
    
    // Store response ID in modal
    deleteModal.dataset.responseId = responseId;
    
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
            const responseId = modal.dataset.responseId;
            const token = localStorage.getItem("token");
            const formId = window.responsesState.form._id;
            
            try {
                const response = await fetch(`${API_URL}/forms/${formId}/responses/${responseId}`, {
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error("Failed to delete response");
                }
                
                // Remove the response from our local data
                window.responsesState.responses = window.responsesState.responses.filter(r => r._id !== responseId);
                
                // Update the UI
                const filteredResponses = applyFilters(window.responsesState.responses);
                renderResponses(filteredResponses);
                
                // Update form's response count
                window.responsesState.form.response_count = Math.max(0, window.responsesState.form.response_count - 1);
                updateFormDetails(window.responsesState.form);
                
                // Close the modal
                closeAllModals();
                
            } catch (error) {
                console.error("Error deleting response:", error);
                alert("Failed to delete response. Please try again.");
            }
        });
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal").forEach(modal => {
        modal.classList.remove("active");
    });
}

function exportResponsesToCSV() {
    if (!window.responsesState.form || !window.responsesState.responses.length) {
        alert("No responses to export");
        return;
    }
    
    // Get all responses (no pagination for export)
    const responses = window.responsesState.responses;
    const form = window.responsesState.form;
    
    // Create CSV header row
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Add basic headers
    let headers = ["Response ID", "Submission Date"];
    
    // Add a column for each question
    form.questions.forEach(question => {
        headers.push(question.title.replace(/,/g, " ")); // Remove commas from headers
    });
    
    csvContent += headers.join(",") + "\r\n";
    
    // Add each response as a row
    responses.forEach(response => {
        const date = new Date(response.created_at).toLocaleString();
        let row = [response._id, date];
        
        // Add answer for each question
        form.questions.forEach(question => {
            const answer = response.answers[question.id];
            let formattedAnswer = "";
            
            if (answer === undefined || answer === null) {
                formattedAnswer = "";
            } else if (Array.isArray(answer)) {
                formattedAnswer = answer.join("; ").replace(/,/g, ";"); // Replace commas with semicolons
            } else {
                formattedAnswer = String(answer).replace(/,/g, " "); // Remove commas from answers
            }
            
            // Wrap in quotes to handle multiline text
            formattedAnswer = `"${formattedAnswer}"`;
            row.push(formattedAnswer);
        });
        
        csvContent += row.join(",") + "\r\n";
    });
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${form.title}_responses_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up
    document.body.removeChild(link);
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

function showErrorMessage(message) {
    alert(message);
}