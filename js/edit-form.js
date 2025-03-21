
document.addEventListener("DOMContentLoaded", async function() {
    const token = localStorage.getItem("token");
    
    if (!token) {
        window.location.href = "login.html";
        return;
    }
    
    // Initialize state
    window.formState = {
        form: null,
        questions: [],
        theme: "#4361ee",
        nextQuestionId: 1
    };
    
    // Get form ID from URL if editing an existing form
    const urlParams = new URLSearchParams(window.location.search);
    const formId = urlParams.get("id");
    
    try {
        if (formId) {
            // Editing existing form
            await loadForm(token, formId);
            document.getElementById("form-title-header").textContent = "Edit Form";
        } else {
            // Creating new form
            initializeNewForm();
            document.getElementById("form-title-header").textContent = "Create Form";
        }
        
        // Set up event listeners
        setupEventListeners();
        
    } catch (error) {
        console.error("Error initializing form editor:", error);
        showErrorMessage("Failed to load form data. Please try again.");
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
            throw new Error("Failed to fetch form");
        }
        
        const form = await response.json();
        window.formState.form = form;
        
        // Populate form fields
        populateFormFields(form);
        
        // Set theme
        if (form.theme && form.theme.primaryColor) {
            setThemeColor(form.theme.primaryColor);
        }
        
        // Load questions
        loadQuestions(form.questions);
        
    } catch (error) {
        console.error("Error fetching form:", error);
        throw error;
    }
}

function initializeNewForm() {
    // Initialize with empty form
    window.formState.form = {
        title: "",
        description: "",
        start_screen: {
            id: "start",
            title: "Welcome to my form",
            description: "Please take a moment to fill out this form."
        },
        questions: [],
        end_screen: {
            id: "end",
            title: "Thank you for your submission!",
            description: "Your response has been recorded."
        },
        is_active: true
    };
    
    // Populate form fields with default values
    populateFormFields(window.formState.form);
}

function populateFormFields(form) {
    // Form title and description
    document.getElementById("form-title-input").value = form.title || "";
    document.getElementById("form-description-input").value = form.description || "";
    
    // Start screen
    document.getElementById("start-screen-title").value = form.start_screen.title || "";
    document.getElementById("start-screen-description").value = form.start_screen.description || "";
    
    // End screen
    document.getElementById("end-screen-title").value = form.end_screen.title || "";
    document.getElementById("end-screen-description").value = form.end_screen.description || "";
    
    // Form settings
    document.getElementById("form-active").checked = form.is_active !== false;
    
    if (form.max_responses) {
        document.getElementById("max-responses").value = form.max_responses;
    }
    
    if (form.expiration_date) {
        const expirationDate = new Date(form.expiration_date);
        document.getElementById("expiration-date").value = expirationDate.toISOString().split("T")[0];
    }
}

function loadQuestions(questions) {
    if (!questions || !questions.length) return;
    
    // Clear existing questions
    document.getElementById("questions-container").innerHTML = "";
    
    // Load each question
    questions.forEach((question, index) => {
        addQuestionToDOM(question);
    });
    
    // Update next question ID
    window.formState.nextQuestionId = questions.length + 1;
}

function addQuestionToDOM(question) {
    const questionsContainer = document.getElementById("questions-container");
    const questionItem = document.createElement("div");
    questionItem.className = "question-item";
    questionItem.dataset.id = question.id;
    questionItem.dataset.type = question.type;
    
    // Get question type display name
    const questionTypeMap = {
        text: "Short Text",
        paragraph: "Paragraph",
        multiple_choice: "Multiple Choice",
        checkbox: "Checkbox",
        dropdown: "Dropdown",
        date: "Date",
        email: "Email",
        number: "Number",
        rating: "Rating",
        scale: "Scale"
    };
    
    const questionTypeName = questionTypeMap[question.type] || question.type;
    
    // Create question header
    let questionHTML = `
        <div class="question-header">
            <span class="question-type-badge">${questionTypeName}</span>
            <div class="question-actions">
                <button class="question-action duplicate-question" title="Duplicate">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <button class="question-action delete delete-question" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        </div>
        <input type="text" class="question-title-input" placeholder="Question text" value="${question.title || ''}">
        <textarea class="question-description-input" placeholder="Question description (optional)">${question.description || ''}</textarea>
    `;
    
    // Add question-specific fields
    switch (question.type) {
        case 'multiple_choice':
        case 'checkbox':
        case 'dropdown':
            questionHTML += `<div class="options-list">`;
            
            if (question.options && question.options.length) {
                question.options.forEach((option, index) => {
                    questionHTML += `
                        <div class="option-item">
                            <input type="text" class="option-input" value="${option.label}" placeholder="Option text">
                            <button class="option-action remove-option">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                    `;
                });
            } else {
                // Add default options if none exist
                questionHTML += `
                    <div class="option-item">
                        <input type="text" class="option-input" value="Option 1" placeholder="Option text">
                        <button class="option-action remove-option">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                    <div class="option-item">
                        <input type="text" class="option-input" value="Option 2" placeholder="Option text">
                        <button class="option-action remove-option">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                `;
            }
            
            questionHTML += `</div>`;
            questionHTML += `
                <button class="add-option-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Add Option
                </button>
            `;
            break;
            
        case 'rating':
        case 'scale':
            // Add min/max fields for rating
            questionHTML += `
                <div class="settings-row">
                    <div class="settings-field">
                        <label>Minimum Value</label>
                        <input type="number" class="min-value" value="${question.min_value || 1}" min="0">
                    </div>
                    <div class="settings-field">
                        <label>Maximum Value</label>
                        <input type="number" class="max-value" value="${question.max_value || 5}" min="1">
                    </div>
                </div>
            `;
            break;
    }
    
    // Add required checkbox
    questionHTML += `
        <div class="required-toggle">
            <input type="checkbox" id="required-${question.id}" class="required-checkbox" ${question.required ? 'checked' : ''}>
            <label for="required-${question.id}">Required question</label>
        </div>
    `;
    
    questionItem.innerHTML = questionHTML;
    questionsContainer.appendChild(questionItem);
}

function createNewQuestion(type) {
    const id = `q${window.formState.nextQuestionId++}`;
    const question = {
        id: id,
        type: type,
        title: "",
        description: "",
        required: false
    };
    
    // Add type-specific properties
    switch (type) {
        case 'multiple_choice':
        case 'checkbox':
        case 'dropdown':
            question.options = [
                { value: "option1", label: "Option 1" },
                { value: "option2", label: "Option 2" }
            ];
            break;
        case 'rating':
        case 'scale':
            question.min_value = 1;
            question.max_value = 5;
            break;
    }
    
    return question;
}

function setupEventListeners() {
    // Save form
    document.getElementById("save-form-btn").addEventListener("click", saveForm);
    
    // Add question button
    document.getElementById("add-question-btn").addEventListener("click", function() {
        // Show question type modal
        openAddQuestionModal();
    });
    
    // Question type selection in sidebar
    document.querySelectorAll(".question-type-item").forEach(item => {
        item.addEventListener("click", function() {
            const type = this.dataset.type;
            const question = createNewQuestion(type);
            addQuestionToDOM(question);
            window.formState.questions.push(question);
        });
    });
    
    // Question type selection in modal
    document.querySelectorAll(".question-type-card").forEach(card => {
        card.addEventListener("click", function() {
            const type = this.dataset.type;
            const question = createNewQuestion(type);
            addQuestionToDOM(question);
            window.formState.questions.push(question);
            closeAllModals();
        });
    });
    
    // Theme color selection
    document.querySelectorAll(".theme-color").forEach(color => {
        color.addEventListener("click", function() {
            const colorValue = this.dataset.color;
            setThemeColor(colorValue);
        });
    });
    
    // Preview form
    document.getElementById("preview-form-btn").addEventListener("click", previewForm);
    
    // Share form
    document.getElementById("share-form-btn").addEventListener("click", function() {
        if (!window.formState.form._id) {
            alert("Please save your form first before sharing.");
            return;
        }
        
        openShareFormModal(window.formState.form._id);
    });
    
    // Close modals
    document.querySelectorAll(".modal-close").forEach(btn => {
        btn.addEventListener("click", closeAllModals);
    });
    
    // Setup share form modal events
    setupShareFormModal();
    
    // Question actions (delete, duplicate, add option, etc.)
    setupQuestionActions();
}

function setupQuestionActions() {
    // Event delegation for question actions
    document.addEventListener("click", function(e) {
        // Delete question
        if (e.target.closest(".delete-question")) {
            const questionItem = e.target.closest(".question-item");
            if (questionItem) {
                const questionId = questionItem.dataset.id;
                deleteQuestion(questionId);
            }
        }
        
        // Duplicate question
        if (e.target.closest(".duplicate-question")) {
            const questionItem = e.target.closest(".question-item");
            if (questionItem) {
                const questionId = questionItem.dataset.id;
                duplicateQuestion(questionId);
            }
        }
        
        // Add option
        if (e.target.closest(".add-option-btn")) {
            const questionItem = e.target.closest(".question-item");
            if (questionItem) {
                const optionsList = questionItem.querySelector(".options-list");
                if (optionsList) {
                    const optionItem = document.createElement("div");
                    optionItem.className = "option-item";
                    optionItem.innerHTML = `
                        <input type="text" class="option-input" placeholder="Option text">
                        <button class="option-action remove-option">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `;
                    optionsList.appendChild(optionItem);
                }
            }
        }
        
        // Remove option
        if (e.target.closest(".remove-option")) {
            const optionItem = e.target.closest(".option-item");
            if (optionItem) {
                const optionsList = optionItem.closest(".options-list");
                if (optionsList && optionsList.children.length > 1) {
                    // Don't remove if it's the last option
                    optionItem.remove();
                }
            }
        }
    });
}

function deleteQuestion(questionId) {
    // Remove from DOM
    const questionItem = document.querySelector(`.question-item[data-id="${questionId}"]`);
    if (questionItem) {
        questionItem.remove();
    }
    
    // Remove from state
    window.formState.questions = window.formState.questions.filter(q => q.id !== questionId);
}

function duplicateQuestion(questionId) {
    // Find the question to duplicate
    const originalQuestion = window.formState.questions.find(q => q.id === questionId);
    if (!originalQuestion) return;
    
    // Create a new question with the same properties
    const newId = `q${window.formState.nextQuestionId++}`;
    const duplicatedQuestion = JSON.parse(JSON.stringify(originalQuestion));
    duplicatedQuestion.id = newId;
    duplicatedQuestion.title += " (Copy)";
    
    // Add to state
    window.formState.questions.push(duplicatedQuestion);
    
    // Add to DOM
    addQuestionToDOM(duplicatedQuestion);
}

function setThemeColor(colorValue) {
    // Update active state in UI
    document.querySelectorAll(".theme-color").forEach(el => {
        el.classList.remove("active");
        if (el.dataset.color === colorValue) {
            el.classList.add("active");
        }
    });
    
    // Store in state
    window.formState.theme = colorValue;
}

function openAddQuestionModal() {
    const modal = document.getElementById("add-question-modal");
    if (modal) {
        modal.classList.add("active");
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal").forEach(modal => {
        modal.classList.remove("active");
    });
}

function previewForm() {
    // Gather current form data
    const formData = collectFormData();
    
    // Update preview modal
    const previewModal = document.getElementById("preview-form-modal");
    const previewTitle = document.getElementById("preview-form-title");
    const previewDescription = document.getElementById("preview-form-description");
    const previewQuestionsContainer = document.getElementById("preview-questions-container");
    
    if (!previewModal || !previewTitle || !previewDescription || !previewQuestionsContainer) return;
    
    // Set title and description
    previewTitle.textContent = formData.title || "Form Title";
    previewDescription.textContent = formData.description || "";
    
    // Clear existing questions
    previewQuestionsContainer.innerHTML = "";
    
    // Add each question
    formData.questions.forEach((question, index) => {
        const questionEl = document.createElement("div");
        questionEl.className = "preview-question";
        
        // Question title and description
        let questionHTML = `
            <div class="preview-question-title">${index + 1}. ${question.title}${question.required ? ' <span class="required">*</span>' : ''}</div>
        `;
        
        if (question.description) {
            questionHTML += `<div class="preview-question-description">${question.description}</div>`;
        }
        
        // Question input based on type
        switch (question.type) {
            case 'text':
                questionHTML += `<input type="text" class="preview-text-input" placeholder="Your answer">`;
                break;
                
            case 'paragraph':
                questionHTML += `<textarea class="preview-textarea" placeholder="Your answer"></textarea>`;
                break;
                
            case 'multiple_choice':
                questionHTML += `<div class="preview-options">`;
                question.options.forEach(option => {
                    questionHTML += `
                        <div class="preview-option">
                            <input type="radio" id="preview-${question.id}-${option.value}" name="preview-${question.id}">
                            <label class="preview-option-label" for="preview-${question.id}-${option.value}">${option.label}</label>
                        </div>
                    `;
                });
                questionHTML += `</div>`;
                break;
                
            case 'checkbox':
                questionHTML += `<div class="preview-options">`;
                question.options.forEach(option => {
                    questionHTML += `
                        <div class="preview-option">
                            <input type="checkbox" id="preview-${question.id}-${option.value}">
                            <label class="preview-option-label" for="preview-${question.id}-${option.value}">${option.label}</label>
                        </div>
                    `;
                });
                questionHTML += `</div>`;
                break;
                
            case 'dropdown':
                questionHTML += `
                    <select class="preview-text-input">
                        <option value="" disabled selected>Select an option</option>
                `;
                question.options.forEach(option => {
                    questionHTML += `<option value="${option.value}">${option.label}</option>`;
                });
                questionHTML += `</select>`;
                break;
                
            case 'date':
                questionHTML += `<input type="date" class="preview-text-input">`;
                break;
                
            case 'email':
                questionHTML += `<input type="email" class="preview-text-input" placeholder="Your email">`;
                break;
                
            case 'number':
                questionHTML += `<input type="number" class="preview-text-input" placeholder="Your answer">`;
                break;
                
            case 'rating':
            case 'scale':
                const max = question.max_value || 5;
                const min = question.min_value || 1;
                questionHTML += `<div class="preview-options">`;
                for (let i = min; i <= max; i++) {
                    questionHTML += `
                        <div class="preview-option">
                            <input type="radio" id="preview-${question.id}-${i}" name="preview-${question.id}">
                            <label class="preview-option-label" for="preview-${question.id}-${i}">${i}</label>
                        </div>
                    `;
                }
                questionHTML += `</div>`;
                break;
        }
        
        questionEl.innerHTML = questionHTML;
        previewQuestionsContainer.appendChild(questionEl);
    });
    
    // Show preview modal
    previewModal.classList.add("active");
}

function collectFormData() {
    const formData = {
        title: document.getElementById("form-title-input").value,
        description: document.getElementById("form-description-input").value,
        start_screen: {
            id: "start",
            title: document.getElementById("start-screen-title").value,
            description: document.getElementById("start-screen-description").value
        },
        end_screen: {
            id: "end",
            title: document.getElementById("end-screen-title").value,
            description: document.getElementById("end-screen-description").value
        },
        is_active: document.getElementById("form-active").checked,
        theme: {
            primaryColor: window.formState.theme
        },
        questions: []
    };
    
    // Max responses
    const maxResponses = document.getElementById("max-responses").value;
    if (maxResponses) {
        formData.max_responses = parseInt(maxResponses);
    }
    
    // Expiration date
    const expirationDate = document.getElementById("expiration-date").value;
    if (expirationDate) {
        formData.expiration_date = new Date(expirationDate);
    }
    
    // Collect questions
    const questionItems = document.querySelectorAll(".question-item");
    questionItems.forEach(item => {
        const questionId = item.dataset.id;
        const questionType = item.dataset.type;
        const questionTitle = item.querySelector(".question-title-input").value;
        const questionDescription = item.querySelector(".question-description-input").value;
        const isRequired = item.querySelector(".required-checkbox").checked;
        
        const question = {
            id: questionId,
            type: questionType,
            title: questionTitle,
            description: questionDescription,
            required: isRequired
        };
        
        // Add type-specific properties
        switch (questionType) {
            case 'multiple_choice':
            case 'checkbox':
            case 'dropdown':
                const options = [];
                item.querySelectorAll(".option-input").forEach((optionInput, index) => {
                    options.push({
                        value: `option${index + 1}`,
                        label: optionInput.value
                    });
                });
                question.options = options;
                break;
                
            case 'rating':
            case 'scale':
                const minValue = item.querySelector(".min-value");
                const maxValue = item.querySelector(".max-value");
                if (minValue) question.min_value = parseInt(minValue.value);
                if (maxValue) question.max_value = parseInt(maxValue.value);
                break;
        }
        
        formData.questions.push(question);
    });
    
    return formData;
}

async function saveForm() {
    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "login.html";
        return;
    }
    
    // Collect form data
    const formData = collectFormData();
    
    // Validate form data
    if (!formData.title) {
        alert("Please enter a form title");
        document.getElementById("form-title-input").focus();
        return;
    }
    
    if (formData.questions.length === 0) {
        alert("Please add at least one question");
        return;
    }
    
    try {
        let response;
        
        if (window.formState.form && window.formState.form._id) {
            // Update existing form
            response = await fetch(`${API_URL}/forms/${window.formState.form._id}`, {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(formData)
            });
        } else {
            // Create new form
            response = await fetch(`${API_URL}/forms`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(formData)
            });
        }
        
        if (!response.ok) {
            throw new Error("Failed to save form");
        }
        
        const savedForm = await response.json();
        window.formState.form = savedForm;
        
        // Show success message
        alert("Form saved successfully!");
        
        // Redirect to forms page or stay on edit page
        if (!window.formState.form._id) {
            window.location.href = `edit-form.html?id=${savedForm._id}`;
        }
        
    } catch (error) {
        console.error("Error saving form:", error);
        alert("Failed to save form. Please try again.");
    }
}

function openShareFormModal(formId) {
    const shareModal = document.getElementById("share-form-modal");
    
    if (!shareModal) return;
    
    // Set form link
    const formLinkInput = document.getElementById("form-link");
    if (formLinkInput) {
        const formUrl = `${window.location.origin}/f/${window.formState.form.slug}`;
        formLinkInput.value = formUrl;
    }
    
    // Set custom URL input
    const customUrlInput = document.getElementById("custom-url");
    if (customUrlInput) {
        customUrlInput.value = window.formState.form.custom_slug || "";
    }
    
    // Set embed code
    const embedCodeInput = document.getElementById("embed-code");
    if (embedCodeInput) {
        const embedCode = `<iframe src="${window.location.origin}/f/${window.formState.form.slug}" width="100%" height="600" frameborder="0"></iframe>`;
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
            const formId = window.formState.form._id;
            const token = localStorage.getItem("token");
            
            try {
                // Update form with custom slug
                const response = await fetch(`${API_URL}/forms/${formId}`, {
                    method: "PUT",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        ...window.formState.form,
                        custom_slug: customSlug
                    })
                });
                
                if (!response.ok) {
                    throw new Error("Failed to update custom URL");
                }
                
                // Update form link input with new URL
                const updatedForm = await response.json();
                window.formState.form = updatedForm;
                
                const formLinkInput = document.getElementById("form-link");
                if (formLinkInput) {
                    const formUrl = `${window.location.origin}/f/${updatedForm.slug}`;
                    formLinkInput.value = formUrl;
                }
                
                // Update embed code with new URL
                const embedCodeInput = document.getElementById("embed-code");
                if (embedCodeInput) {
                    const embedCode = `<iframe src="${window.location.origin}/f/${updatedForm.slug}" width="100%" height="600" frameborder="0"></iframe>`;
                    embedCodeInput.value = embedCode;
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
                const subject = encodeURIComponent(`Please fill out this form: ${window.formState.form.title}`);
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
                const text = encodeURIComponent(`Please fill out this form: ${window.formState.form.title}`);
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
                const title = encodeURIComponent(window.formState.form.title);
                const url = encodeURIComponent(formLinkInput.value);
                window.open(`https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${title}`);
            }
        });
    }
}