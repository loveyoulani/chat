from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Form, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, timedelta
from bson import ObjectId
import motor.motor_asyncio
import pymongo
import gridfs
import jwt
import os
import secrets
import hashlib
import time
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import uuid
from passlib.context import CryptContext

# Configuration
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-for-jwt")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "formbuilder")

# Initialize FastAPI app
app = FastAPI(title="Form Builder API", description="API for creating and managing forms")

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, specify exact domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Connect to MongoDB - async client for motor operations
client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)
db = client[DATABASE_NAME]

# Create a regular pymongo client for GridFS
# This is the fix - GridFS needs a regular pymongo database, not an async one
pymongo_client = pymongo.MongoClient(MONGODB_URL)
pymongo_db = pymongo_client[DATABASE_NAME]
fs = gridfs.GridFS(pymongo_db)

# Collections
users_collection = db.users
forms_collection = db.forms
responses_collection = db.responses
templates_collection = db.templates

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 setup
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Models
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate
        
    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)
    
    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")

class UserBase(BaseModel):
    email: EmailStr
    username: str
    
class UserCreate(UserBase):
    password: str
    
class UserInDB(UserBase):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class User(UserBase):
    id: Optional[str] = None
    created_at: Optional[datetime] = None
    
    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class QuestionBase(BaseModel):
    question_type: str  # text, number, multiple_choice, checkbox, dropdown, location, etc.
    question_text: str
    required: bool = False
    options: Optional[List[str]] = None
    max_selections: Optional[int] = None
    min_selections: Optional[int] = None
    placeholder: Optional[str] = None
    validation: Optional[Dict[str, Any]] = None

class Question(QuestionBase):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

class FormStyle(BaseModel):
    background_color: Optional[str] = None
    text_color: Optional[str] = None
    button_color: Optional[str] = None
    font_family: Optional[str] = None
    custom_css: Optional[str] = None
    header_image: Optional[str] = None  # GridFS file ID

class FormScreenBase(BaseModel):
    title: str
    description: Optional[str] = None
    background_image: Optional[str] = None  # GridFS file ID
    custom_html: Optional[str] = None

class StartScreen(FormScreenBase):
    pass

class EndScreen(FormScreenBase):
    conditional_content: Optional[Dict[str, Any]] = None  # Conditions for different end screens

class FormBase(BaseModel):
    title: str
    description: Optional[str] = None
    is_public: bool = True
    max_responses: Optional[int] = None
    expiry_date: Optional[datetime] = None
    start_screen: StartScreen
    questions: List[Question]
    end_screen: EndScreen
    style: Optional[FormStyle] = None
    
class FormCreate(FormBase):
    pass

class Form(FormBase):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    creator_id: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    response_count: int = 0
    
    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class FormResponse(BaseModel):
    form_id: str
    answers: Dict[str, Any]
    respondent_id: Optional[str] = None
    submitted_at: datetime = Field(default_factory=datetime.utcnow)
    ip_address: Optional[str] = None
    
    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class Template(FormBase):
    id: Optional[PyObjectId] = Field(default_factory=PyObjectId, alias="_id")
    category: str
    tags: List[str] = []
    
    class Config:
        allow_population_by_field_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

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
    except jwt.PyJWTError:
        raise credentials_exception
    user = await get_user(username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: UserInDB = Depends(get_current_user)):
    return current_user

# Routes
@app.get("/health")
async def health_check():
    """Health check endpoint for Render ping"""
    return {"status": "healthy", "timestamp": datetime.utcnow()}

@app.post("/register", response_model=User)
@limiter.limit("10/minute")
async def register_user(request: Request, user: UserCreate):
    # Check if username or email already exists
    existing_user = await users_collection.find_one({
        "$or": [
            {"username": user.username},
            {"email": user.email}
        ]
    })
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    user_data = UserInDB(
        **user.dict(),
        hashed_password=hashed_password,
        created_at=datetime.utcnow()
    )
    
    # Insert into database
    new_user = await users_collection.insert_one(user_data.dict(by_alias=True))
    
    # Return user without password
    created_user = await users_collection.find_one({"_id": new_user.inserted_id})
    return User(
        id=str(created_user["_id"]),
        username=created_user["username"],
        email=created_user["email"],
        created_at=created_user["created_at"]
    )

@app.post("/token", response_model=Token)
@limiter.limit("10/minute")
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

@app.get("/users/me", response_model=User)
async def read_users_me(current_user: UserInDB = Depends(get_current_active_user)):
    return User(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        created_at=current_user.created_at
    )

@app.post("/forms", response_model=Form)
@limiter.limit("20/minute")
async def create_form(
    request: Request,
    form: FormCreate,
    current_user: UserInDB = Depends(get_current_active_user)
):
    form_data = Form(
        **form.dict(),
        creator_id=str(current_user.id),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        response_count=0
    )
    
    result = await forms_collection.insert_one(form_data.dict(by_alias=True))
    created_form = await forms_collection.find_one({"_id": result.inserted_id})
    
    return created_form

@app.get("/forms", response_model=List[Form])
@limiter.limit("60/minute")
async def get_user_forms(
    request: Request,
    current_user: UserInDB = Depends(get_current_active_user),
    skip: int = 0,
    limit: int = 20
):
    forms = await forms_collection.find(
        {"creator_id": str(current_user.id)}
    ).sort("created_at", pymongo.DESCENDING).skip(skip).limit(limit).to_list(length=limit)
    
    return forms

@app.get("/forms/{form_id}", response_model=Form)
@limiter.limit("60/minute")
async def get_form(request: Request, form_id: str):
    try:
        form = await forms_collection.find_one({"_id": ObjectId(form_id)})
        if form is None:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Check if form has expired
        if form.get("expiry_date") and datetime.utcnow() > form["expiry_date"]:
            raise HTTPException(status_code=410, detail="Form has expired")
            
        # Check if max responses reached
        if form.get("max_responses") and form["response_count"] >= form["max_responses"]:
            raise HTTPException(status_code=410, detail="Form has reached maximum responses")
            
        return form
    except:
        raise HTTPException(status_code=404, detail="Form not found")

@app.put("/forms/{form_id}", response_model=Form)
@limiter.limit("20/minute")
async def update_form(
    request: Request,
    form_id: str, 
    form_update: FormCreate,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        # Check form exists and belongs to user
        existing_form = await forms_collection.find_one({
            "_id": ObjectId(form_id),
            "creator_id": str(current_user.id)
        })
        
        if not existing_form:
            raise HTTPException(status_code=404, detail="Form not found or you don't have permission")
        
        # Update form
        form_data = {
            **form_update.dict(),
            "updated_at": datetime.utcnow()
        }
        
        await forms_collection.update_one(
            {"_id": ObjectId(form_id)},
            {"$set": form_data}
        )
        
        updated_form = await forms_collection.find_one({"_id": ObjectId(form_id)})
        return updated_form
    except:
        raise HTTPException(status_code=404, detail="Form not found")

@app.delete("/forms/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def delete_form(
    request: Request,
    form_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    try:
        # Check form exists and belongs to user
        result = await forms_collection.delete_one({
            "_id": ObjectId(form_id),
            "creator_id": str(current_user.id)
        })
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Form not found or you don't have permission")
        
        # Delete all responses for this form
        await responses_collection.delete_many({"form_id": form_id})
        
        return None
    except:
        raise HTTPException(status_code=404, detail="Form not found")

@app.post("/forms/{form_id}/submit", status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def submit_form_response(
    request: Request,
    form_id: str,
    response: Dict[str, Any]
):
    try:
        # Get the form
        form = await forms_collection.find_one({"_id": ObjectId(form_id)})
        if not form:
            raise HTTPException(status_code=404, detail="Form not found")
        
        # Check if form has expired
        if form.get("expiry_date") and datetime.utcnow() > form["expiry_date"]:
            raise HTTPException(status_code=410, detail="Form has expired")
            
        # Check if max responses reached
        if form.get("max_responses") and form["response_count"] >= form["max_responses"]:
            raise HTTPException(status_code=410, detail="Form has reached maximum responses")
        
        # Validate required fields
        for question in form["questions"]:
            if question["required"] and question["id"] not in response["answers"]:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Required question '{question['question_text']}' was not answered"
                )
        
        # Create response object
        form_response = FormResponse(
            form_id=form_id,
            answers=response["answers"],
            submitted_at=datetime.utcnow(),
            ip_address=request.client.host
        )
        
        # Insert response
        await responses_collection.insert_one(form_response.dict())
        
        # Update response count
        await forms_collection.update_one(
            {"_id": ObjectId(form_id)},
            {"$inc": {"response_count": 1}}
        )
        
        return {"message": "Response submitted successfully"}
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to submit response: {str(e)}")

@app.get("/forms/{form_id}/responses", response_model=List[FormResponse])
@limiter.limit("20/minute")
async def get_form_responses(
    request: Request,
    form_id: str,
    current_user: UserInDB = Depends(get_current_active_user),
    skip: int = 0,
    limit: int = 100
):
    # Check if user owns the form
    form = await forms_collection.find_one({
        "_id": ObjectId(form_id),
        "creator_id": str(current_user.id)
    })
    
    if not form:
        raise HTTPException(
            status_code=404,
            detail="Form not found or you don't have permission to view responses"
        )
    
    # Get responses
    responses = await responses_collection.find(
        {"form_id": form_id}
    ).sort("submitted_at", pymongo.DESCENDING).skip(skip).limit(limit).to_list(length=limit)
    
    return responses

@app.post("/upload", response_model=Dict[str, str])
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Check file size (limit to 5MB)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum size is 5MB."
        )
    
    # Check file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/svg+xml"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type. Allowed types: {', '.join(allowed_types)}"
        )
    
    # Store in GridFS
    file_id = fs.put(
        contents,
        filename=file.filename,
        content_type=file.content_type,
        user_id=str(current_user.id)
    )
    
    return {"file_id": str(file_id)}

@app.get("/templates", response_model=List[Template])
@limiter.limit("30/minute")
async def get_templates(
    request: Request,
    category: Optional[str] = None,
    skip: int = 0,
    limit: int = 20
):
    query = {}
    if category:
        query["category"] = category
    
    templates = await templates_collection.find(query).skip(skip).limit(limit).to_list(length=limit)
    return templates

@app.post("/templates", response_model=Template, status_code=status.HTTP_201_CREATED)
async def create_template(
    template: Template,
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Only admins can create templates (add admin check if needed)
    template_data = template.dict(by_alias=True)
    result = await templates_collection.insert_one(template_data)
    created_template = await templates_collection.find_one({"_id": result.inserted_id})
    return created_template

@app.get("/analytics/forms/{form_id}", response_model=Dict[str, Any])
@limiter.limit("20/minute")
async def get_form_analytics(
    request: Request,
    form_id: str,
    current_user: UserInDB = Depends(get_current_active_user)
):
    # Check if user owns the form
    form = await forms_collection.find_one({
        "_id": ObjectId(form_id),
        "creator_id": str(current_user.id)
    })
    
    if not form:
        raise HTTPException(
            status_code=404,
            detail="Form not found or you don't have permission"
        )
    
    # Get response count
    response_count = await responses_collection.count_documents({"form_id": form_id})
    
    # Get analytics for each question
    analytics = {}
    for question in form["questions"]:
        question_id = question["id"]
        question_type = question["question_type"]
        
        if question_type in ["multiple_choice", "checkbox", "dropdown"]:
            # For choice-based questions, count occurrences of each option
            pipeline = [
                {"$match": {"form_id": form_id}},
                {"$project": {"answer": f"$answers.{question_id}"}},
                {"$unwind": {"path": "$answer", "preserveNullAndEmptyArrays": True}},
                {"$group": {"_id": "$answer", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}}
            ]
            results = await responses_collection.aggregate(pipeline).to_list(length=100)
            analytics[question_id] = {
                "question_text": question["question_text"],
                "type": question_type,
                "options": {r["_id"]: r["count"] for r in results if r["_id"] is not None}
            }
        elif question_type in ["text", "number", "location"]:
            # For text-based questions, just count responses
            count = await responses_collection.count_documents({
                "form_id": form_id,
                f"answers.{question_id}": {"$exists": True}
            })
            analytics[question_id] = {
                "question_text": question["question_text"],
                "type": question_type,
                "response_count": count
            }
    
    return {
        "form_id": form_id,
        "title": form["title"],
        "response_count": response_count,
        "questions": analytics
    }

# Run the app using Uvicorn if executed directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
