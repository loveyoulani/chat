from fastapi import FastAPI, HTTPException, Depends, status, Request, Form, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import List, Optional, Dict, Any, Union, Annotated, ClassVar
from pydantic import BaseModel, EmailStr, Field, validator, ConfigDict
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from pymongo import MongoClient
from bson import ObjectId
import random
import string
import uvicorn
import os
from dotenv import load_dotenv
import time
import asyncio
import httpx
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import logging
from enum import Enum

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Form Builder API",
    description="API for creating and managing customizable forms",
    version="1.0.0",
)

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=eval(os.getenv("ORIGINS", '["*"]')),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# MongoDB setup
client = MongoClient(os.getenv("MONGODB_URI"))
db = client.formbuilder
users_collection = db.users
forms_collection = db.forms
responses_collection = db.responses
templates_collection = db.templates

# Token settings
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# Question types enum
class QuestionType(str, Enum):
    TEXT = "text"
    PARAGRAPH = "paragraph"
    MULTIPLE_CHOICE = "multiple_choice"
    CHECKBOX = "checkbox"
    DROPDOWN = "dropdown"
    FILE = "file"
    DATE = "date"
    TIME = "time"
    LOCATION = "location"
    RATING = "rating"
    EMAIL = "email"
    PHONE = "phone"
    NUMBER = "number"
    URL = "url"
    SCALE = "scale"

# Models
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v, info=None):
        # This handles both Pydantic v1 and v2
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

    # For Pydantic v2
    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type, _handler):
        from pydantic_core import core_schema
        return core_schema.with_info_plain_validator_function(
            cls.validate,
            return_schema=core_schema.str_schema(),
            serialization=core_schema.str_serializer(),
        )

    # For Pydantic v1 (backward compatibility)
    @classmethod
    def __get_pydantic_json_schema__(cls, _schema_generator, _field_schema):
        return {"type": "string"}

class UserBase(BaseModel):
    email: EmailStr
    username: str
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    created_at: datetime = Field(default_factory=datetime.now)

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class Option(BaseModel):
    value: str
    label: str
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )
    
class Condition(BaseModel):
    question_id: str
    operator: str  # equals, not_equals, contains, not_contains, etc.
    value: Any
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class Action(BaseModel):
    type: str  # show, hide, jump_to, end_form, etc.
    target_id: Optional[str] = None
    value: Optional[Any] = None
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class Logic(BaseModel):
    condition: Condition
    action: Action
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class Question(BaseModel):
    id: str
    type: QuestionType
    title: str
    description: Optional[str] = None
    required: bool = False
    options: Optional[List[Option]] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    validation: Optional[Dict[str, Any]] = None
    logic: Optional[List[Logic]] = None
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )
    
class Screen(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    background_image: Optional[str] = None
    custom_css: Optional[str] = None
    custom_html: Optional[str] = None
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class EndScreen(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    background_image: Optional[str] = None
    custom_css: Optional[str] = None
    custom_html: Optional[str] = None
    dynamic_content: Optional[Dict[str, Dict[str, Any]]] = None  # Question ID -> {condition -> content}
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class FormCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_screen: Screen
    questions: List[Question]
    end_screen: EndScreen
    max_responses: Optional[int] = None
    expiration_date: Optional[datetime] = None
    custom_slug: Optional[str] = None
    theme: Optional[Dict[str, Any]] = None
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )
    
class Form(FormCreate):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    creator_id: PyObjectId
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    slug: str
    is_active: bool = True
    response_count: int = 0

class FormResponse(BaseModel):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    form_id: PyObjectId
    answers: Dict[str, Any]  # Question ID -> answer
    created_at: datetime = Field(default_factory=datetime.now)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

class Template(BaseModel):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    title: str
    description: str
    preview_image: Optional[str] = None
    form_data: Dict[str, Any]
    category: str
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )

# Helper functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def generate_slug(length=6):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

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
    user = users_collection.find_one({"username": token_data.username})
    if user is None:
        raise credentials_exception
    return User(**user)

# API endpoints
@app.get("/health")
@limiter.limit("60/minute")
async def health_check(request: Request):
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@app.post("/register", response_model=User, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register_user(request: Request, user: UserCreate):
    # Check if username or email already exists
    if users_collection.find_one({"username": user.username}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    if users_collection.find_one({"email": user.email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user with hashed password
    hashed_password = get_password_hash(user.password)
    user_dict = user.dict()
    user_dict.pop("password")
    user_dict["hashed_password"] = hashed_password
    user_dict["created_at"] = datetime.now()
    
    result = users_collection.insert_one(user_dict)
    created_user = users_collection.find_one({"_id": result.inserted_id})
    
    return User(**created_user)

@app.post("/token", response_model=Token)
@limiter.limit("10/minute")
async def login_for_access_token(
    request: Request, form_data: OAuth2PasswordRequestForm = Depends()
):
    # Find user by username
    user = users_collection.find_one({"username": form_data.username})
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user["username"]}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/forms", response_model=Form)
@limiter.limit("30/minute")
async def create_form(
    request: Request,
    form_data: FormCreate,
    current_user: User = Depends(get_current_user)
):
    # Generate slug (short URL)
    slug = form_data.custom_slug or generate_slug(8)
    
    # Check if custom slug already exists
    if form_data.custom_slug and forms_collection.find_one({"slug": slug}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Custom URL already in use. Please choose another."
        )
    
    # Create new form
    form_dict = form_data.dict()
    form_dict["creator_id"] = current_user.id
    form_dict["created_at"] = datetime.now()
    form_dict["updated_at"] = datetime.now()
    form_dict["slug"] = slug
    form_dict["is_active"] = True
    form_dict["response_count"] = 0
    
    result = forms_collection.insert_one(form_dict)
    created_form = forms_collection.find_one({"_id": result.inserted_id})
    
    return Form(**created_form)

@app.get("/forms", response_model=List[Form])
@limiter.limit("60/minute")
async def get_user_forms(
    request: Request,
    skip: int = 0,
    limit: int = 10,
    current_user: User = Depends(get_current_user)
):
    forms = list(forms_collection.find(
        {"creator_id": current_user.id}
    ).skip(skip).limit(limit))
    
    return [Form(**form) for form in forms]

@app.get("/forms/{form_id}", response_model=Form)
@limiter.limit("60/minute")
async def get_form_by_id(
    request: Request,
    form_id: str,
    current_user: User = Depends(get_current_user)
):
    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format"
        )
    
    form = forms_collection.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    # Verify ownership
    if str(form["creator_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this form"
        )
    
    return Form(**form)

@app.get("/f/{slug}")
@limiter.limit("120/minute")
async def get_public_form(request: Request, slug: str):
    form = forms_collection.find_one({"slug": slug, "is_active": True})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found or inactive"
        )
    
    # Check if form has reached max responses
    if form.get("max_responses") and form["response_count"] >= form["max_responses"]:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "This form has reached its maximum number of responses"}
        )
    
    # Check if form has expired
    if form.get("expiration_date") and datetime.now() > form["expiration_date"]:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": "This form has expired"}
        )
    
    # Return the form data for display
    return Form(**form)

@app.post("/f/{slug}/submit")
@limiter.limit("30/minute")
async def submit_form_response(
    request: Request,
    slug: str,
    answers: Dict[str, Any]
):
    # Find the form
    form = forms_collection.find_one({"slug": slug, "is_active": True})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found or inactive"
        )
    
    # Check if form has reached max responses
    if form.get("max_responses") and form["response_count"] >= form["max_responses"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This form has reached its maximum number of responses"
        )
    
    # Check if form has expired
    if form.get("expiration_date") and datetime.now() > form["expiration_date"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This form has expired"
        )
    
    # Validate required questions
    for question in form["questions"]:
        if question["required"] and question["id"] not in answers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question '{question['title']}' is required"
            )
    
    # Create response record
    response_data = {
        "form_id": form["_id"],
        "answers": answers,
        "created_at": datetime.now(),
        "ip_address": request.client.host,
        "user_agent": request.headers.get("user-agent", "")
    }
    
    # Save response
    response_id = responses_collection.insert_one(response_data).inserted_id
    
    # Update form response count
    forms_collection.update_one(
        {"_id": form["_id"]},
        {"$inc": {"response_count": 1}}
    )
    
    # Determine the appropriate end screen content based on answers
    end_screen = form["end_screen"]
    dynamic_content = None
    
    if end_screen.get("dynamic_content"):
        for question_id, conditions in end_screen["dynamic_content"].items():
            if question_id in answers:
                answer = answers[question_id]
                for condition_key, content in conditions.items():
                    # Parse condition (e.g., "equals:value", "contains:text")
                    cond_parts = condition_key.split(":")
                    if len(cond_parts) == 2:
                        operator, expected = cond_parts
                        
                        if (
                            (operator == "equals" and str(answer) == expected) or
                            (operator == "not_equals" and str(answer) != expected) or
                            (operator == "contains" and expected in str(answer)) or
                            (operator == "not_contains" and expected not in str(answer)) or
                            (operator == "greater_than" and float(answer) > float(expected)) or
                            (operator == "less_than" and float(answer) < float(expected))
                        ):
                            dynamic_content = content
                            break
        
    return {
        "success": True,
        "response_id": str(response_id),
        "message": "Form submitted successfully",
        "end_screen": {
            "title": end_screen["title"],
            "description": end_screen["description"],
            "dynamic_content": dynamic_content
        }
    }

@app.put("/forms/{form_id}", response_model=Form)
@limiter.limit("30/minute")
async def update_form(
    request: Request,
    form_id: str,
    form_data: FormCreate,
    current_user: User = Depends(get_current_user)
):
    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format"
        )
    
    # Check if form exists and user is the owner
    form = forms_collection.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if str(form["creator_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this form"
        )
    
    # Check if custom slug is changed and already exists
    if form_data.custom_slug and form_data.custom_slug != form.get("custom_slug"):
        if forms_collection.find_one({"slug": form_data.custom_slug, "_id": {"$ne": ObjectId(form_id)}}):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Custom URL already in use. Please choose another."
            )
    
    # Update form
    form_dict = form_data.dict()
    form_dict["updated_at"] = datetime.now()
    
    # Keep the original slug if no custom slug provided
    if not form_data.custom_slug:
        form_dict["slug"] = form["slug"]
    else:
        form_dict["slug"] = form_data.custom_slug
    
    forms_collection.update_one(
        {"_id": ObjectId(form_id)},
        {"$set": form_dict}
    )
    
    updated_form = forms_collection.find_one({"_id": ObjectId(form_id)})
    return Form(**updated_form)

@app.delete("/forms/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("20/minute")
async def delete_form(
    request: Request,
    form_id: str,
    current_user: User = Depends(get_current_user)
):
    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format"
        )
    
    # Check if form exists and user is the owner
    form = forms_collection.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if str(form["creator_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this form"
        )
    
    # Delete form
    forms_collection.delete_one({"_id": ObjectId(form_id)})
    
    # Delete all responses for this form
    responses_collection.delete_many({"form_id": ObjectId(form_id)})
    
    return None

@app.get("/forms/{form_id}/responses", response_model=List[FormResponse])
@limiter.limit("60/minute")
async def get_form_responses(
    request: Request,
    form_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user)
):
    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format"
        )
    
    # Check if form exists and user is the owner
    form = forms_collection.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if str(form["creator_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view responses for this form"
        )
    
    # Get responses
    responses = list(responses_collection.find(
        {"form_id": ObjectId(form_id)}
    ).skip(skip).limit(limit))
    
    return [FormResponse(**response) for response in responses]

@app.get("/templates", response_model=List[Template])
@limiter.limit("60/minute")
async def get_templates(
    request: Request,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 20
):
    # Build query
    query = {}
    if category:
        query["category"] = category
    
    templates = list(templates_collection.find(query).skip(skip).limit(limit))
    return [Template(**template) for template in templates]

@app.get("/templates/{template_id}", response_model=Template)
@limiter.limit("60/minute")
async def get_template_by_id(request: Request, template_id: str):
    if not ObjectId.is_valid(template_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid template ID format"
        )
    
    template = templates_collection.find_one({"_id": ObjectId(template_id)})
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    return Template(**template)

@app.post("/forms/{form_id}/duplicate", response_model=Form)
@limiter.limit("30/minute")
async def duplicate_form(
    request: Request,
    form_id: str,
    current_user: User = Depends(get_current_user)
):
    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format"
        )
    
    # Check if form exists and user is the owner
    form = forms_collection.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if str(form["creator_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to duplicate this form"
        )
    
    # Create a duplicate form
    form_copy = form.copy()
    form_copy.pop("_id")
    form_copy["title"] = f"{form['title']} (Copy)"
    form_copy["created_at"] = datetime.now()
    form_copy["updated_at"] = datetime.now()
    form_copy["slug"] = generate_slug(8)
    form_copy["response_count"] = 0
    
    result = forms_collection.insert_one(form_copy)
    duplicated_form = forms_collection.find_one({"_id": result.inserted_id})
    
    return Form(**duplicated_form)

@app.post("/forms/{form_id}/toggle-status", response_model=Form)
@limiter.limit("30/minute")
async def toggle_form_status(
    request: Request,
    form_id: str,
    current_user: User = Depends(get_current_user)
):
    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format"
        )
    
    # Check if form exists and user is the owner
    form = forms_collection.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if str(form["creator_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this form"
        )
    
    # Toggle is_active status
    new_status = not form["is_active"]
    forms_collection.update_one(
        {"_id": ObjectId(form_id)},
        {"$set": {"is_active": new_status, "updated_at": datetime.now()}}
    )
    
    updated_form = forms_collection.find_one({"_id": ObjectId(form_id)})
    return Form(**updated_form)

@app.get("/user/profile", response_model=User)
@limiter.limit("60/minute")
async def get_user_profile(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    return current_user

@app.get("/forms/{form_id}/stats")
@limiter.limit("60/minute")
async def get_form_stats(
    request: Request,
    form_id: str,
    current_user: User = Depends(get_current_user)
):
    if not ObjectId.is_valid(form_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid form ID format"
        )
    
    # Check if form exists and user is the owner
    form = forms_collection.find_one({"_id": ObjectId(form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found"
        )
    
    if str(form["creator_id"]) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view stats for this form"
        )
    
    # Get total responses
    response_count = form["response_count"]
    
    # Get response over time data (last 30 days)
    thirty_days_ago = datetime.now() - timedelta(days=30)
    daily_responses = list(responses_collection.aggregate([
        {
            "$match": {
                "form_id": ObjectId(form_id),
                "created_at": {"$gte": thirty_days_ago}
            }
        },
        {
            "$group": {
                "_id": {
                    "year": {"$year": "$created_at"},
                    "month": {"$month": "$created_at"},
                    "day": {"$dayOfMonth": "$created_at"}
                },
                "count": {"$sum": 1}
            }
        },
        {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}}
    ]))
    
    # Prepare response summary for each question
    question_stats = {}
    for question in form["questions"]:
        question_id = question["id"]
        question_type = question["type"]
        
        if question_type in [QuestionType.MULTIPLE_CHOICE, QuestionType.CHECKBOX, QuestionType.DROPDOWN]:
            # For choice-based questions, count occurrences of each option
            option_counts = list(responses_collection.aggregate([
                {"$match": {"form_id": ObjectId(form_id)}},
                {"$unwind": f"$answers.{question_id}"},
                {
                    "$group": {
                        "_id": f"$answers.{question_id}",
                        "count": {"$sum": 1}
                    }
                }
            ]))
            question_stats[question_id] = {
                "type": question_type,
                "title": question["title"],
                "option_counts": {item["_id"]: item["count"] for item in option_counts}
            }
        elif question_type in [QuestionType.RATING, QuestionType.SCALE, QuestionType.NUMBER]:
            # For numeric questions, calculate average and distribution
            numeric_stats = list(responses_collection.aggregate([
                {"$match": {"form_id": ObjectId(form_id)}},
                {
                    "$group": {
                        "_id": None,
                        "average": {"$avg": f"$answers.{question_id}"},
                        "min": {"$min": f"$answers.{question_id}"},
                        "max": {"$max": f"$answers.{question_id}"},
                        "count": {"$sum": 1}
                    }
                }
            ]))
            
            # Get distribution of values
            value_distribution = list(responses_collection.aggregate([
                {"$match": {"form_id": ObjectId(form_id)}},
                {
                    "$group": {
                        "_id": f"$answers.{question_id}",
                        "count": {"$sum": 1}
                    }
                },
                {"$sort": {"_id": 1}}
            ]))
            
            stats_data = {"type": question_type, "title": question["title"]}
            if numeric_stats:
                stats_data.update({
                    "average": numeric_stats[0]["average"],
                    "min": numeric_stats[0]["min"],
                    "max": numeric_stats[0]["max"],
                    "count": numeric_stats[0]["count"],
                })
            stats_data["distribution"] = {str(item["_id"]): item["count"] for item in value_distribution}
            question_stats[question_id] = stats_data
        else:
            # For text-based questions, count responses and get sample answers
            text_stats = list(responses_collection.aggregate([
                {"$match": {"form_id": ObjectId(form_id)}},
                {"$match": {f"answers.{question_id}": {"$exists": True}}},
                {"$count": "response_count"}
            ]))
            
            # Get sample answers (limit to 5)
            sample_answers = list(responses_collection.aggregate([
                {"$match": {"form_id": ObjectId(form_id)}},
                {"$match": {f"answers.{question_id}": {"$exists": True}}},
                {"$project": {"answer": f"$answers.{question_id}"}},
                {"$limit": 5}
            ]))
            
            response_count = text_stats[0]["response_count"] if text_stats else 0
            question_stats[question_id] = {
                "type": question_type,
                "title": question["title"],
                "response_count": response_count,
                "sample_answers": [item["answer"] for item in sample_answers]
            }
    
    # Completion rate statistics
    total_responses = responses_collection.count_documents({"form_id": ObjectId(form_id)})
    completion_stats = {
        "started": total_responses,
        "completed": total_responses,  # Assuming all submitted forms are complete
        "completion_rate": 100.0 if total_responses > 0 else 0.0
    }
    
    # Get average completion time if available
    # Note: This would require tracking start and end times for each response
    
    return {
        "form_id": form_id,
        "title": form["title"],
        "response_count": response_count,
        "daily_responses": [
            {
                "date": f"{item['_id']['year']}-{item['_id']['month']:02d}-{item['_id']['day']:02d}",
                "count": item["count"]
            }
            for item in daily_responses
        ],
        "question_stats": question_stats,
        "completion_stats": completion_stats,
        "is_active": form["is_active"],
        "created_at": form["created_at"].isoformat(),
        "updated_at": form["updated_at"].isoformat()
    }

@app.post("/forms/from-template", response_model=Form)
@limiter.limit("30/minute")
async def create_form_from_template(
    request: Request,
    template_id: str,
    form_title: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    if not ObjectId.is_valid(template_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid template ID format"
        )
    
    # Get template
    template = templates_collection.find_one({"_id": ObjectId(template_id)})
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found"
        )
    
    # Create form from template
    form_data = template["form_data"]
    if form_title:
        form_data["title"] = form_title
    else:
        form_data["title"] = f"Form from {template['title']}"
    
    form_data["creator_id"] = current_user.id
    form_data["created_at"] = datetime.now()
    form_data["updated_at"] = datetime.now()
    form_data["slug"] = generate_slug(8)
    form_data["is_active"] = True
    form_data["response_count"] = 0
    
    result = forms_collection.insert_one(form_data)
    created_form = forms_collection.find_one({"_id": result.inserted_id})
    
    return Form(**created_form)

# Background task to keep the server alive on Render's free tier
@app.on_event("startup")
async def startup_event():
    # Initialize default templates if none exist
    if templates_collection.count_documents({}) == 0:
        default_templates = [
            {
                "title": "Customer Feedback",
                "description": "Collect feedback from your customers about your products or services",
                "category": "feedback",
                "form_data": {
                    "title": "Customer Feedback Form",
                    "description": "Please share your thoughts about our service",
                    "start_screen": {
                        "id": "start",
                        "title": "We Value Your Feedback",
                        "description": "Please take a moment to share your experience with us. Your feedback helps us improve!"
                    },
                    "questions": [
                        {
                            "id": "satisfaction",
                            "type": "rating",
                            "title": "How satisfied are you with our service?",
                            "required": True,
                            "options": None,
                            "min_value": 1,
                            "max_value": 5
                        },
                        {
                            "id": "recommend",
                            "type": "scale",
                            "title": "How likely are you to recommend us to a friend?",
                            "description": "0 = Not likely, 10 = Very likely",
                            "required": True,
                            "min_value": 0,
                            "max_value": 10
                        },
                        {
                            "id": "improvements",
                            "type": "paragraph",
                            "title": "What could we do to improve your experience?",
                            "required": False
                        }
                    ],
                    "end_screen": {
                        "id": "end",
                        "title": "Thank You!",
                        "description": "We appreciate your feedback.",
                        "dynamic_content": {
                            "satisfaction": {
                                "equals:5": {
                                    "title": "Thank You!",
                                    "description": "We're thrilled you had a great experience!"
                                },
                                "equals:1": {
                                    "title": "We're Sorry!",
                                    "description": "We apologize for your experience. A team member will contact you soon."
                                }
                            }
                        }
                    }
                }
            },
            {
                "title": "Event Registration",
                "description": "Collect registrations for your upcoming event",
                "category": "events",
                "form_data": {
                    "title": "Event Registration Form",
                    "description": "Register for our upcoming event",
                    "start_screen": {
                        "id": "start",
                        "title": "Event Registration",
                        "description": "Please fill out this form to register for our event."
                    },
                    "questions": [
                        {
                            "id": "name",
                            "type": "text",
                            "title": "Full Name",
                            "required": True
                        },
                        {
                            "id": "email",
                            "type": "email",
                            "title": "Email Address",
                            "required": True
                        },
                        {
                            "id": "attendance",
                            "type": "multiple_choice",
                            "title": "Will you be attending in person or virtually?",
                            "required": True,
                            "options": [
                                {"value": "in_person", "label": "In Person"},
                                {"value": "virtual", "label": "Virtually"}
                            ]
                        },
                        {
                            "id": "dietary",
                            "type": "checkbox",
                            "title": "Do you have any dietary restrictions?",
                            "required": False,
                            "options": [
                                {"value": "vegetarian", "label": "Vegetarian"},
                                {"value": "vegan", "label": "Vegan"},
                                {"value": "gluten_free", "label": "Gluten-Free"},
                                {"value": "dairy_free", "label": "Dairy-Free"},
                                {"value": "none", "label": "No Restrictions"}
                            ]
                        }
                    ],
                    "end_screen": {
                        "id": "end",
                        "title": "Registration Complete!",
                        "description": "Thank you for registering. We'll send a confirmation email shortly.",
                        "dynamic_content": {
                            "attendance": {
                                "equals:in_person": {
                                    "title": "Registration Complete!",
                                    "description": "Thank you for registering to attend in person. Please arrive 15 minutes early for check-in."
                                },
                                "equals:virtual": {
                                    "title": "Registration Complete!",
                                    "description": "Thank you for registering to attend virtually. A link will be emailed to you before the event."
                                }
                            }
                        }
                    }
                }
            },
            {
                "title": "Job Application",
                "description": "Collect applications for open positions",
                "category": "recruitment",
                "form_data": {
                    "title": "Job Application Form",
                    "description": "Apply for open positions at our company",
                    "start_screen": {
                        "id": "start",
                        "title": "Job Application",
                        "description": "Thank you for your interest in joining our team. Please complete this application form."
                    },
                    "questions": [
                        {
                            "id": "name",
                            "type": "text",
                            "title": "Full Name",
                            "required": True
                        },
                        {
                            "id": "email",
                            "type": "email",
                            "title": "Email Address",
                            "required": True
                        },
                        {
                            "id": "phone",
                            "type": "phone",
                            "title": "Phone Number",
                            "required": True
                        },
                        {
                            "id": "position",
                            "type": "dropdown",
                            "title": "Position Applying For",
                            "required": True,
                            "options": [
                                {"value": "developer", "label": "Software Developer"},
                                {"value": "designer", "label": "UI/UX Designer"},
                                {"value": "manager", "label": "Project Manager"},
                                {"value": "marketing", "label": "Marketing Specialist"}
                            ]
                        },
                        {
                            "id": "experience",
                            "type": "paragraph",
                            "title": "Describe your relevant experience",
                            "required": True
                        },
                        {
                            "id": "start_date",
                            "type": "date",
                            "title": "When can you start?",
                            "required": True
                        }
                    ],
                    "end_screen": {
                        "id": "end",
                        "title": "Application Submitted",
                        "description": "Thank you for your application. We'll review it and contact you if there's a match."
                    }
                }
            }
        ]
        
        templates_collection.insert_many(default_templates)
        logger.info("Default templates created")
    
    @app.get("/keep-alive")
    async def keep_alive():
        return {"status": "alive", "timestamp": datetime.now().isoformat()}

    async def ping_self():
        while True:
            try:
                await asyncio.sleep(840)  # 14 minutes
                async with httpx.AsyncClient() as client:
                    response = await client.get(f"http://{os.getenv('HOST', '0.0.0.0')}:{os.getenv('PORT', '8000')}/health")
                    logger.info(f"Keep-alive ping: {response.status_code}")
            except Exception as e:
                logger.error(f"Keep-alive ping failed: {str(e)}")
    
    # Start the keep-alive task
    asyncio.create_task(ping_self())

# Run the app
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=True
    )
