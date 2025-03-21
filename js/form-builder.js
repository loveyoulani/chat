document.addEventListener("DOMContentLoaded", async function() {
    const token = localStorage.getItem("token");
    
    if (!token) {
        window.location.href = "login.html";
        return;
    }
    
    // Initialize state
    window.formBuilderState = {
        form: {
            title: "Untitled Form",
            description: "",
            start_screen: {
                id: "start",
                title: "Welcome",
                description: "",
                background_image: null,
                custom_css: null,
                custom_html: null
            },
            questions: [],
            end_screen: {
                id: "end",
                title: "Thank You!",
                description: "Your response has been recorded.",
                background_image: null,
                custom_css: null,
                custom_html: null,
                dynamic_content: null
            },
            max_responses: null,
            expiration_date: null,
            custom_slug: null,
            theme: {
                primary_color: "#000000",
                background_color: "#ffffff",
                text_color: "#333333",
                font_family: "Inter, sans-serif",
                custom_css: null
            }
        },
        currentSection: "start-screen",
        editingQuestion: null,
        editingQuestionIndex: -1,
        questionCounter: 0
    };
    
    // Set up event listeners
    setupEventListeners();
    
    // Check if we're editing an existing form
    const urlParams = new URLSearchParams(window.location.search);
    const formId = urlParams.get("id");
    
    if (formId) {
        try {
            // Fetch form data
            const response = await fetch(`${API_URL}/forms/${formId}`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error("Failed to fetch form");
            }
            
            const formData = await response.json();
            window.formBuilderState.form = formData;
            
            // Update form title
            document.getElementById("form-title").value = formData.title;
            
            // Update start screen fields
            document.getElementById("start-title").value = formData.start_screen.title || "";
            document.getElementById("start-description").value = formData.start_screen.description || "";
            
            if (formData.start_screen.custom_css) {
                document.getElementById("start-custom-css").value = formData.start_screen.custom_css;
            }
            
            // Update end screen fields
            document.getElementById("end-title").value = formData.end_screen.title || "";
            document.getElementById("end-description").value = formData.end_screen.description || "";
            
            if (formData.end_screen.custom_css) {
                document.getElementById("end-custom-css").value = formData.end_screen.custom_css;
            }
            
            // Update form settings
            if (formData.max_responses) {
                document.getElementById("max-responses").value = formData.max_responses;
            }
            
            if (formData.expiration_date) {
                document.getElementById("expiration-date").value = new Date(formData.expiration_date).toISOString().split('T')[0];
            }
            
            if (formData.custom_slug) {
                document.getElementById("custom-slug").value = formData.custom_slug;
            }
            
            // Set dynamic content toggle
            if (formData.end_screen.dynamic_content) {
                document.getElementById("enable-dynamic-content").checked = true;
                document.getElementById("dynamic-content-container").style.display = "block";
                
                // Render dynamic rules
                renderDynamicRules(formData.end_screen.dynamic_content);
            }
            
            // Render questions
            if (formData.questions && formData.questions.length > 0) {
                const questionsContainer = document.getElementById("questions-container");
                questionsContainer.innerHTML = ""; // Clear empty state
                
                formData.questions.forEach((question, index) => {
                    renderQuestion(question, index);
                });
                
                // Update question counter
                window.formBuilderState.questionCounter = formData.questions.length;
            }
            
        } catch (error) {
            console.error("Error loading form:", error);
            alert("Failed to load form. Please try again.");
        }
    }
});

function setupEventListeners() {
    // Form title input
    const formTitleInput = document.getElementById("form-title");
    if (formTitleInput) {
        formTitleInput.addEventListener("input", function() {
            window.formBuilderState.form.title = this.value;
        });
    }
    
    // Section navigation
    document.querySelectorAll(".form-sections li").forEach(section => {
        section.addEventListener("click", function() {
            const sectionId = this.dataset.section;
            changeSection(sectionId);
        });
    });
    
    // Question type selection
    document.querySelectorAll(".question-type").forEach(type => {
        type.addEventListener("click", function() {
            const questionType = this.dataset.type;
            addNewQuestion(questionType);
        });
    });
    
    // Save button
    const saveButton = document.getElementById("save-button");
    if (saveButton) {
        saveButton.addEventListener("click", saveForm);
    }
    
    // Preview button
    const previewButton = document.getElementById("preview-button");
    if (previewButton) {
        previewButton.addEventListener("click", previewForm);
    }
    
    // Dynamic content toggle
    const dynamicContentToggle = document.getElementById("enable-dynamic-content");
    if (dynamicContentToggle) {
        dynamicContentToggle.addEventListener("change", function() {
            const dynamicContentContainer = document.getElementById("dynamic-content-container");
            if (this.checked) {
                dynamicContentContainer.style.display = "block";
                if (!window.formBuilderState.form.end_screen.dynamic_content) {
                    window.formBuilderState.form.end_screen.dynamic_content = {};
                }
            } else {
                dynamicContentContainer.style.display = "none";
                window.formBuilderState.form.end_screen.dynamic_content = null;
            }
        });
    }
    
    // Add dynamic rule button
    const addDynamicRuleBtn = document.getElementById("add-dynamic-rule");
    if (addDynamicRuleBtn) {
        addDynamicRuleBtn.addEventListener("click", openDynamicRuleModal);
    }
    
    // Dynamic rule modal save button
    const saveDynamicRuleBtn = document.getElementById("save-dynamic-rule");
    if (saveDynamicRuleBtn) {
        saveDynamicRuleBtn.addEventListener("click", saveDynamicRule);
    }
    
    // Question edit modal save button
    const saveQuestionEditBtn = document.getElementById("save-question-edit");
    if (saveQuestionEditBtn) {
        saveQuestionEditBtn.addEventListener("click", saveQuestionEdit);
    }
    
    // Cancel buttons for modals
    document.querySelectorAll(".modal-close, #cancel-question-edit, #cancel-dynamic-rule, #close-preview").forEach(btn => {
        btn.addEventListener("click", function() {
            closeAllModals();
        });
    });
    
    // Form settings inputs
    const maxResponsesInput = document.getElementById("max-responses");
    if (maxResponsesInput) {
        maxResponsesInput.addEventListener("input", function() {
            window.formBuilderState.form.max_responses = this.value ? parseInt(this.value) : null;
        });
    }
    
    const expirationDateInput = document.getElementById("expiration-date");
    if (expirationDateInput) {
        expirationDateInput.addEventListener("change", function() {
            window.formBuilderState.form.expiration_date = this.value ? new Date(this.value).toISOString() : null;
        });
    }
    
    const customSlugInput = document.getElementById("custom-slug");
    if (customSlugInput) {
        customSlugInput.addEventListener("input", function() {
            window.formBuilderState.form.custom_slug = this.value ? this.value : null;
        });
    }
    
    // Theme options
    document.querySelectorAll(".theme-option").forEach(option => {
        option.addEventListener("click", function() {
            document.querySelectorAll(".theme-option").forEach(opt => opt.classList.remove("active"));
            this.classList.add("active");
            
            const theme = this.dataset.theme;
            window.formBuilderState.form.theme.name = theme;
            
            // Set theme colors
            switch (theme) {
                case "dark":
                    window.formBuilderState.form.theme.primary_color = "#ffffff";
                    window.formBuilderState.form.theme.background_color = "#222222";
                    window.formBuilderState.form.theme.text_color = "#ffffff";
                    break;
                case "colorful":
                    window.formBuilderState.form.theme.primary_color = "#3498db";
                    window.formBuilderState.form.theme.background_color = "#f9f9f9";
                    window.formBuilderState.form.theme.text_color = "#333333";
                    break;
                default: // light
                    window.formBuilderState.form.theme.primary_color = "#000000";
                    window.formBuilderState.form.theme.background_color = "#ffffff";
                    window.formBuilderState.form.theme.text_color = "#333333";
                    break;
            }
        });
    });
    
    // Start screen fields
    const startTitleInput = document.getElementById("start-title");
    if (startTitleInput) {
        startTitleInput.addEventListener("input", function() {
            window.formBuilderState.form.start_screen.title = this.value;
        });
    }
    
    const startDescriptionInput = document.getElementById("start-description");
    if (startDescriptionInput) {
        startDescriptionInput.addEventListener("input", function() {
            window.formBuilderState.form.start_screen.description = this.value;
        });
    }
    
    const startCustomCssInput = document.getElementById("start-custom-css");
    if (startCustomCssInput) {
        startCustomCssInput.addEventListener("input", function() {
            window.formBuilderState.form.start_screen.custom_css = this.value;
        });
    }
    
    // End screen fields
    const endTitleInput = document.getElementById("end-title");
    if (endTitleInput) {
        endTitleInput.addEventListener("input", function() {
            window.formBuilderState.form.end_screen.title = this.value;
        });
    }
    
    const endDescriptionInput = document.getElementById("end-description");
    if (endDescriptionInput) {
        endDescriptionInput.addEventListener("input", function() {
            window.formBuilderState.form.end_screen.description = this.value;
        });
    }
    
    const endCustomCssInput = document.getElementById("end-custom-css");
    if (endCustomCssInput) {
        endCustomCssInput.addEventListener("input", function() {
            window.formBuilderState.form.end_screen.custom_css = this.value;
        });
    }
    
    // Image upload handlers
    setupImageUpload("start-bg-image", "start-image-preview", (imageUrl) => {
        window.formBuilderState.form.start_screen.background_image = imageUrl;
    });
    
    setupImageUpload("end-bg-image", "end-image-preview", (imageUrl) => {
        window.formBuilderState.form.end_screen.background_image = imageUrl;
    });
}

function changeSection(sectionId) {
    // Update active section in UI
    document.querySelectorAll(".form-sections li").forEach(section => {
        section.classList.remove("active");
        if (section.dataset.section === sectionId) {
            section.classList.add("active");
        }
    });
    
    // Show the selected section
    document.querySelectorAll(".builder-section").forEach(section => {
        section.classList.remove("active");
    });
    
    document.getElementById(`${sectionId}-section`).classList.add("active");
    
    // Update current section in state
    window.formBuilderState.currentSection = sectionId;
}

function addNewQuestion(type) {
    const questionId = `q${Date.now()}`;
    window.formBuilderState.questionCounter++;
    
    const question = {
        id: questionId,
        type: type,
        title: `Question ${window.formBuilderState.questionCounter}`,
        description: "",
        required: false,
        options: null,
        min_value: null,
        max_value: null,
        validation: null,
        logic: null
    };
    
    // Add default options for choice-based questions
    if (["multiple_choice", "checkbox", "dropdown"].includes(type)) {
        question.options = [
            { value: "option1", label: "Option 1" },
            { value: "option2", label: "Option 2" },
            { value: "option3", label: "Option 3" }
        ];
    }
    
    // Add default min/max for number, rating, scale
    if (["number", "rating", "scale"].includes(type)) {
        if (type === "rating") {
            question.min_value = 1;
            question.max_value = 5;
        } else if (type === "scale") {
            question.min_value = 0;
            question.max_value = 10;
        }
    }
    
    // Add question to state
    window.formBuilderState.form.questions.push(question);
    
    // Render the new question
    renderQuestion(question, window.formBuilderState.form.questions.length - 1);
    
    // Switch to questions section if not already there
    changeSection("questions");
}

function renderQuestion(question, index) {
    const questionsContainer = document.getElementById("questions-container");
    
    // Remove empty state if this is the first question
    if (index === 0) {
        questionsContainer.innerHTML = "";
    }
    
    // Create question element from template
    const template = document.getElementById("question-template");
    const questionElement = document.createElement("div");
    
    // Clone template content
    const templateContent = template.innerHTML;
    
    // Get type icon
    const typeIcon = getQuestionTypeIcon(question.type);
    
    // Get preview content
    const previewContent = getQuestionPreviewContent(question);
    
    // Replace placeholders
    const questionHtml = templateContent
        .replace(/{{id}}/g, question.id)
        .replace(/{{title}}/g, question.title)
        .replace(/{{type-icon}}/g, typeIcon)
        .replace(/{{preview-content}}/g, previewContent);
    
    questionElement.innerHTML = questionHtml;
    questionElement.querySelector(".question-item").dataset.index = index;
    
    // Set required toggle state
    const requiredCheckbox = questionElement.querySelector(".required-checkbox");
    if (requiredCheckbox) {
        requiredCheckbox.checked = question.required;
        requiredCheckbox.addEventListener("change", function() {
            window.formBuilderState.form.questions[index].required = this.checked;
        });
    }
    
    // Add event listeners for actions
    questionElement.querySelector(".btn-edit").addEventListener("click", function() {
        editQuestion(question.id, index);
    });
    
    questionElement.querySelector(".btn-duplicate").addEventListener("click", function() {
        duplicateQuestion(question.id, index);
    });
    
    questionElement.querySelector(".btn-delete").addEventListener("click", function() {
        deleteQuestion(question.id, index);
    });
    
    questionElement.querySelector(".btn-logic").addEventListener("click", function() {
        openLogicModal(question.id, index);
    });
    
    // Append to container
    questionsContainer.appendChild(questionElement.firstElementChild);
    
    // Make questions sortable
    makeQuestionsSortable();
}

function getQuestionTypeIcon(type) {
    const icons = {
        text: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>',
        paragraph: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>',
        multiple_choice: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>',
        checkbox: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
        dropdown: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
        email: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
        phone: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
        number: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
        date: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
        time: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
        url: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
        rating: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
        scale: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>',
        location: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
        file: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>'
    };
    
    return icons[type] || icons.text;
}

function getQuestionPreviewContent(question) {
    let previewContent = '';
    
    switch (question.type) {
        case 'text':
            previewContent = '<input type="text" class="preview-input" placeholder="Short text answer" disabled>';
            break;
        case 'paragraph':
            previewContent = '<textarea class="preview-textarea" placeholder="Long text answer" disabled></textarea>';
            break;
        case 'multiple_choice':
            if (question.options && question.options.length > 0) {
                previewContent = '<div class="preview-options">';
                question.options.forEach(option => {
                    previewContent += `
                        <div class="preview-option">
                            <span class="preview-radio"></span>
                            <span class="preview-option-label">${option.label}</span>
                        </div>
                    `;
                });
                previewContent += '</div>';
            }
            break;
        case 'checkbox':
            if (question.options && question.options.length > 0) {
                previewContent = '<div class="preview-options">';
                question.options.forEach(option => {
                    previewContent += `
                        <div class="preview-option">
                            <span class="preview-checkbox"></span>
                            <span class="preview-option-label">${option.label}</span>
                        </div>
                    `;
                });
                previewContent += '</div>';
            }
            break;
        case 'dropdown':
            if (question.options && question.options.length > 0) {
                previewContent = '<select class="preview-select" disabled>';
                previewContent += '<option>Select an option</option>';
                question.options.forEach(option => {
                    previewContent += `<option>${option.label}</option>`;
                });
                previewContent += '</select>';
            }
            break;
        case 'rating':
            previewContent = '<div class="preview-rating">';
            const maxRating = question.max_value || 5;
            for (let i = 1; i <= maxRating; i++) {
                previewContent += `<span class="preview-star">${i}</span>`;
            }
            previewContent += '</div>';
            break;
            case 'scale':
                previewContent = '<div class="preview-scale">';
                previewContent += '<input type="range" class="preview-range" disabled>';
                previewContent += '</div>';
                break;
            case 'email':
                previewContent = '<input type="email" class="preview-input" placeholder="Email address" disabled>';
                break;
            case 'phone':
                previewContent = '<input type="tel" class="preview-input" placeholder="Phone number" disabled>';
                break;
            case 'number':
                previewContent = '<input type="number" class="preview-input" placeholder="Number" disabled>';
                break;
            case 'date':
                previewContent = '<input type="date" class="preview-input" disabled>';
                break;
            case 'time':
                previewContent = '<input type="time" class="preview-input" disabled>';
                break;
            case 'url':
                previewContent = '<input type="url" class="preview-input" placeholder="Website URL" disabled>';
                break;
            case 'location':
                previewContent = '<div class="preview-location">';
                previewContent += '<input type="text" class="preview-input" placeholder="Enter location" disabled>';
                previewContent += '<button class="preview-location-btn" disabled>Use Current Location</button>';
                previewContent += '</div>';
                break;
            case 'file':
                previewContent = '<div class="preview-file">';
                previewContent += '<button class="preview-file-btn" disabled>Upload File</button>';
                previewContent += '</div>';
                break;
            default:
                previewContent = '<input type="text" class="preview-input" placeholder="Answer" disabled>';
        }
        
        return previewContent;
    }
    
    function editQuestion(questionId, index) {
        const question = window.formBuilderState.form.questions[index];
        if (!question) return;
        
        // Store the question being edited
        window.formBuilderState.editingQuestion = question;
        window.formBuilderState.editingQuestionIndex = index;
        
        // Open edit modal
        const modal = document.getElementById("question-edit-modal");
        if (!modal) return;
        
        // Fill in form fields
        document.getElementById("edit-question-title").value = question.title;
        document.getElementById("edit-question-description").value = question.description || "";
        document.getElementById("edit-question-required").checked = question.required;
        
        // Render type-specific options
        renderQuestionOptions(question);
        
        // Show modal
        modal.classList.add("active");
    }
    
    function renderQuestionOptions(question) {
        const optionsContainer = document.getElementById("edit-question-options");
        if (!optionsContainer) return;
        
        optionsContainer.innerHTML = "";
        
        switch (question.type) {
            case 'multiple_choice':
            case 'checkbox':
            case 'dropdown':
                renderChoiceOptions(question, optionsContainer);
                break;
            case 'rating':
            case 'scale':
                renderScaleOptions(question, optionsContainer);
                break;
            case 'number':
                renderNumberOptions(question, optionsContainer);
                break;
            case 'file':
                renderFileOptions(question, optionsContainer);
                break;
            // Other types don't need special options
        }
    }
    
    function renderChoiceOptions(question, container) {
        const options = question.options || [];
        
        // Create options container
        const optionsWrapper = document.createElement("div");
        optionsWrapper.className = "options-wrapper";
        
        // Add label
        const label = document.createElement("label");
        label.textContent = "Options";
        optionsWrapper.appendChild(label);
        
        // Add options list
        const optionsList = document.createElement("div");
        optionsList.className = "options-list";
        optionsList.id = "options-list";
        
        options.forEach((option, index) => {
            const optionItem = document.createElement("div");
            optionItem.className = "option-item";
            
            optionItem.innerHTML = `
                <input type="text" class="option-label" value="${option.label}" placeholder="Option label">
                <button class="btn-small btn-outline btn-delete-option" data-index="${index}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            `;
            
            optionsList.appendChild(optionItem);
        });
        
        optionsWrapper.appendChild(optionsList);
        
        // Add "Add Option" button
        const addOptionBtn = document.createElement("button");
        addOptionBtn.className = "btn btn-outline";
        addOptionBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add Option
        `;
        addOptionBtn.addEventListener("click", function() {
            const newOption = { value: `option${Date.now()}`, label: "New Option" };
            question.options.push(newOption);
            
            // Re-render options
            renderChoiceOptions(question, container);
        });
        
        optionsWrapper.appendChild(addOptionBtn);
        
        // Add event listeners for option deletion
        optionsWrapper.addEventListener("click", function(e) {
            if (e.target.closest(".btn-delete-option")) {
                const index = e.target.closest(".btn-delete-option").dataset.index;
                question.options.splice(index, 1);
                
                // Re-render options
                renderChoiceOptions(question, container);
            }
        });
        
        // Add event listeners for option label changes
        optionsWrapper.addEventListener("input", function(e) {
            if (e.target.classList.contains("option-label")) {
                const optionItem = e.target.closest(".option-item");
                const index = Array.from(optionItem.parentNode.children).indexOf(optionItem);
                
                if (index !== -1 && question.options[index]) {
                    question.options[index].label = e.target.value;
                }
            }
        });
        
        container.appendChild(optionsWrapper);
    }
    
    function renderScaleOptions(question, container) {
        const scaleWrapper = document.createElement("div");
        scaleWrapper.className = "scale-options";
        
        // Min value
        const minGroup = document.createElement("div");
        minGroup.className = "form-group";
        
        const minLabel = document.createElement("label");
        minLabel.textContent = "Minimum Value";
        minGroup.appendChild(minLabel);
        
        const minInput = document.createElement("input");
        minInput.type = "number";
        minInput.value = question.min_value || (question.type === 'rating' ? 1 : 0);
        minInput.addEventListener("input", function() {
            question.min_value = parseInt(this.value);
        });
        minGroup.appendChild(minInput);
        
        scaleWrapper.appendChild(minGroup);
        
        // Max value
        const maxGroup = document.createElement("div");
        maxGroup.className = "form-group";
        
        const maxLabel = document.createElement("label");
        maxLabel.textContent = "Maximum Value";
        maxGroup.appendChild(maxLabel);
        
        const maxInput = document.createElement("input");
        maxInput.type = "number";
        maxInput.value = question.max_value || (question.type === 'rating' ? 5 : 10);
        maxInput.addEventListener("input", function() {
            question.max_value = parseInt(this.value);
        });
        maxGroup.appendChild(maxInput);
        
        scaleWrapper.appendChild(maxGroup);
        
        container.appendChild(scaleWrapper);
    }
    
    function renderNumberOptions(question, container) {
        const numberWrapper = document.createElement("div");
        numberWrapper.className = "number-options";
        
        // Min value
        const minGroup = document.createElement("div");
        minGroup.className = "form-group";
        
        const minLabel = document.createElement("label");
        minLabel.textContent = "Minimum Value (optional)";
        minGroup.appendChild(minLabel);
        
        const minInput = document.createElement("input");
        minInput.type = "number";
        minInput.value = question.min_value || "";
        minInput.addEventListener("input", function() {
            question.min_value = this.value ? parseInt(this.value) : null;
        });
        minGroup.appendChild(minInput);
        
        numberWrapper.appendChild(minGroup);
        
        // Max value
        const maxGroup = document.createElement("div");
        maxGroup.className = "form-group";
        
        const maxLabel = document.createElement("label");
        maxLabel.textContent = "Maximum Value (optional)";
        maxGroup.appendChild(maxLabel);
        
        const maxInput = document.createElement("input");
        maxInput.type = "number";
        maxInput.value = question.max_value || "";
        maxInput.addEventListener("input", function() {
            question.max_value = this.value ? parseInt(this.value) : null;
        });
        maxGroup.appendChild(maxInput);
        
        numberWrapper.appendChild(maxGroup);
        
        container.appendChild(numberWrapper);
    }
    
    function renderFileOptions(question, container) {
        const fileWrapper = document.createElement("div");
        fileWrapper.className = "file-options";
        
        // Allowed file types
        const typeGroup = document.createElement("div");
        typeGroup.className = "form-group";
        
        const typeLabel = document.createElement("label");
        typeLabel.textContent = "Allowed File Types (optional)";
        typeGroup.appendChild(typeLabel);
        
        const typeInput = document.createElement("input");
        typeInput.type = "text";
        typeInput.placeholder = "e.g., .pdf, .jpg, .png";
        typeInput.value = question.accept || "";
        typeInput.addEventListener("input", function() {
            question.accept = this.value || null;
        });
        typeGroup.appendChild(typeInput);
        
        fileWrapper.appendChild(typeGroup);
        
        // Multiple files
        const multipleGroup = document.createElement("div");
        multipleGroup.className = "form-group";
        
        const multipleLabel = document.createElement("label");
        multipleLabel.className = "checkbox-label";
        
        const multipleInput = document.createElement("input");
        multipleInput.type = "checkbox";
        multipleInput.checked = question.multiple || false;
        multipleInput.addEventListener("change", function() {
            question.multiple = this.checked;
        });
        
        multipleLabel.appendChild(multipleInput);
        multipleLabel.appendChild(document.createTextNode("Allow multiple files"));
        
        multipleGroup.appendChild(multipleLabel);
        
        fileWrapper.appendChild(multipleGroup);
        
        container.appendChild(fileWrapper);
    }
    
    function saveQuestionEdit() {
        const question = window.formBuilderState.editingQuestion;
        const index = window.formBuilderState.editingQuestionIndex;
        
        if (!question) return;
        
        // Update question properties
        question.title = document.getElementById("edit-question-title").value;
        question.description = document.getElementById("edit-question-description").value;
        question.required = document.getElementById("edit-question-required").checked;
        
        // Update question in state
        window.formBuilderState.form.questions[index] = question;
        
        // Re-render the question
        const questionElement = document.querySelector(`.question-item[data-id="${question.id}"]`);
        if (questionElement) {
            questionElement.querySelector(".question-title").textContent = question.title;
            
            // Update preview content
            const previewElement = questionElement.querySelector(".question-preview");
            previewElement.innerHTML = getQuestionPreviewContent(question);
            
            // Update required toggle
            questionElement.querySelector(".required-checkbox").checked = question.required;
        }
        
        // Close modal
        closeAllModals();
        
        // Clear editing state
        window.formBuilderState.editingQuestion = null;
        window.formBuilderState.editingQuestionIndex = -1;
    }
    
    function duplicateQuestion(questionId, index) {
        const question = window.formBuilderState.form.questions[index];
        if (!question) return;
        
        // Create a deep copy of the question
        const newQuestion = JSON.parse(JSON.stringify(question));
        newQuestion.id = `q${Date.now()}`;
        newQuestion.title = `${question.title} (Copy)`;
        
        // Add to questions array
        window.formBuilderState.form.questions.splice(index + 1, 0, newQuestion);
        
        // Render the new question
        renderQuestion(newQuestion, index + 1);
        
        // Update indices for all questions after this one
        const questionElements = document.querySelectorAll(".question-item");
        for (let i = index + 2; i < window.formBuilderState.form.questions.length; i++) {
            if (questionElements[i]) {
                questionElements[i].dataset.index = i;
            }
        }
    }
    
    function deleteQuestion(questionId, index) {
        // Remove from questions array
        window.formBuilderState.form.questions.splice(index, 1);
        
        // Remove from DOM
        const questionElement = document.querySelector(`.question-item[data-id="${questionId}"]`);
        if (questionElement) {
            questionElement.remove();
        }
        
        // Update indices for all questions after this one
        const questionElements = document.querySelectorAll(".question-item");
        for (let i = index; i < window.formBuilderState.form.questions.length; i++) {
            if (questionElements[i]) {
                questionElements[i].dataset.index = i;
            }
        }
        
        // Show empty state if no questions left
        if (window.formBuilderState.form.questions.length === 0) {
            const questionsContainer = document.getElementById("questions-container");
            questionsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                    </div>
                    <h3>No questions yet</h3>
                    <p>Add a question from the sidebar to get started</p>
                </div>
            `;
        }
    }
    
    function openLogicModal(questionId, index) {
        const question = window.formBuilderState.form.questions[index];
        if (!question) return;
        
        // Store the question being edited
        window.formBuilderState.editingQuestion = question;
        window.formBuilderState.editingQuestionIndex = index;
        
        // Open logic modal
        const modal = document.getElementById("logic-modal");
        if (!modal) return;
        
        // Render logic rules
        renderLogicRules(question);
        
        // Show modal
        modal.classList.add("active");
    }
    
    function renderLogicRules(question) {
        const rulesContainer = document.getElementById("logic-rules-container");
        if (!rulesContainer) return;
        
        // Clear container
        rulesContainer.innerHTML = "";
        
        // If no logic rules yet, show empty state
        if (!question.logic || question.logic.length === 0) {
            rulesContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                    </div>
                    <h4>No logic rules yet</h4>
                    <p>Add a rule to control the flow of your form</p>
                </div>
            `;
            return;
        }
        
        // Render each logic rule
        question.logic.forEach((rule, index) => {
            const ruleElement = document.createElement("div");
            ruleElement.className = "logic-rule";
            
            // Get question title for condition
            const conditionQuestion = window.formBuilderState.form.questions.find(q => q.id === rule.condition.question_id);
            const questionTitle = conditionQuestion ? conditionQuestion.title : "Unknown question";
            
            // Get target title for action
            let targetTitle = "end of form";
            if (rule.action.type === "jump_to" && rule.action.target_id) {
                const targetQuestion = window.formBuilderState.form.questions.find(q => q.id === rule.action.target_id);
                targetTitle = targetQuestion ? targetQuestion.title : "Unknown question";
            }
            
            ruleElement.innerHTML = `
                <div class="rule-header">
                    <div class="rule-title">Rule ${index + 1}</div>
                    <div class="rule-actions">
                        <button class="rule-action btn-edit-rule" data-index="${index}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="rule-action btn-delete-rule" data-index="${index}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                </div>
                <div class="rule-content">
                    <p>If answer to "<strong>${questionTitle}</strong>" ${rule.condition.operator} "${rule.condition.value}"</p>
                    <p>Then ${rule.action.type} to <strong>${targetTitle}</strong></p>
                </div>
            `;
            
            rulesContainer.appendChild(ruleElement);
        });
    }
    
    function openDynamicRuleModal() {
        const modal = document.getElementById("dynamic-rule-modal");
        if (!modal) return;
        
        // Populate question dropdown
        const questionSelect = document.getElementById("dynamic-rule-question");
        if (questionSelect) {
            questionSelect.innerHTML = '<option value="">Select a question</option>';
            
            window.formBuilderState.form.questions.forEach(question => {
                questionSelect.innerHTML += `<option value="${question.id}">${question.title}</option>`;
            });
        }
        
        // Show modal
        modal.classList.add("active");
    }
    
    function saveDynamicRule() {
        const questionId = document.getElementById("dynamic-rule-question").value;
        const condition = document.getElementById("dynamic-rule-condition").value;
        const value = document.getElementById("dynamic-rule-value").value;
        const title = document.getElementById("dynamic-content-title").value;
        const description = document.getElementById("dynamic-content-description").value;
        
        if (!questionId || !condition || !value) {
            alert("Please fill in all required fields");
            return;
        }
        
        // Initialize dynamic content if not exists
        if (!window.formBuilderState.form.end_screen.dynamic_content) {
            window.formBuilderState.form.end_screen.dynamic_content = {};
        }
        
        // Initialize question conditions if not exists
        if (!window.formBuilderState.form.end_screen.dynamic_content[questionId]) {
            window.formBuilderState.form.end_screen.dynamic_content[questionId] = {};
        }
        
        // Add rule
        const conditionKey = `${condition}:${value}`;
        window.formBuilderState.form.end_screen.dynamic_content[questionId][conditionKey] = {
            title: title,
            description: description
        };
        
        // Re-render dynamic rules
        renderDynamicRules(window.formBuilderState.form.end_screen.dynamic_content);
        
        // Close modal
        closeAllModals();
    }
    
    function renderDynamicRules(dynamicContent) {
        const rulesContainer = document.getElementById("dynamic-rules-list");
        if (!rulesContainer) return;
        
        // Clear container
        rulesContainer.innerHTML = "";
        
        // If no dynamic rules, show empty state
        if (!dynamicContent || Object.keys(dynamicContent).length === 0) {
            rulesContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                    </div>
                    <h4>No rules yet</h4>
                    <p>Add a rule to show different content based on responses</p>
                </div>
            `;
            return;
        }
        
        // Render each dynamic rule
        let ruleIndex = 0;
        for (const questionId in dynamicContent) {
            const question = window.formBuilderState.form.questions.find(q => q.id === questionId);
            const questionTitle = question ? question.title : "Unknown question";
            
            for (const conditionKey in dynamicContent[questionId]) {
                const content = dynamicContent[questionId][conditionKey];
                const [condition, value] = conditionKey.split(':');
                
                const ruleElement = document.createElement("div");
                ruleElement.className = "dynamic-rule";
                
                ruleElement.innerHTML = `
                    <div class="rule-header">
                        <div class="rule-title">Rule ${ruleIndex + 1}</div>
                        <div class="rule-actions">
                            <button class="rule-action btn-delete-dynamic-rule" data-question="${questionId}" data-condition="${conditionKey}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        </div>
                    </div>
                    <div class="rule-content">
                        <p>If answer to "<strong>${questionTitle}</strong>" ${condition} "${value}"</p>
                        <p>Show: <strong>${content.title}</strong></p>
                    </div>
                `;
                
                rulesContainer.appendChild(ruleElement);
                ruleIndex++;
            }
        }
        
        // Add event listeners for rule deletion
        rulesContainer.addEventListener("click", function(e) {
            if (e.target.closest(".btn-delete-dynamic-rule")) {
                const button = e.target.closest(".btn-delete-dynamic-rule");
                const questionId = button.dataset.question;
                const conditionKey = button.dataset.condition;
                
                // Delete the rule
                delete window.formBuilderState.form.end_screen.dynamic_content[questionId][conditionKey];
                
                // If no more rules for this question, delete the question entry
                if (Object.keys(window.formBuilderState.form.end_screen.dynamic_content[questionId]).length === 0) {
                    delete window.formBuilderState.form.end_screen.dynamic_content[questionId];
                }
                
                // If no more rules at all, set dynamic_content to null
                if (Object.keys(window.formBuilderState.form.end_screen.dynamic_content).length === 0) {
                    window.formBuilderState.form.end_screen.dynamic_content = null;
                }
                
                // Re-render dynamic rules
                renderDynamicRules(window.formBuilderState.form.end_screen.dynamic_content);
            }
        });
    }
    
    function makeQuestionsSortable() {
        // For a real implementation, you would use a library like SortableJS
        // This is a simplified version
        const questionsContainer = document.getElementById("questions-container");
        if (!questionsContainer) return;
        
        // Add drag handles and make sortable
        const questionItems = questionsContainer.querySelectorAll(".question-item");
        questionItems.forEach(item => {
            // Add drag handle if not already present
            if (!item.querySelector(".drag-handle")) {
                const dragHandle = document.createElement("div");
                dragHandle.className = "drag-handle";
                dragHandle.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="1"></circle><circle cx="8" cy="16" r="1"></circle><circle cx="16" cy="8" r="1"></circle><circle cx="16" cy="16" r="1"></circle></svg>
                `;
                item.querySelector(".question-header").insertBefore(dragHandle, item.querySelector(".question-type-indicator"));
            }
        });
        
        // In a real implementation, you would initialize SortableJS here
        // and update the questions array when items are reordered
    }
    
    async function saveForm() {
        const token = localStorage.getItem("token");
        if (!token) {
            alert("You must be logged in to save a form");
            return;
        }
        
        try {
            // Get form data from state
            const formData = window.formBuilderState.form;
            
            // Validate form data
            if (!formData.title) {
                alert("Please enter a form title");
                return;
            }
            
            if (!formData.start_screen.title) {
                alert("Please enter a start screen title");
                changeSection("start-screen");
                return;
            }
            
            if (!formData.end_screen.title) {
                alert("Please enter an end screen title");
                changeSection("end-screen");
                return;
            }
            
            if (formData.questions.length === 0) {
                alert("Please add at least one question");
                changeSection("questions");
                return;
            }
            
            // Check if editing existing form or creating new one
            const urlParams = new URLSearchParams(window.location.search);
            const formId = urlParams.get("id");
            
            let response;
            if (formId) {
                // Update existing form
                response = await fetch(`${API_URL}/forms/${formId}`, {
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
                const errorData = await response.json();
                throw new Error(errorData.detail || "Failed to save form");
            }
            
            const savedForm = await response.json();
            
            // Show success message
            alert("Form saved successfully!");
            
            // Redirect to forms page
            window.location.href = "forms.html";
            
        } catch (error) {
            console.error("Error saving form:", error);
            alert("Error saving form: " + error.message);
        }
    }
    
    function previewForm() {
        // Create a preview modal
        const modal = document.getElementById("preview-modal");
        if (!modal) return;
        
        // Get the preview iframe
        const previewFrame = document.getElementById("preview-frame");
        if (!previewFrame) return;
        
        // Create a temporary HTML document for preview
        const formData = window.formBuilderState.form;
        
        // Generate HTML for the form preview
        const previewHtml = generatePreviewHtml(formData);
        
        // Set the iframe content
        previewFrame.srcdoc = previewHtml;
        
        // Show the modal
        modal.classList.add("active");
    }
    
    function generatePreviewHtml(formData) {
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${formData.title}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: 'Inter', sans-serif;
                background: ${formData.theme?.background_color || '#fff'};
                color: ${formData.theme?.text_color || '#000'};
                min-height: 100vh;
                width: 100%;
                position: relative;
                overflow-x: hidden;
            }
            
            .progress {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 3px;
                background: #eee;
                z-index: 100;
            }
            
            .progress-bar {
                height: 100%;
                width: 0;
                background: ${formData.theme?.primary_color || '#000'};
                transition: width 0.5s ease;
            }
            
            .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 40px 20px;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                position: relative;
            }
            
            .logo {
                position: absolute;
                top: 40px;
                left: 20px;
                font-weight: 500;
                font-size: 20px;
            }
            
            .slide {
                display: none;
                padding-top: 120px;
                animation: fadeIn 0.5s ease forwards;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            .slide.active {
                display: block;
            }
            
            h1 {
                font-size: 32px;
                font-weight: 300;
                margin-bottom: 20px;
                line-height: 1.2;
            }
            
            p {
                font-size: 16px;
                font-weight: 300;
                color: #666;
                margin-bottom: 30px;
                line-height: 1.5;
            }
            
            .input {
                width: 100%;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 8px;
                font-family: 'Inter', sans-serif;
                font-size: 16px;
                margin-bottom: 30px;
                transition: border-color 0.3s ease;
            }
            
            .input:focus {
                outline: none;
                border-color: ${formData.theme?.primary_color || '#000'};
            }
            
            textarea.input {
                min-height: 120px;
                resize: none;
            }
            
            .btn {
                width: 100%;
                padding: 15px;
                background: ${formData.theme?.primary_color || '#000'};
                color: #fff;
                border: none;
                border-radius: 8px;
                font-family: 'Inter', sans-serif;
                font-size: 16px;
                font-weight: 400;
                cursor: pointer;
                transition: background-color 0.3s ease, transform 0.1s ease;
            }
            
            .btn:hover {
                background: ${formData.theme?.primary_color ? adjustColor(formData.theme.primary_color, -20) : '#333'};
            }
            
            .btn:active {
                transform: scale(0.98);
            }
            
            .btn-back {
                background: transparent;
                color: #666;
                border: 1px solid #ddd;
                margin-top: 15px;
            }
            
            .btn-back:hover {
                background: #f5f5f5;
                color: #333;
            }
            
            .rating-group {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-bottom: 30px;
            }
            
            .rating-btn {
                width: 45px;
                height: 45px;
                border-radius: 50%;
                border: 1px solid #ddd;
                background: transparent;
                font-size: 16px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .rating-btn:hover {
                border-color: #999;
                background: #f9f9f9;
            }
            
            .rating-btn.selected {
                background: ${formData.theme?.primary_color || '#000'};
                color: #fff;
                border-color: ${formData.theme?.primary_color || '#000'};
            }
            
            .options {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 30px;
            }
            
            .option {
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 8px;
                cursor: pointer;
                text-align: left;
                transition: all 0.3s ease;
            }
            
            .option:hover {
                border-color: #999;
                background: #f9f9f9;
            }
            
            .option.selected {
                border-color: ${formData.theme?.primary_color || '#000'};
                background: #f9f9f9;
            }
            
            .option h3 {
                font-size: 16px;
                font-weight: 500;
                margin-bottom: 5px;
            }
            
            .option p {
                font-size: 14px;
                margin-bottom: 0;
            }
            
            .checkbox-option {
                display: flex;
                align-items: flex-start;
                padding: 12px 15px;
                border: 1px solid #ddd;
                border-radius: 8px;
                margin-bottom: 10px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .checkbox-option:hover {
                border-color: #999;
                background: #f9f9f9;
            }
            
            .checkbox-option.selected {
                border-color: ${formData.theme?.primary_color || '#000'};
                background: #f9f9f9;
            }
            
            .checkbox-option input {
                margin-right: 10px;
                margin-top: 3px;
            }
            
            .checkbox-option label {
                flex: 1;
                cursor: pointer;
            }
            
            .success {
                text-align: center;
                padding-top: 60px;
            }
            
            .checkmark {
                width: 80px;
                height: 80px;
                margin: 0 auto 30px;
            }
            
            .checkmark svg {
                width: 100%;
                height: 100%;
            }
            
            @media (max-width: 480px) {
                .options {
                    grid-template-columns: 1fr;
                }
                
                .logo {
                    font-size: 18px;
                    top: 30px;
                }
                
                .slide {
                    padding-top: 100px;
                }
                
                h1 {
                    font-size: 28px;
                }
            }
            
            ${formData.theme?.custom_css || ''}
            ${formData.start_screen?.custom_css || ''}
            ${formData.end_screen?.custom_css || ''}
        </style>
    </head>
    <body>
        <div class="progress">
            <div class="progress-bar" id="progress"></div>
        </div>
        
        <div class="container">
            <div class="logo">FlyForms</div>
            
            <!-- Start Screen -->
            <div class="slide active" id="slide-start">
                <h1>${formData.start_screen.title}</h1>
                <p>${formData.start_screen.description || ''}</p>
                <button class="btn" onclick="nextSlide('start')">Get Started</button>
            </div>
            
            <!-- Questions -->
            ${formData.questions.map((question, index) => `
                <div class="slide" id="slide-${question.id}">
                    <h1>${question.title}</h1>
                    ${question.description ? `<p>${question.description}</p>` : ''}
                    ${getQuestionInputHtml(question)}
                    <div class="button-container">
                        <button class="btn" onclick="nextSlide('${question.id}')">${index === formData.questions.length - 1 ? 'Submit' : 'Continue'}</button>
                        <button class="btn btn-back" onclick="prevSlide('${question.id}', ${index})">Back</button>
                    </div>
                </div>
            `).join('')}
            
            <!-- End Screen -->
            <div class="slide" id="slide-end">
                <div class="success">
                    <div class="checkmark">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                            <circle cx="26" cy="26" r="25" fill="none" stroke="${formData.theme?.primary_color || '#000'}" stroke-width="2"/>
                            <path fill="none" stroke="${formData.theme?.primary_color || '#000'}" stroke-width="2" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                        </svg>
                    </div>
                    <h1>${formData.end_screen.title}</h1>
                    <p>${formData.end_screen.description || ''}</p>
                    <button class="btn" onclick="resetForm()">Start Over</button>
                </div>
            </div>
        </div>
        
        <script>
            let currentSlide = 'start';
            const questions = ${JSON.stringify(formData.questions.map(q => q.id))};
            const totalSlides = questions.length + 2; // start + questions + end
            
            // Update progress bar
            function updateProgress() {
                let currentIndex;
                
                if (currentSlide === 'start') {
                    currentIndex = 0;
                } else if (currentSlide === 'end') {
                    currentIndex = totalSlides - 1;
                } else {
                    currentIndex = questions.indexOf(currentSlide) + 1;
                }
                
                const percent = (currentIndex / (totalSlides - 1)) * 100;
                document.getElementById('progress').style.width = percent + '%';
            }
            
            // Go to next slide
            function nextSlide(currentId) {
                // Hide current slide
                document.getElementById('slide-' + currentId).classList.remove('active');
                
                // Determine next slide
                let nextId;
                
                if (currentId === 'start') {
                    // If we're on start screen, go to first question
                    nextId = questions[0];
                } else if (currentId === 'end') {
                    // If we're on end screen, reset form
                    resetForm();
                    return;
                } else {
                    // Find current question index
                    const currentIndex = questions.indexOf(currentId);
                    
                    if (currentIndex === questions.length - 1) {
                        // If this is the last question, go to end screen
                        nextId = 'end';
                    } else {
                        // Otherwise go to next question
                        nextId = questions[currentIndex + 1];
                    }
                }
                
                // Show next slide
                document.getElementById('slide-' + nextId).classList.add('active');
                
                // Update current slide
                currentSlide = nextId;
                
                // Update progress bar
                updateProgress();
            }
            
            // Go to previous slide
            function prevSlide(currentId, currentIndex) {
                // Hide current slide
                document.getElementById('slide-' + currentId).classList.remove('active');
                
                // Determine previous slide
                let prevId;
                
                if (currentIndex === 0) {
                    // If we're on the first question, go back to start screen
                    prevId = 'start';
                } else {
                    // Otherwise go to the previous question
                    prevId = questions[currentIndex - 1];
                }
                
                // Show previous slide
                document.getElementById('slide-' + prevId).classList.add('active');
                
                // Update current slide
                currentSlide = prevId;
                
                // Update progress bar
                updateProgress();
            }
            
            // Reset form
            function resetForm() {
                // Hide current slide
                document.getElementById('slide-' + currentSlide).classList.remove('active');
                
                // Show start slide
                document.getElementById('slide-start').classList.add('active');
                
                // Reset current slide
                currentSlide = 'start';
                
                // Update progress bar
                updateProgress();
                
                // Reset all inputs
                document.querySelectorAll('input, textarea').forEach(input => {
                    input.value = '';
                });
                
                document.querySelectorAll('.selected').forEach(selected => {
                    selected.classList.remove('selected');
                });
            }
            
            // Initialize
            updateProgress();
        </script>
    </body>
    </html>
    `;
}

function getQuestionInputHtml(question) {
    let inputHtml = '';
    
    switch (question.type) {
        case 'text':
            inputHtml = `<input type="text" class="input" id="input-${question.id}" placeholder="Your answer">`;
            break;
        case 'paragraph':
            inputHtml = `<textarea class="input" id="input-${question.id}" placeholder="Your answer"></textarea>`;
            break;
        case 'multiple_choice':
            if (question.options && question.options.length > 0) {
                inputHtml = `<div class="options">`;
                question.options.forEach(option => {
                    inputHtml += `
                        <div class="option" onclick="this.parentNode.querySelectorAll('.option').forEach(o => o.classList.remove('selected')); this.classList.add('selected');" data-value="${option.value}">
                            <h3>${option.label}</h3>
                            ${option.description ? `<p>${option.description}</p>` : ''}
                        </div>
                    `;
                });
                inputHtml += `</div>`;
            }
            break;
        case 'checkbox':
            if (question.options && question.options.length > 0) {
                inputHtml = `<div class="checkbox-list">`;
                question.options.forEach(option => {
                    inputHtml += `
                        <div class="checkbox-option" onclick="this.classList.toggle('selected'); this.querySelector('input').checked = !this.querySelector('input').checked;">
                            <input type="checkbox" id="checkbox-${question.id}-${option.value}" value="${option.value}" onclick="event.stopPropagation();">
                            <label for="checkbox-${question.id}-${option.value}">${option.label}</label>
                        </div>
                    `;
                });
                inputHtml += `</div>`;
            }
            break;
        case 'dropdown':
            if (question.options && question.options.length > 0) {
                inputHtml = `<select class="input" id="input-${question.id}">`;
                inputHtml += `<option value="" disabled selected>Select an option</option>`;
                question.options.forEach(option => {
                    inputHtml += `<option value="${option.value}">${option.label}</option>`;
                });
                inputHtml += `</select>`;
            }
            break;
        case 'rating':
            inputHtml = `<div class="rating-group">`;
            const maxRating = question.max_value || 5;
            for (let i = 1; i <= maxRating; i++) {
                inputHtml += `<button class="rating-btn" onclick="this.parentNode.querySelectorAll('.rating-btn').forEach(b => b.classList.remove('selected')); this.classList.add('selected');" data-value="${i}">${i}</button>`;
            }
            inputHtml += `</div>`;
            break;
        case 'scale':
            const minValue = question.min_value || 0;
            const maxValue = question.max_value || 10;
            inputHtml = `
                <div class="scale-container">
                    <input type="range" class="scale-slider" id="input-${question.id}" min="${minValue}" max="${maxValue}" value="${Math.floor((maxValue - minValue) / 2) + minValue}">
                    <div class="scale-value" id="scale-value-${question.id}">${Math.floor((maxValue - minValue) / 2) + minValue}</div>
                    <script>
                        document.getElementById("input-${question.id}").oninput = function() {
                            document.getElementById("scale-value-${question.id}").textContent = this.value;
                        };
                    </script>
                </div>
            `;
            break;
        case 'email':
            inputHtml = `<input type="email" class="input" id="input-${question.id}" placeholder="Email address">`;
            break;
        case 'phone':
            inputHtml = `<input type="tel" class="input" id="input-${question.id}" placeholder="Phone number">`;
            break;
        case 'number':
            inputHtml = `<input type="number" class="input" id="input-${question.id}" placeholder="Number"${question.min_value !== null ? ` min="${question.min_value}"` : ''}${question.max_value !== null ? ` max="${question.max_value}"` : ''}>`;
            break;
        case 'date':
            inputHtml = `<input type="date" class="input" id="input-${question.id}">`;
            break;
        case 'time':
            inputHtml = `<input type="time" class="input" id="input-${question.id}">`;
            break;
        case 'url':
            inputHtml = `<input type="url" class="input" id="input-${question.id}" placeholder="Website URL">`;
            break;
        case 'location':
            inputHtml = `
                <div class="location-container">
                    <input type="text" class="input" id="input-${question.id}" placeholder="Enter location">
                    <button type="button" class="btn location-btn" onclick="alert('This is a preview. Location detection would work in the actual form.');">Use Current Location</button>
                </div>
            `;
            break;
        case 'file':
            inputHtml = `
                <div class="file-container">
                    <input type="file" class="input file-input" id="input-${question.id}"${question.multiple ? ' multiple' : ''}${question.accept ? ` accept="${question.accept}"` : ''}>
                </div>
            `;
            break;
        default:
            inputHtml = `<input type="text" class="input" id="input-${question.id}" placeholder="Your answer">`;
    }
    
    return inputHtml;
}

function setupImageUpload(inputId, previewId, onUpload) {
    const fileInput = document.getElementById(inputId);
    const previewElement = document.getElementById(previewId);
    
    if (!fileInput || !previewElement) return;
    
    fileInput.addEventListener("change", function(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // In a real app, you would upload the file to a server
        // For this demo, we'll use a data URL
        const reader = new FileReader();
        reader.onload = function(event) {
            const imageUrl = event.target.result;
            
            // Display preview
            previewElement.innerHTML = `<img src="${imageUrl}" alt="Preview">`;
            
            // Call the callback with the image URL
            onUpload(imageUrl);
        };
        reader.readAsDataURL(file);
    });
}

function closeAllModals() {
    document.querySelectorAll(".modal").forEach(modal => {
        modal.classList.remove("active");
    });
}

// Utility function to darken/lighten colors for hover states
function adjustColor(color, amount) {
    // Remove # if present
    color = color.replace("#", "");
    
    // Parse the color
    let r = parseInt(color.substring(0, 2), 16);
    let g = parseInt(color.substring(2, 4), 16);
    let b = parseInt(color.substring(4, 6), 16);
    
    // Adjust the color
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));
    
    // Convert back to hex
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}