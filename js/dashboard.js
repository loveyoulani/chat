document.addEventListener("DOMContentLoaded", async function() {
    // Initialize sidebar functionality
    initSidebar();
    
    // Initialize user dropdown
    initUserDropdown();
    
    const token = localStorage.getItem("token");
    
    if (!token) {
        window.location.href = "login.html";
        return;
    }
    
    try {
        // Fetch dashboard summary data
        const [forms, responses] = await Promise.all([
            fetchForms(token),
            fetchResponses(token)
        ]);
        
        // Update dashboard summary
        updateDashboardSummary(forms, responses);
        
        // Update recent forms list
        updateRecentForms(forms);
        
        // Update recent responses list
        updateRecentResponses(responses);
        
    } catch (error) {
        console.error("Error loading dashboard data:", error);
    }
});

// Initialize sidebar functionality
function initSidebar() {
    // Dropdown menu functionality
    const dropdownItems = document.querySelectorAll('.sidebar-nav ul li.has-dropdown > a');
    
    dropdownItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const parent = this.parentElement;
            parent.classList.toggle('active');
        });
    });
    
    // Mobile sidebar toggle
    const mobileToggle = document.querySelector('.mobile-sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (mobileToggle) {
        mobileToggle.addEventListener('click', function() {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            document.body.classList.toggle('sidebar-open');
        });
    }
    
    // Close sidebar when clicking overlay
    if (overlay) {
        overlay.addEventListener('click', function() {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        });
    }
    
    // Existing sidebar toggle button
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        });
    }
}

// Initialize user dropdown
function initUserDropdown() {
    const userDropdownToggle = document.querySelector('.user-dropdown-toggle');
    const userDropdownMenu = document.querySelector('.user-dropdown-menu');
    
    if (userDropdownToggle && userDropdownMenu) {
        userDropdownToggle.addEventListener('click', function() {
            userDropdownMenu.classList.toggle('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {
            if (!userDropdownToggle.contains(event.target) && !userDropdownMenu.contains(event.target)) {
                userDropdownMenu.classList.remove('active');
            }
        });
    }
    
    // Logout functionality
    const logoutBtns = document.querySelectorAll('#logout-btn, #dropdown-logout');
    logoutBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = 'login.html';
            });
        }
    });
}

async function fetchForms(token) {
    const response = await fetch(`${API_URL}/forms`, {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    });
    
    if (!response.ok) {
        throw new Error("Failed to fetch forms");
    }
    
    return await response.json();
}

async function fetchResponses(token) {

    let allResponses = [];
    
    const forms = await fetchForms(token);
    
    for (const form of forms.slice(0, 5)) { // Limit to first 5 forms for performance
        const response = await fetch(`${API_URL}/forms/${form._id}/responses`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const formResponses = await response.json();
            formResponses.forEach(r => {
                r.formTitle = form.title; // Add form title to each response
                r.formId = form._id;
            });
            allResponses = allResponses.concat(formResponses);
        }
    }
    
    // Sort by date, newest first
    allResponses.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return allResponses;
}

function updateDashboardSummary(forms, responses) {
    const totalForms = document.getElementById("total-forms");
    const totalResponses = document.getElementById("total-responses");
    const responseRate = document.getElementById("response-rate");
    const activeForms = document.getElementById("active-forms");
    
    if (totalForms) totalForms.textContent = forms.length;
    if (totalResponses) totalResponses.textContent = responses.length;
    
    // Calculate response rate
    const totalPossibleResponses = forms.reduce((sum, form) => sum + (form.max_responses || 100), 0);
    const rate = totalPossibleResponses > 0 
        ? Math.round((responses.length / totalPossibleResponses) * 100) 
        : 0;
    
    if (responseRate) responseRate.textContent = `${rate}%`;
    
    // Count active forms
    const activeCount = forms.filter(form => form.is_active).length;
    if (activeForms) activeForms.textContent = activeCount;
}

function updateRecentForms(forms) {
    const recentFormsList = document.getElementById("recent-forms-list");
    
    if (!recentFormsList) return;
    
    if (forms.length === 0) {
        // Show empty state if no forms
        return;
    }
    
    // Clear empty state
    recentFormsList.innerHTML = '';
    
    // Show up to 5 most recent forms
    forms.slice(0, 5).forEach(form => {
        const formElement = document.createElement('div');
        formElement.className = 'recent-form-item';
        
        const formDate = new Date(form.created_at);
        const formattedDate = formDate.toLocaleDateString();
        
        formElement.innerHTML = `
            <div class="recent-form-header">
                <h3 class="recent-form-title">${form.title}</h3>
                <span class="form-card-status ${form.is_active ? 'active' : 'inactive'}">
                    ${form.is_active ? 'Active' : 'Inactive'}
                </span>
            </div>
            <div class="recent-form-meta">
                <span class="recent-form-date">Created on ${formattedDate}</span>
                <span class="recent-form-responses">${form.response_count} responses</span>
            </div>
            <div class="recent-form-actions">
                <a href="edit-form.html?id=${form._id}" class="btn btn-small btn-outline">Edit</a>
                <a href="responses.html?formId=${form._id}" class="btn btn-small btn-outline">View Responses</a>
            </div>
        `;
        
        recentFormsList.appendChild(formElement);
    });
}

function updateRecentResponses(responses) {
    const recentResponsesList = document.getElementById("recent-responses-list");
    
    if (!recentResponsesList) return;
    
    if (responses.length === 0) {
        // Show empty state if no responses
        return;
    }
    
    // Clear empty state
    recentResponsesList.innerHTML = '';
    
    // Show up to 5 most recent responses
    responses.slice(0, 5).forEach(response => {
        const responseElement = document.createElement('div');
        responseElement.className = 'recent-response-item';
        
        const responseDate = new Date(response.created_at);
        const formattedDate = responseDate.toLocaleDateString();
        const formattedTime = responseDate.toLocaleTimeString();
        
        // Get a sample answer from the response
        const sampleAnswer = Object.values(response.answers)[0] || 'No answer';
        const displayAnswer = typeof sampleAnswer === 'string' 
            ? sampleAnswer.substring(0, 30) + (sampleAnswer.length > 30 ? '...' : '')
            : 'Multiple choice answer';
        
        responseElement.innerHTML = `
            <div class="recent-response-header">
                <h3 class="recent-response-title">${response.formTitle}</h3>
                <span class="recent-response-date">${formattedDate} at ${formattedTime}</span>
            </div>
            <div class="recent-response-preview">
                <p>${displayAnswer}</p>
            </div>
            <div class="recent-response-actions">
                <a href="response-details.html?formId=${response.formId}&responseId=${response._id}" class="btn btn-small btn-outline">View Details</a>
            </div>
        `;
        
        recentResponsesList.appendChild(responseElement);
    });
}