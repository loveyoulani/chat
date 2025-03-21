# main.py
import os
import secrets
import time
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Union, Any

import motor.motor_asyncio
import gridfs
from fastapi import FastAPI, HTTPException, Depends, status, Request, Form, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, Field, EmailStr
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import uuid
import base64
from bson import ObjectId
from bson.errors import InvalidId
import logging
from pymongo import ReturnDocument
import re
from fastapi.middleware.gzip import GZipMiddleware

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the FastAPI app
app = FastAPI(title="Form Builder API", 
              description="API for creating and managing custom forms",
              version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add GZip compression
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# JWT Configuration
SECRET_KEY = os.environ.get("SECRET_KEY") or secrets.token_urlsafe(32)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# MongoDB setup
MONGODB_URL = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)
db = client.formbuilder
fs = gridfs.GridFS(client.formbuilder)

# Database collections
users_collection = db.users
forms_collection = db.forms
submissions_collection = db.submissions
templates_collection = db.templates

# Pydantic models for data validation
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class SpamPreventionLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"

class QuestionType(str, Enum):
    TEXT = "text"
    TEXTAREA = "textarea"
    NUMBER = "number"
    SELECT = "select"
    MULTI_SELECT = "multi_select"
    CHECKBOX = "checkbox"
    RADIO = "radio"
    DATE = "date"
    TIME = "time"
    FILE = "file"
    LOCATION = "location"
    EMAIL = "email"
    PHONE = "phone"
    URL = "url"
    RATING = "rating"
    SLIDER = "slider"

class Option(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    value: str
    label: str
    image_url: Optional[str] = None

class ConditionalLogic(BaseModel):
    question_id: str
    operator: str  # equals, not_equals, contains, etc.
    value: Any
    action: str  # show, hide, skip_to, etc.
    target_id: Optional[str] = None  # Used for skip_to

class Question(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: QuestionType
    title: str
    description: Optional[str] = None
    required: bool = False
    options: Optional[List[Option]] = None
    min_value: Optional[int] = None
    max_value: Optional[int] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    placeholder: Optional[str] = None
    default_value: Optional[Any] = None
    validation_regex: Optional[str] = None
    validation_message: Optional[str] = None
    conditional_logic: Optional[List[ConditionalLogic]] = None
    image_url: Optional[str] = None

class ScreenContent(BaseModel):
    title: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    html_content: Optional[str] = None
    css_content: Optional[str] = None

class EndScreenType(str, Enum):
    STATIC = "static"
    DYNAMIC = "dynamic"

class EndScreenCondition(BaseModel):
    question_id: str
    operator: str
    value: Any
    content: ScreenContent

class FormSettings(BaseModel):
    require_login: bool = False
    limit_responses: Optional[int] = None
    spam_prevention_level: SpamPreventionLevel = SpamPreventionLevel.MEDIUM
    allow_multiple_submissions: bool = True
    expiration_date: Optional[datetime] = None
    custom_success_redirect: Optional[str] = None
    custom_domain: Optional[str] = None
    analytics_enabled: bool = True
    notification_emails: Optional[List[str]] = None

class Form(BaseModel):
    id: Optional[str] = None
    user_id: str
    title: str
    description: Optional[str] = None
    start_screen: ScreenContent
    questions: List[Question]
    end_screen: Union[ScreenContent, List[EndScreenCondition]]
    end_screen_type: EndScreenType = EndScreenType.STATIC
    settings: FormSettings
    is_template: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        schema_extra = {
            "example": {
                "title": "Customer Feedback Form",
                "description": "Help us improve our services",
                "start_screen": {
                    "title": "Customer Feedback",
                    "description": "We value your feedback. Please take a moment to fill out this survey."
                },
                "questions": [
                    {
                        "type": "text",
                        "title": "What is your name?",
                        "required": True,
                        "placeholder": "John Doe"
                    },
                    {
                        "type": "email",
                        "title": "Email address",
                        "required": True
                    },
                    {
                        "type": "multi_select",
                        "title": "What features do you value most?",
                        "description": "Select up to three options",
                        "required": True,
                        "options": [
                            {"value": "1", "label": "Ease of use"},
                            {"value": "2", "label": "Performance"},
                            {"value": "3", "label": "Design"},
                            {"value": "4", "label": "Customer support"}
                        ],
                        "max_value": 3
                    }
                ],
                "end_screen": {
                    "title": "Thank You!",
                    "description": "Your feedback has been submitted."
                },
                "end_screen_type": "static",
                "settings": {
                    "require_login": False,
                    "limit_responses": 100,
                    "spam_prevention_level": "medium"
                }
            }
        }

class FormTemplate(BaseModel):
    id: Optional[str] = None
    title: str
    description: str
    category: str
    preview_image_url: Optional[str] = None
    form_data: Form
    created_at: datetime = Field(default_factory=datetime.utcnow)

class FormSubmission(BaseModel):
    id: Optional[str] = None
    form_id: str
    user_id: Optional[str] = None
    answers: Dict[str, Any]
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_spam: bool = False
    spam_score: float = 0.0

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: Optional[str] = None

class User(BaseModel):
    id: Optional[str] = None
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    disabled: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    subscription_tier: str = "free"  # free, premium, enterprise
    
    class Config:
        schema_extra = {
            "example": {
                "username": "johndoe",
                "email": "john.doe@example.com",
                "full_name": "John Doe"
            }
        }

class UserInDB(User):
    hashed_password: str

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

async def get_user(username: str):
    user = await users_collection.find_one({"username": username})
    if user:
        return UserInDB(**user)

async def authenticate_user(username: str, password: str):
    user = await get_user(username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    user = await get_user(username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    if current_user.disabled:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# Convert MongoDB ObjectId to string
def serialize_doc_id(doc):
    if doc.get('_id'):
        doc['id'] = str(doc.pop('_id'))
    return doc

# Spam detection function
def check_for_spam(submission: FormSubmission, level: SpamPreventionLevel) -> tuple:
    spam_score = 0.0
    is_spam = False
    
    # Basic checks
    if level in [SpamPreventionLevel.LOW, SpamPreventionLevel.MEDIUM, 
                SpamPreventionLevel.HIGH, SpamPreventionLevel.VERY_HIGH]:
        # Check for empty required fields
        for key, value in submission.answers.items():
            if not value and key.endswith('_required'):
                spam_score += 0.3
    
    # More advanced checks for medium+ levels
    if level in [SpamPreventionLevel.MEDIUM, SpamPreventionLevel.HIGH, 
               SpamPreventionLevel.VERY_HIGH]:
        # Check for common spam patterns in text fields
        for key, value in submission.answers.items():
            if isinstance(value, str):
                # Check for excessive URLs
                url_count = len(re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', value))
                if url_count > 2:
                    spam_score += 0.1 * url_count
                
                # Check for common spam keywords
                spam_keywords = ['viagra', 'casino', 'lottery', 'prize', 'winner', 'free money']
                for keyword in spam_keywords:
                    if keyword.lower() in value.lower():
                        spam_score += 0.2
    
    # Strict checks for high+ levels
    if level in [SpamPreventionLevel.HIGH, SpamPreventionLevel.VERY_HIGH]:
        # Check submission speed (if we have metadata)
        if hasattr(submission, 'metadata') and 'time_spent' in submission.metadata:
            time_spent = submission.metadata['time_spent']
            if time_spent < 5:  # Less than 5 seconds to fill the form
                spam_score += 0.3
        
        # Check for repeated submissions from same IP
        # This would need to be implemented with a database check
    
    # Very strict checks
    if level == SpamPreventionLevel.VERY_HIGH:
        # Add additional checks like honeypot fields, etc.
        if hasattr(submission, 'honeypot') and submission.honeypot:
            spam_score += 0.8
    
    # Determine if it's spam based on score and level
    threshold_map = {
        SpamPreventionLevel.LOW: 0.7,
        SpamPreventionLevel.MEDIUM: 0.5,
        SpamPreventionLevel.HIGH: 0.3,
        SpamPreventionLevel.VERY_HIGH: 0.2
    }
    
    is_spam = spam_score >= threshold_map[level]
    
    return is_spam, spam_score

# Endpoints
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Keep Render instance alive
@app.on_event("startup")
async def startup_event():
    async def keep_alive():
        while True:
            try:
                await health_check()
                await asyncio.sleep(840)  # 14 minutes
            except Exception as e:
                logger.error(f"Keep-alive error: {e}")
                await asyncio.sleep(60)  # Wait a minute and try again
    
    import asyncio
    asyncio.create_task(keep_alive())

# Authentication endpoints
@app.post("/token", response_model=Token)
@limiter.limit("5/minute")
async def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/users/", response_model=User, status_code=status.HTTP_201_CREATED)
@limiter.limit("3/minute")
async def create_user(request: Request, user: UserCreate):
    # Check if username exists
    existing_user = await users_collection.find_one({"username": user.username})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Check if email exists
    existing_email = await users_collection.find_one({"email": user.email})
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    user_data = user.dict()
    user_data.pop("password")
    user_data["hashed_password"] = hashed_password
    user_data["created_at"] = datetime.utcnow()
    
    result = await users_collection.insert_one(user_data)
    
    created_user = await users_collection.find_one({"_id": result.inserted_id})
    return serialize_doc_id(created_user)

@app.get("/users/me/", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user

# Form endpoints
@app.post("/forms/", response_model=Form, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_form(request: Request, form: Form, current_user: User = Depends(get_current_active_user)):
    form_data = form.dict()
    form_data["user_id"] = current_user.id
    form_data["created_at"] = datetime.utcnow()
    form_data["updated_at"] = datetime.utcnow()
    
    result = await forms_collection.insert_one(form_data)
    
    created_form = await forms_collection.find_one({"_id": result.inserted_id})
    return serialize_doc_id(created_form)

@app.get("/forms/")
@limiter.limit("30/minute")
async def get_forms(
    request: Request, 
    skip: int = 0, 
    limit: int = 10,
    current_user: User = Depends(get_current_active_user)
):
    forms = []
    cursor = forms_collection.find({"user_id": current_user.id}).skip(skip).limit(limit)
    
    async for form in cursor:
        forms.append(serialize_doc_id(form))
    
    return forms

@app.get("/forms/{form_id}", response_model=Form)
@limiter.limit("30/minute")
async def get_form(request: Request, form_id: str):
    try:
        form = await forms_collection.find_one({"_id": ObjectId(form_id)})
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid form ID format")
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    return serialize_doc_id(form)

@app.put("/forms/{form_id}", response_model=Form)
@limiter.limit("15/minute")
async def update_form(
    request: Request,
    form_id: str, 
    form_update: Form,
    current_user: User = Depends(get_current_active_user)
):
    try:
        # Verify the form exists and belongs to the user
        existing_form = await forms_collection.find_one({
            "_id": ObjectId(form_id),
            "user_id": current_user.id
        })
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid form ID format")
    
    if not existing_form:
        raise HTTPException(status_code=404, detail="Form not found or you don't have permission to edit it")
    
    # Update the form
    form_data = form_update.dict(exclude_unset=True)
    form_data["updated_at"] = datetime.utcnow()
    
    updated_form = await forms_collection.find_one_and_update(
        {"_id": ObjectId(form_id)},
        {"$set": form_data},
        return_document=ReturnDocument.AFTER
    )
    
    return serialize_doc_id(updated_form)

@app.delete("/forms/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def delete_form(
    request: Request,
    form_id: str,
    current_user: User = Depends(get_current_active_user)
):
    try:
        # Verify the form exists and belongs to the user
        result = await forms_collection.delete_one({
            "_id": ObjectId(form_id),
            "user_id": current_user.id
        })
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid form ID format")
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Form not found or you don't have permission to delete it")
    
    # Also delete all submissions for this form
    await submissions_collection.delete_many({"form_id": form_id})
    
    return None

# Form submissions
@app.post("/forms/{form_id}/submit", response_model=FormSubmission)
@limiter.limit("20/minute")
async def submit_form(
    request: Request,
    form_id: str,
    submission: Dict[str, Any],
    background_tasks: BackgroundTasks
):
    try:
        form = await forms_collection.find_one({"_id": ObjectId(form_id)})
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid form ID format")
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    
    # Check if form has expired
    if form.get("settings", {}).get("expiration_date"):
        expiration_date = form["settings"]["expiration_date"]
        if datetime.utcnow() > expiration_date:
            raise HTTPException(status_code=403, detail="This form has expired")
    
    # Check if form has reached response limit
    if form.get("settings", {}).get("limit_responses"):
        limit = form["settings"]["limit_responses"]
        count = await submissions_collection.count_documents({"form_id": form_id})
        if count >= limit:
            raise HTTPException(status_code=403, detail="This form has reached its response limit")
    
    # Check if form requires login
    if form.get("settings", {}).get("require_login", False):
        # This would require the user to be authenticated
        # For simplicity, we'll just add a placeholder
        user_id = None
        try:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                username = payload.get("sub")
                if username:
                    user = await get_user(username)
                    if user:
                        user_id = user.id
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to submit this form",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to submit this form",
                headers={"WWW-Authenticate": "Bearer"},
            )
    else:
        user_id = None
    
    # Validate required fields
    for question in form.get("questions", []):
        if question.get("required", False):
            question_id = question.get("id")
            if question_id not in submission or not submission[question_id]:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Required field '{question.get('title')}' is missing"
                )
    
    # Create submission record
    submission_data = {
        "form_id": form_id,
        "user_id": user_id,
        "answers": submission,
        "ip_address": request.client.host,
        "user_agent": request.headers.get("User-Agent"),
        "created_at": datetime.utcnow()
    }
    
    # Check for spam
    spam_level = form.get("settings", {}).get("spam_prevention_level", SpamPreventionLevel.MEDIUM)
    form_submission = FormSubmission(**submission_data)
    is_spam, spam_score = check_for_spam(form_submission, spam_level)
    
    submission_data["is_spam"] = is_spam
    submission_data["spam_score"] = spam_score
    
    # Insert the submission
    result = await submissions_collection.insert_one(submission_data)
    
    # Get the created submission
    created_submission = await submissions_collection.find_one({"_id": result.inserted_id})
    
    # Send notification emails in the background if configured
    if form.get("settings", {}).get("notification_emails"):
        background_tasks.add_task(
            send_notification_emails, 
            form, 
            created_submission,
            spam_level
        )
    
    return serialize_doc_id(created_submission)

async def send_notification_emails(form, submission, spam_level):
    # This would be implemented with an email service
    # For now, we'll just log it
    notification_emails = form.get("settings", {}).get("notification_emails", [])
    logger.info(f"Would send notification to {notification_emails} for form {form['title']}")
    # In a real implementation, you'd use something like:
    # await send_email(notification_emails, "New form submission", email_body)

@app.get("/forms/{form_id}/submissions")
@limiter.limit("20/minute")
async def get_form_submissions(
    request: Request,
    form_id: str,
    skip: int = 0,
    limit: int = 50,
    include_spam: bool = False,
    current_user: User = Depends(get_current_active_user)
):
    try:
        # Verify the form exists and belongs to the user
        form = await forms_collection.find_one({
            "_id": ObjectId(form_id),
            "user_id": current_user.id
        })
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid form ID format")
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or you don't have permission to view submissions")
    
    # Build query
    query = {"form_id": form_id}
    if not include_spam:
        query["is_spam"] = False
    
    # Get submissions
    submissions = []
    cursor = submissions_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
    
    async for submission in cursor:
        submissions.append(serialize_doc_id(submission))
    
    return submissions

# Templates
@app.get("/templates/")
@limiter.limit("30/minute")
async def get_templates(
    request: Request,
    skip: int = 0,
    limit: int = 20,
    category: Optional[str] = None
):
    query = {}
    if category:
        query["category"] = category
    
    templates = []
    cursor = templates_collection.find(query).skip(skip).limit(limit)
    
    async for template in cursor:
        templates.append(serialize_doc_id(template))
    
    return templates

@app.get("/templates/{template_id}")
@limiter.limit("20/minute")
async def get_template(request: Request, template_id: str):
    try:
        template = await templates_collection.find_one({"_id": ObjectId(template_id)})
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid template ID format")
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return serialize_doc_id(template)

@app.post("/forms/from-template", response_model=Form)
@limiter.limit("10/minute")
async def create_form_from_template(
    request: Request,
    template_id: str,
    form_title: str,
    current_user: User = Depends(get_current_active_user)
):
    try:
        template = await templates_collection.find_one({"_id": ObjectId(template_id)})
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid template ID format")
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Create a new form based on the template
    form_data = template["form_data"]
    form_data["title"] = form_title
    form_data["user_id"] = current_user.id
    form_data["created_at"] = datetime.utcnow()
    form_data["updated_at"] = datetime.utcnow()
    form_data["is_template"] = False
    
    result = await forms_collection.insert_one(form_data)
    
    created_form = await forms_collection.find_one({"_id": result.inserted_id})
    return serialize_doc_id(created_form)

# File upload endpoint for form images
@app.post("/upload/")
@limiter.limit("20/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user)
):
    # Validate file size (max 5MB)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")
    
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="File type not allowed")
    
    # Store file in GridFS
    file_id = await client.formbuilder.fs.files.upload_from_stream(
        file.filename,
        contents,
        metadata={"user_id": current_user.id, "content_type": file.content_type}
    )
    
    # Return the file URL
    return {
        "file_id": str(file_id),
        "url": f"/files/{file_id}",
        "filename": file.filename,
        "content_type": file.content_type
    }

@app.get("/files/{file_id}")
async def get_file(file_id: str):
    try:
        # Get file from GridFS
        grid_out = await client.formbuilder.fs.files.open_download_stream(ObjectId(file_id))
        contents = await grid_out.read()
        
        # Create response with proper content type
        from fastapi.responses import Response
        metadata = await client.formbuilder.fs.files.find_one({"_id": ObjectId(file_id)})
        content_type = metadata.get("metadata", {}).get("content_type", "application/octet-stream")
        
        return Response(
            content=contents,
            media_type=content_type
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found: {str(e)}")

# Analytics endpoints
@app.get("/forms/{form_id}/analytics")
@limiter.limit("20/minute")
async def get_form_analytics(
    request: Request,
    form_id: str,
    current_user: User = Depends(get_current_active_user)
):
    try:
        # Verify the form exists and belongs to the user
        form = await forms_collection.find_one({
            "_id": ObjectId(form_id),
            "user_id": current_user.id
        })
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid form ID format")
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or you don't have permission to view analytics")
    
    # Check if analytics are enabled
    if not form.get("settings", {}).get("analytics_enabled", True):
        raise HTTPException(status_code=403, detail="Analytics are disabled for this form")
    
    # Get basic analytics
    total_submissions = await submissions_collection.count_documents({"form_id": form_id})
    spam_submissions = await submissions_collection.count_documents({"form_id": form_id, "is_spam": True})
    
    # Get submissions over time (last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    pipeline = [
        {"$match": {"form_id": form_id, "created_at": {"$gte": thirty_days_ago}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
            "count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}}
    ]
    
    submissions_by_day = []
    async for day in submissions_collection.aggregate(pipeline):
        submissions_by_day.append({
            "date": day["_id"],
            "count": day["count"]
        })
    
    # Get question analytics
    question_analytics = {}
    
    for question in form.get("questions", []):
        q_id = question.get("id")
        q_type = question.get("type")
        
        if q_type in ["select", "multi_select", "radio", "checkbox"]:
            # For choice questions, get distribution of answers
            pipeline = [
                {"$match": {"form_id": form_id, "is_spam": False}},
                {"$project": {"answer": f"$answers.{q_id}"}},
                {"$group": {"_id": "$answer", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            
            choices = []
            async for choice in submissions_collection.aggregate(pipeline):
                choices.append({
                    "value": choice["_id"],
                    "count": choice["count"]
                })
            
            question_analytics[q_id] = {
                "type": q_type,
                "title": question.get("title"),
                "choices": choices
            }
    
    return {
        "form_id": form_id,
        "total_submissions": total_submissions,
        "spam_submissions": spam_submissions,
        "submissions_by_day": submissions_by_day,
        "question_analytics": question_analytics,
        "completion_rate": None  # Would require tracking of abandoned forms
    }

# Admin endpoints for managing templates
@app.post("/admin/templates", response_model=FormTemplate)
@limiter.limit("10/minute")
async def create_template(
    request: Request,
    template: FormTemplate,
    current_user: User = Depends(get_current_active_user)
):
    # Check if user has admin privileges
    if current_user.subscription_tier != "enterprise":
        raise HTTPException(status_code=403, detail="Only enterprise users can create templates")
    
    template_data = template.dict()
    template_data["created_at"] = datetime.utcnow()
    
    result = await templates_collection.insert_one(template_data)
    
    created_template = await templates_collection.find_one({"_id": result.inserted_id})
    return serialize_doc_id(created_template)

# Convert form to template
@app.post("/forms/{form_id}/to-template", response_model=FormTemplate)
@limiter.limit("10/minute")
async def convert_form_to_template(
    request: Request,
    form_id: str,
    template_data: dict,
    current_user: User = Depends(get_current_active_user)
):
    # Verify the form exists and belongs to the user
    try:
        form = await forms_collection.find_one({
            "_id": ObjectId(form_id),
            "user_id": current_user.id
        })
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid form ID format")
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or you don't have permission")
    
    # Create template from form
    template = {
        "title": template_data.get("title", form.get("title")),
        "description": template_data.get("description", ""),
        "category": template_data.get("category", "Other"),
        "preview_image_url": template_data.get("preview_image_url"),
        "form_data": form,
        "created_at": datetime.utcnow()
    }
    
    result = await templates_collection.insert_one(template)
    
    created_template = await templates_collection.find_one({"_id": result.inserted_id})
    return serialize_doc_id(created_template)

# User management endpoints
@app.put("/users/me", response_model=User)
@limiter.limit("10/minute")
async def update_user(
    request: Request,
    user_update: dict,
    current_user: User = Depends(get_current_active_user)
):
    # Prevent updating critical fields
    if "username" in user_update or "email" in user_update:
        raise HTTPException(status_code=400, detail="Cannot update username or email")
    
    # Update the user
    updated_user = await users_collection.find_one_and_update(
        {"_id": ObjectId(current_user.id)},
        {"$set": user_update},
        return_document=ReturnDocument.AFTER
    )
    
    return serialize_doc_id(updated_user)

@app.put("/users/me/password")
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    password_data: dict,
    current_user: User = Depends(get_current_active_user)
):
    # Verify current password
    user = await users_collection.find_one({"_id": ObjectId(current_user.id)})
    if not verify_password(password_data.get("current_password"), user.get("hashed_password")):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update password
    hashed_password = get_password_hash(password_data.get("new_password"))
    await users_collection.update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": {"hashed_password": hashed_password}}
    )
    
    return {"message": "Password updated successfully"}

# Form sharing and collaboration
@app.post("/forms/{form_id}/share")
@limiter.limit("10/minute")
async def share_form(
    request: Request,
    form_id: str,
    share_data: dict,
    current_user: User = Depends(get_current_active_user)
):
    try:
        # Verify the form exists and belongs to the user
        form = await forms_collection.find_one({
            "_id": ObjectId(form_id),
            "user_id": current_user.id
        })
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid form ID format")
    
    if not form:
        raise HTTPException(status_code=404, detail="Form not found or you don't have permission")
    
    # Generate a sharing token
    share_token = secrets.token_urlsafe(16)
    expires_at = datetime.utcnow() + timedelta(days=share_data.get("expires_days", 30))
    
    # Save sharing information
    await forms_collection.update_one(
        {"_id": ObjectId(form_id)},
        {"$set": {
            "sharing": {
                "token": share_token,
                "expires_at": expires_at,
                "created_at": datetime.utcnow(),
                "permissions": share_data.get("permissions", ["view"])
            }
        }}
    )
    
    return {
        "share_token": share_token,
        "share_url": f"/shared/{share_token}",
        "expires_at": expires_at
    }

@app.get("/shared/{share_token}")
@limiter.limit("30/minute")
async def get_shared_form(request: Request, share_token: str):
    # Find form by share token
    form = await forms_collection.find_one({"sharing.token": share_token})
    
    if not form:
        raise HTTPException(status_code=404, detail="Shared form not found or link has expired")
    
    # Check if sharing has expired
    if form.get("sharing", {}).get("expires_at", datetime.min) < datetime.utcnow():
        raise HTTPException(status_code=403, detail="Sharing link has expired")
    
    # Return form data with limited information
    safe_form = {
        "id": str(form.get("_id")),
        "title": form.get("title"),
        "description": form.get("description"),
        "start_screen": form.get("start_screen"),
        "questions": form.get("questions"),
        "end_screen": form.get("end_screen"),
        "end_screen_type": form.get("end_screen_type"),
        "settings": {
            "require_login": form.get("settings", {}).get("require_login", False),
            "limit_responses": form.get("settings", {}).get("limit_responses"),
            "spam_prevention_level": form.get("settings", {}).get("spam_prevention_level")
        }
    }
    
    return safe_form

# Initialize database with default templates
@app.on_event("startup")
async def create_default_templates():
    # Check if we already have templates
    count = await templates_collection.count_documents({})
    if count > 0:
        return
    
    # Create some default templates
    default_templates = [
        {
            "title": "Customer Feedback",
            "description": "Collect feedback from your customers",
            "category": "Feedback",
            "form_data": {
                "title": "Customer Feedback Form",
                "description": "We value your feedback!",
                "start_screen": {
                    "title": "Customer Feedback Survey",
                    "description": "Your feedback helps us improve our services. This survey will take about 2 minutes to complete."
                },
                "questions": [
                    {
                        "id": str(uuid.uuid4()),
                        "type": "text",
                        "title": "What is your name?",
                        "required": True,
                        "placeholder": "John Doe"
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "email",
                        "title": "Email address",
                        "required": True,
                        "placeholder": "john@example.com"
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "radio",
                        "title": "How satisfied are you with our service?",
                        "required": True,
                        "options": [
                            {"id": str(uuid.uuid4()), "value": "5", "label": "Very satisfied"},
                            {"id": str(uuid.uuid4()), "value": "4", "label": "Satisfied"},
                            {"id": str(uuid.uuid4()), "value": "3", "label": "Neutral"},
                            {"id": str(uuid.uuid4()), "value": "2", "label": "Dissatisfied"},
                            {"id": str(uuid.uuid4()), "value": "1", "label": "Very dissatisfied"}
                        ]
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "multi_select",
                        "title": "What aspects of our service did you like?",
                        "description": "Select all that apply",
                        "required": False,
                        "options": [
                            {"id": str(uuid.uuid4()), "value": "quality", "label": "Quality"},
                            {"id": str(uuid.uuid4()), "value": "speed", "label": "Speed"},
                            {"id": str(uuid.uuid4()), "value": "price", "label": "Price"},
                            {"id": str(uuid.uuid4()), "value": "support", "label": "Customer support"},
                            {"id": str(uuid.uuid4()), "value": "other", "label": "Other"}
                        ]
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "textarea",
                        "title": "Do you have any additional comments or suggestions?",
                        "required": False,
                        "placeholder": "Your comments help us improve"
                    }
                ],
                "end_screen": {
                    "title": "Thank You!",
                    "description": "We appreciate your feedback. Your responses will help us improve our services."
                },
                "end_screen_type": "static",
                "settings": {
                    "require_login": False,
                    "spam_prevention_level": "medium",
                    "analytics_enabled": True
                }
            },
            "created_at": datetime.utcnow()
        },
        {
            "title": "Event Registration",
            "description": "Collect registrations for your event",
            "category": "Events",
            "form_data": {
                "title": "Event Registration Form",
                "description": "Register for our upcoming event",
                "start_screen": {
                    "title": "Event Registration",
                    "description": "Please fill out this form to register for our upcoming event."
                },
                "questions": [
                    {
                        "id": str(uuid.uuid4()),
                        "type": "text",
                        "title": "Full Name",
                        "required": True,
                        "placeholder": "John Doe"
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "email",
                        "title": "Email Address",
                        "required": True,
                        "placeholder": "john@example.com"
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "phone",
                        "title": "Phone Number",
                        "required": True,
                        "placeholder": "+1 (123) 456-7890"
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "radio",
                        "title": "Which session will you attend?",
                        "required": True,
                        "options": [
                            {"id": str(uuid.uuid4()), "value": "morning", "label": "Morning (9 AM - 12 PM)"},
                            {"id": str(uuid.uuid4()), "value": "afternoon", "label": "Afternoon (1 PM - 4 PM)"},
                            {"id": str(uuid.uuid4()), "value": "both", "label": "Both sessions"}
                        ]
                    },
                    {
                        "id": str(uuid.uuid4()),
                        "type": "checkbox",
                        "title": "Dietary Restrictions",
                        "required": False,
                        "options": [
                            {"id": str(uuid.uuid4()), "value": "vegetarian", "label": "Vegetarian"},
                            {"id": str(uuid.uuid4()), "value": "vegan", "label": "Vegan"},
                            {"id": str(uuid.uuid4()), "value": "gluten", "label": "Gluten-free"},
                            {"id": str(uuid.uuid4()), "value": "none", "label": "None"}
                        ]
                    }
                ],
                "end_screen": {
                    "title": "Registration Complete!",
                    "description": "Thank you for registering. You will receive a confirmation email shortly."
                },
                "end_screen_type": "static",
                "settings": {
                    "require_login": False,
                    "limit_responses": 100,
                    "spam_prevention_level": "high",
                    "analytics_enabled": True
                }
            },
            "created_at": datetime.utcnow()
        }
    ]
    
    await templates_collection.insert_many(default_templates)
    logger.info("Created default templates")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
