document.addEventListener("DOMContentLoaded", async function() {
    const token = localStorage.getItem("token");
    
    if (!token) {
        window.location.href = "login.html";
        return;
    }
    
    // Get form ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const formId = urlParams.get("formId");
    
    // If no form ID provided, show all responses instead of redirecting
    if (!formId) {
        // Load all forms and their responses
        loadAllResponses(token);
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
        currentChartIndex: 0,
        filter: {
            dateRange: "all",
            search: ""
        },
        charts: {}, // Store chart instances
        fileDownloads: {} // Store file download URLs
    };
    
    try {
        // Show loading indicator
        showLoadingIndicator();
        
        // Fetch form details
        await loadForm(token, formId);
        
        // Fetch responses
        await loadResponses(token, formId);
        
        // Set up event listeners
        setupEventListeners();
        
        // Hide loading indicator
        hideLoadingIndicator();
        
    } catch (error) {
        console.error("Error loading responses:", error);
        showNotification("Failed to load responses. Please try again.", "error");
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
        
        // Pre-process file data
        processFileData(responses);
        
        // Update stats
        updateResponseStats(responses);
        
        // Generate charts
        generateCharts(responses);
        
        // Apply filters and render
        const filteredResponses = applyFilters(responses);
        renderResponses(filteredResponses);
        
    } catch (error) {
        console.error("Error fetching responses:", error);
        throw error;
    }
}

function processFileData(responses) {
    // Process file URLs and metadata
    const fileDownloads = {};
    
    if (window.responsesState.form && window.responsesState.form.questions) {
        // Find file upload questions
        const fileQuestions = window.responsesState.form.questions.filter(q => q.type === 'file');
        
        if (fileQuestions.length > 0) {
            responses.forEach(response => {
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
            });
        }
    }
    
    window.responsesState.fileDownloads = fileDownloads;
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

function generateCharts(responses) {
    if (responses.length === 0) return;
    
    // Destroy existing charts to prevent memory leaks
    Object.values(window.responsesState.charts).forEach(chart => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
        }
    });
    
    window.responsesState.charts = {};
    
    // Generate responses over time chart
    generateTimeChart(responses);
    
    // Generate charts for each question
    generateQuestionCharts(responses);
    
    // Set up chart navigation
    setupChartNavigation();
}

function generateTimeChart(responses) {
    const ctx = document.getElementById('responses-chart');
    if (!ctx) return;
    
    // Group responses by date
    const dateGroups = {};
    
    // Get date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 29); // 30 days including today
    
    // Initialize all dates in the range
    for (let d = new Date(thirtyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        dateGroups[dateStr] = 0;
    }
    
    // Count responses by date
    responses.forEach(response => {
        const date = new Date(response.created_at);
        const dateStr = date.toISOString().split('T')[0];
        
        if (dateGroups[dateStr] !== undefined) {
            dateGroups[dateStr]++;
        }
    });
    
    // Prepare data for chart
    const labels = Object.keys(dateGroups).sort();
    const data = labels.map(date => dateGroups[date]);
    
    // Create the chart
    const timeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(date => {
                const d = new Date(date);
                return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            }),
            datasets: [{
                label: 'Responses',
                data: data,
                borderColor: '#3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#3B82F6',
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
    
    // Store chart instance
    window.responsesState.charts.timeChart = timeChart;
}

function generateQuestionCharts(responses) {
    if (!window.responsesState.form || !window.responsesState.form.questions) return;
    
    const chartsWrapper = document.getElementById('charts-wrapper');
    const chartIndicators = document.getElementById('chart-indicators');
    
    if (!chartsWrapper || !chartIndicators) return;
    
    // Clear containers
    chartsWrapper.innerHTML = '';
    chartIndicators.innerHTML = '';
    
    // Only create charts for certain question types
    const chartableQuestions = window.responsesState.form.questions.filter(q => 
        ['multiple_choice', 'checkbox', 'dropdown', 'rating', 'scale'].includes(q.type)
    );
    
    // Create charts for all chartable questions
    chartableQuestions.forEach((question, index) => {
        // Create chart container
        const chartDiv = document.createElement('div');
        chartDiv.className = 'chart-container';
        chartDiv.setAttribute('data-index', index);
        chartDiv.innerHTML = `
            <h3>${question.title}</h3>
            <canvas id="chart-${question.id}"></canvas>
        `;
        chartsWrapper.appendChild(chartDiv);
        
        // Create indicator
        const indicator = document.createElement('div');
        indicator.className = 'chart-indicator';
        indicator.setAttribute('data-index', index);
        if (index === 0) indicator.classList.add('active');
        chartIndicators.appendChild(indicator);
        
        // Generate chart based on question type
        switch (question.type) {
            case 'multiple_choice':
            case 'dropdown':
                createPieChart(question, responses);
                break;
            case 'checkbox':
                createBarChart(question, responses);
                break;
            case 'rating':
            case 'scale':
                createRatingChart(question, responses);
                break;
        }
    });
    
    // Show/hide navigation based on chart count
    const chartNav = document.querySelectorAll('.chart-nav');
    chartNav.forEach(nav => {
        nav.style.display = chartableQuestions.length > 1 ? 'flex' : 'none';
    });
    
    // Show/hide indicators based on chart count
    chartIndicators.style.display = chartableQuestions.length > 1 ? 'flex' : 'none';
    
    // Initialize scroll position
    window.responsesState.currentChartIndex = 0;
    scrollToCurrentChart();
}

function setupChartNavigation() {
    const prevBtn = document.getElementById('chart-prev');
    const nextBtn = document.getElementById('chart-next');
    const chartsWrapper = document.getElementById('charts-wrapper');
    const indicators = document.querySelectorAll('.chart-indicator');
    
    if (!prevBtn || !nextBtn || !chartsWrapper) return;
    
    // Previous chart button
    prevBtn.addEventListener('click', function() {
        const chartContainers = document.querySelectorAll('.chart-container');
        if (chartContainers.length <= 1) return;
        
        if (window.responsesState.currentChartIndex > 0) {
            window.responsesState.currentChartIndex--;
            scrollToCurrentChart();
            updateChartIndicators();
        }
    });
    
    // Next chart button
    nextBtn.addEventListener('click', function() {
        const chartContainers = document.querySelectorAll('.chart-container');
        if (chartContainers.length <= 1) return;
        
        if (window.responsesState.currentChartIndex < chartContainers.length - 1) {
            window.responsesState.currentChartIndex++;
            scrollToCurrentChart();
            updateChartIndicators();
        }
    });
    
    // Chart indicators click
    indicators.forEach(indicator => {
        indicator.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            window.responsesState.currentChartIndex = index;
            scrollToCurrentChart();
            updateChartIndicators();
        });
    });
    
    // Handle swipe on mobile
    let touchStartX = 0;
    let touchEndX = 0;
    
    chartsWrapper.addEventListener('touchstart', function(event) {
        touchStartX = event.changedTouches[0].screenX;
    });
    
    chartsWrapper.addEventListener('touchend', function(event) {
        touchEndX = event.changedTouches[0].screenX;
        handleSwipe();
    });
    
    function handleSwipe() {
        const chartContainers = document.querySelectorAll('.chart-container');
        if (chartContainers.length <= 1) return;
        
        const swipeThreshold = 50; // Minimum distance for swipe
        
        if (touchEndX < touchStartX - swipeThreshold) {
            // Swipe left - next chart
            if (window.responsesState.currentChartIndex < chartContainers.length - 1) {
                window.responsesState.currentChartIndex++;
                scrollToCurrentChart();
                updateChartIndicators();
            }
        }
        
        if (touchEndX > touchStartX + swipeThreshold) {
            // Swipe right - previous chart
            if (window.responsesState.currentChartIndex > 0) {
                window.responsesState.currentChartIndex--;
                scrollToCurrentChart();
                updateChartIndicators();
            }
        }
    }
}

function scrollToCurrentChart() {
    const chartsWrapper = document.getElementById('charts-wrapper');
    const chartContainers = document.querySelectorAll('.chart-container');
    
    if (!chartsWrapper || chartContainers.length === 0) return;
    
    const index = window.responsesState.currentChartIndex;
    if (index >= 0 && index < chartContainers.length) {
        const chartContainer = chartContainers[index];
        chartsWrapper.scrollTo({
            left: chartContainer.offsetLeft - chartsWrapper.offsetLeft,
            behavior: 'smooth'
        });
    }
}

function updateChartIndicators() {
    const indicators = document.querySelectorAll('.chart-indicator');
    const currentIndex = window.responsesState.currentChartIndex;
    
    indicators.forEach((indicator, index) => {
        if (index === currentIndex) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    });
}

function createPieChart(question, responses) {
    const ctx = document.getElementById(`chart-${question.id}`);
    if (!ctx) return;
    
    // Count responses for each option
    const counts = {};
    
    // Initialize counts for all options
    if (question.options) {
        question.options.forEach(option => {
            counts[option.label] = 0;
        });
    }
    
    // Count responses
    responses.forEach(response => {
        const answer = response.answers[question.id];
        if (answer) {
            // Get the label for the selected value
            let label = answer;
            if (question.options) {
                const option = question.options.find(opt => opt.value === answer);
                if (option) {
                    label = option.label;
                }
            }
            
            if (label) {
                counts[label] = (counts[label] || 0) + 1;
            }
        }
    });
    
    // Prepare chart data
    const labels = Object.keys(counts);
    const data = labels.map(label => counts[label]);
    
    // Create chart
    const pieChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(139, 92, 246, 0.7)',
                    'rgba(236, 72, 153, 0.7)',
                    'rgba(14, 165, 233, 0.7)',
                    'rgba(168, 85, 247, 0.7)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 15,
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
    
    // Store chart instance
    window.responsesState.charts[question.id] = pieChart;
}

function createBarChart(question, responses) {
    const ctx = document.getElementById(`chart-${question.id}`);
    if (!ctx) return;
    
    // Count responses for each option
    const counts = {};
    
    // Initialize counts for all options
    if (question.options) {
        question.options.forEach(option => {
            counts[option.label] = 0;
        });
    }
    
    // Count responses
    responses.forEach(response => {
        const answer = response.answers[question.id];
        if (answer && Array.isArray(answer)) {
            answer.forEach(value => {
                // Get the label for the selected value
                let label = value;
                if (question.options) {
                    const option = question.options.find(opt => opt.value === value);
                    if (option) {
                        label = option.label;
                    }
                }
                
                if (label) {
                    counts[label] = (counts[label] || 0) + 1;
                }
            });
        }
    });
    
    // Prepare chart data
    const labels = Object.keys(counts);
    const data = labels.map(label => counts[label]);
    
    // Create chart
    const barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Responses',
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                },
                x: {
                    ticks: {
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    // Store chart instance
    window.responsesState.charts[question.id] = barChart;
}

function createRatingChart(question, responses) {
    const ctx = document.getElementById(`chart-${question.id}`);
    if (!ctx) return;
    
    // Count responses for each rating value
    const counts = {};
    
    // Get min and max values
    const minValue = question.min_value || 1;
    const maxValue = question.max_value || 5;
    
    // Initialize counts for all possible values
    for (let i = minValue; i <= maxValue; i++) {
        counts[i] = 0;
    }
    
    // Count responses
    responses.forEach(response => {
        const answer = response.answers[question.id];
        if (answer !== undefined && answer !== null) {
            // Convert to number if it's a string
            const value = typeof answer === 'string' ? parseInt(answer, 10) : answer;
            if (!isNaN(value) && counts[value] !== undefined) {
                counts[value]++;
            }
        }
    });
    
    // Prepare chart data
    const labels = Object.keys(counts).map(v => parseInt(v, 10));
    const data = labels.map(label => counts[label]);
    
    // Calculate average rating
    let total = 0;
    let count = 0;
    labels.forEach((label, index) => {
        total += label * data[index];
        count += data[index];
    });
    const average = count > 0 ? (total / count).toFixed(1) : 'N/A';
    
    // Create chart
    const ratingChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Responses',
                data: data,
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: `Average: ${average}`,
                    position: 'bottom',
                    padding: {
                        top: 10
                    },
                    font: {
                        size: 14
                    }
                }
            }
        }
    });
    
    // Store chart instance
    window.responsesState.charts[question.id] = ratingChart;
}

function getOptionLabel(value, question) {
    if (!question.options) return value;
    
    const option = question.options.find(opt => opt.value === value);
    return option ? option.label : value;
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
            // Search in response ID
            if (response._id.toLowerCase().includes(searchLower)) {
                return true;
            }
            
            // Search in submission date
            const date = new Date(response.created_at).toLocaleString().toLowerCase();
            if (date.includes(searchLower)) {
                return true;
            }
            
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
                } else if (typeof answer === 'object' && answer !== null) {
                    // Handle file upload objects
                    if (answer.filename && answer.filename.toLowerCase().includes(searchLower)) {
                        return true;
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
                <td><span class="response-id" title="${response._id}">${response._id.substring(0, 8)}...</span></td>
                <td><span class="response-date">${formattedDate}</span></td>
            `;
            
            // Add answers for each question in the header
            const questions = window.responsesState.form.questions.slice(0, 4);
            questions.forEach(question => {
                const answer = response.answers[question.id] || "";
                let displayAnswer = formatAnswerForDisplay(answer, question, response._id);
                
                rowHTML += `<td>${displayAnswer}</td>`;
            });
            
            // Add actions column
            rowHTML += `
                <td>
                    <div class="response-actions">
                        <a href="response-details.html?formId=${response.formId || (window.responsesState.form ? window.responsesState.form._id : '')}&responseId=${response._id}" class="action-btn view-response" title="View Details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </a>
                        <button class="action-btn delete delete-response" data-id="${response._id}" title="Delete Response">
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

function formatAnswerForDisplay(answer, question, responseId) {
    if (answer === undefined || answer === null || answer === "") {
        return '<span class="no-answer">Not answered</span>';
    }
    
    switch (question.type) {
        case 'multiple_choice':
        case 'dropdown':
            // For single-select questions, find the label for the selected value
            if (question.options) {
                const selectedOption = question.options.find(opt => opt.value === answer);
                if (selectedOption) {
                    return `<span class="choice-answer-preview">${selectedOption.label}</span>`;
                }
            }
            return `<span class="choice-answer-preview">${answer}</span>`;
            
        case 'checkbox':
            // For multi-select questions
            if (Array.isArray(answer)) {
                if (answer.length === 0) {
                    return '<span class="no-answer">None selected</span>';
                }
                
                // Map values to labels if options exist
                if (question.options) {
                    const selectedLabels = answer.map(value => {
                        const option = question.options.find(opt => opt.value === value);
                        return option ? option.label : value;
                    });
                    
                    if (selectedLabels.length === 1) {
                        return `<span class="choice-answer-preview">${selectedLabels[0]}</span>`;
                    }
                    return `<span class="choice-answer-preview">${selectedLabels.length} options selected</span>`;
                }
                
                if (answer.length === 1) {
                    return `<span class="choice-answer-preview">${answer[0]}</span>`;
                }
                return `<span class="choice-answer-preview">${answer.length} options selected</span>`;
            }
            return `<span class="choice-answer-preview">${answer}</span>`;
            
        case 'rating':
        case 'scale':
            // For rating questions
            return `<span class="rating-answer-preview">${answer} / ${question.max_value || 5}</span>`;
            
        case 'file':
            // For file uploads
            if (typeof answer === 'object' && answer.file_id) {
                const fileKey = `${responseId}_${question.id}`;
                const fileInfo = window.responsesState.fileDownloads[fileKey];
                
                if (fileInfo) {
                    return `<a href="${fileInfo.url}" target="_blank" class="file-download-link" data-key="${fileKey}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        ${answer.filename || 'Download'}
                    </a>`;
                }
                
                return '<span class="file-answer">File uploaded</span>';
            }
            return '<span class="no-answer">No file</span>';
            
        case 'paragraph':
            // For long text, truncate
            if (typeof answer === 'string' && answer.length > 50) {
                return `<span class="text-answer" title="${answer.replace(/"/g, '&quot;')}">${answer.substring(0, 50)}...</span>`;
            }
            return `<span class="text-answer">${answer}</span>`;
            
        default:
            // For text, email, number, etc.
            if (typeof answer === 'string' && answer.length > 30) {
                return `<span class="text-answer" title="${answer.replace(/"/g, '&quot;')}">${answer.substring(0, 30)}...</span>`;
            }
            return `<span class="text-answer">${answer}</span>`;
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
                // For checkboxes, answer is an array of strings
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
                // For files, we show a link to download the file
                if (typeof answer === 'object' && answer.file_id) {
                    const fileKey = `${response._id}_${question.id}`;
                    const fileInfo = window.responsesState.fileDownloads[fileKey];
                    
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
        
        questionElement.appendChild(answerElement);
        responseContent.appendChild(questionElement);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0 || !bytes) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updatePagination() {
    const currentPageEl = document.getElementById("current-page");
    const totalPagesEl = document.getElementById("total-pages");
    const prevPageBtn = document.getElementById("prev-page");
    const nextPageBtn = document.getElementById("next-page");
    const paginationEl = document.getElementById("responses-pagination");
    
    // Hide pagination if in individual view
    if (paginationEl) {
        paginationEl.style.display = window.responsesState.currentView === "table" ? "flex" : "none";
    }
    
    if (currentPageEl) currentPageEl.textContent = window.responsesState.currentPage;
    if (totalPagesEl) totalPagesEl.textContent = window.responsesState.totalPages;
    
    if (prevPageBtn) prevPageBtn.disabled = window.responsesState.currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = window.responsesState.currentPage >= window.responsesState.totalPages;
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
    
    // Add a back button for form-specific responses
    const headerLeft = document.querySelector('.header-left');
    if (headerLeft) {
        const backButton = document.createElement('a');
        backButton.href = 'responses.html';
        backButton.className = 'back-button';
        backButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>All Responses</span>
        `;
        headerLeft.insertBefore(backButton, headerLeft.firstChild);
    }
    
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
            
            // Update charts with filtered data
            generateCharts(filteredResponses);
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
            
            // Update charts with filtered data
            generateCharts(filteredResponses);
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
        // View response links are now handled by href, no need for event handler
        
        // Delete response
        if (e.target.closest(".delete-response")) {
            const responseId = e.target.closest(".delete-response").dataset.id;
            openDeleteConfirmModal(responseId);
        }
        
        // File download links
        if (e.target.closest(".file-download-link")) {
            e.preventDefault();
            const link = e.target.closest(".file-download-link");
            const fileKey = link.dataset.key;
            downloadFile(fileKey);
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
    
    // Listen for window resize to adjust charts
    window.addEventListener('resize', debounce(() => {
        // Reposition chart scrolling if needed
        scrollToCurrentChart();
    }, 250));
}

function downloadFile(fileKey) {
    const fileInfo = window.responsesState.fileDownloads[fileKey];
    if (!fileInfo || !fileInfo.url) {
        showNotification("File information not available", "error");
        return;
    }
    
    // Open the file URL in a new tab
    window.open(fileInfo.url, '_blank');
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
        
        // Always show all questions in the modal, even if not answered
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
            
            // Render answer based on question type (same as in renderResponseDetails)
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
                        const fileInfo = window.responsesState.fileDownloads[fileKey];
                        
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
                const originalText = this.innerHTML;
                this.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Copied!
                `;
                setTimeout(() => {
                    this.innerHTML = originalText;
                }, 2000);
                
                showNotification("Link copied to clipboard", "success");
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
            
            if (!customSlug) {
                showNotification("Please enter a custom URL", "warning");
                return;
            }
            
            try {
                showLoadingIndicator();
                
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
                
                hideLoadingIndicator();
                showNotification("Custom URL saved successfully", "success");
                
            } catch (error) {
                hideLoadingIndicator();
                console.error("Error updating custom URL:", error);
                showNotification("Failed to update custom URL. It may already be in use.", "error");
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
                showLoadingIndicator();
                
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
                
                // Update charts with new data
                generateCharts(window.responsesState.responses);
                
                // Close the modal
                closeAllModals();
                hideLoadingIndicator();
                
                showNotification("Response deleted successfully", "success");
                
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

function exportResponsesToCSV() {
    if (!window.responsesState.form || !window.responsesState.responses.length) {
        showNotification("No responses to export", "warning");
        return;
    }
    
    try {
        showLoadingIndicator();
        
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
                } else if (typeof answer === 'object') {
                    // Handle file uploads
                    if (answer.file_id) {
                        formattedAnswer = answer.filename || "File uploaded";
                    } else {
                        formattedAnswer = JSON.stringify(answer).replace(/,/g, ";");
                    }
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
        link.setAttribute("download", `${form.title}_responses_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
        document.body.appendChild(link);
        
        // Trigger download
        link.click();
        
        // Clean up
        document.body.removeChild(link);
        hideLoadingIndicator();
        showNotification("CSV file exported successfully", "success");
        
    } catch (error) {
        hideLoadingIndicator();
        console.error("Error exporting responses:", error);
        showNotification("Failed to export responses: " + error.message, "error");
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

// Function to load all responses across all forms
async function loadAllResponses(token) {
    try {
        // Show loading indicator
        showLoadingIndicator();
        
        // Initialize state for all responses
        window.responsesState = {
            forms: [],
            allResponses: [],
            currentPage: 1,
            totalPages: 1,
            itemsPerPage: 10,
            currentView: "table",
            filter: {
                dateRange: "all",
                search: "",
                formFilter: "all"
            }
        };
        
        // Fetch all forms
        const formsResponse = await fetch(`${API_URL}/forms`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (!formsResponse.ok) {
            throw new Error("Failed to fetch forms");
        }
        
        const forms = await formsResponse.json();
        window.responsesState.forms = forms;
        
        // Update page title
        document.title = "All Responses | FlyForms";
        
        // Update header
        const formTitleEl = document.getElementById("form-title");
        const formMetaEl = document.getElementById("form-meta");
        
        if (formTitleEl) formTitleEl.textContent = "All Form Responses";
        if (formMetaEl) formMetaEl.textContent = `${forms.length} forms`;
        
        // Fetch responses for each form
        const allResponses = [];
        let totalResponseCount = 0;
        
        for (const form of forms) {
            try {
                const responseResponse = await fetch(`${API_URL}/forms/${form._id}/responses`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });
                
                if (responseResponse.ok) {
                    const formResponses = await responseResponse.json();
                    
                    // Add form information to each response
                    formResponses.forEach(response => {
                        response.formTitle = form.title;
                        response.formId = form._id;
                    });
                    
                    allResponses.push(...formResponses);
                    totalResponseCount += formResponses.length;
                }
            } catch (error) {
                console.error(`Error fetching responses for form ${form._id}:`, error);
            }
        }
        
        window.responsesState.allResponses = allResponses;
        
        // Set up event listeners
        setupAllResponsesEventListeners();
        
        // Render all responses
        renderAllResponses(allResponses);
        
        // Hide loading indicator
        hideLoadingIndicator();
        
    } catch (error) {
        console.error("Error loading all responses:", error);
        showNotification("Failed to load responses. Please try again.", "error");
        hideLoadingIndicator();
    }
}

// Function to render all responses
function renderAllResponses(responses) {
    // Update pagination
    const totalItems = responses.length;
    window.responsesState.totalPages = Math.ceil(totalItems / window.responsesState.itemsPerPage);
    
    if (window.responsesState.currentPage > window.responsesState.totalPages && window.responsesState.totalPages > 0) {
        window.responsesState.currentPage = window.responsesState.totalPages;
    }
    
    updatePagination();
    
    // Get table elements
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
    
    // Set up table headers
    if (tableHeader) {
        let headerHTML = `
            <th>Form</th>
            <th>Response ID</th>
            <th>Submitted</th>
            <th>Actions</th>
        `;
        
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
            
            // Create row HTML
            let rowHTML = `
                <td><a href="responses.html?formId=${response.formId}" class="form-link">${response.formTitle}</a></td>
                <td><span class="response-id" title="${response._id}">${response._id.substring(0, 8)}...</span></td>
                <td><span class="response-date">${formattedDate}</span></td>
                <td>
                    <div class="response-actions">
                        <a href="response-details.html?formId=${response.formId}&responseId=${response._id}" class="action-btn view-response" title="View Response Details">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </a>
                    </div>
                </td>
            `;
            
            row.innerHTML = rowHTML;
            tableBody.appendChild(row);
        });
    }
}

// Setup event listeners for all responses view
function setupAllResponsesEventListeners() {
    // Pagination
    const prevPageBtn = document.getElementById("prev-page");
    const nextPageBtn = document.getElementById("next-page");
    
    if (prevPageBtn) {
        prevPageBtn.addEventListener("click", function() {
            if (window.responsesState.currentPage > 1) {
                window.responsesState.currentPage--;
                renderAllResponses(window.responsesState.allResponses);
            }
        });
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener("click", function() {
            if (window.responsesState.currentPage < window.responsesState.totalPages) {
                window.responsesState.currentPage++;
                renderAllResponses(window.responsesState.allResponses);
            }
        });
    }
    
    // Search responses
    const searchInput = document.getElementById("search-responses");
    if (searchInput) {
        searchInput.addEventListener("input", debounce(function() {
            const searchTerm = this.value.toLowerCase();
            const filteredResponses = window.responsesState.allResponses.filter(response => {
                // Search in form title
                if (response.formTitle.toLowerCase().includes(searchTerm)) {
                    return true;
                }
                
                // Search in response ID
                if (response._id.toLowerCase().includes(searchTerm)) {
                    return true;
                }
                
                // Search in submission date
                const date = new Date(response.created_at).toLocaleString().toLowerCase();
                if (date.includes(searchTerm)) {
                    return true;
                }
                
                return false;
            });
            
            window.responsesState.currentPage = 1; // Reset to first page
            renderAllResponses(filteredResponses);
        }, 300));
    }
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', function() {
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
});