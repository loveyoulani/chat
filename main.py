from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, GetJsonSchemaHandler
from typing import Optional, List, Any, Annotated
from contextlib import asynccontextmanager
import secrets
import string
import datetime
import uuid
from pymongo import ASCENDING
import asyncio
import jwt
import os
import uvicorn
from fastapi.security import HTTPBearer
from bson import ObjectId
from pydantic.json_schema import JsonSchemaValue

# Configuration
MONGO_URL = os.getenv("DB_URL", "mongodb://localhost:27017")
JWT_SECRET = os.getenv("JWT", "your-secret-key")
DB_NAME = os.getenv("NAME", "chatapp")
PORT = int(os.getenv("PORT", 10000))

# Custom ObjectId field
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
    def __get_pydantic_json_schema__(
        cls, _schema_generator: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        return {"type": "string"}

# Models
class MessageModel(BaseModel):
    content: str
    sender: str
    timestamp: datetime.datetime

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {
            datetime.datetime: lambda dt: dt.isoformat()
        }

class ChatRoom(BaseModel):
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    code: str
    link: str
    created_at: datetime.datetime
    expires_at: datetime.datetime
    messages: List[dict] = []

    class Config:
        arbitrary_types_allowed = True
        populate_by_name = True
        json_encoders = {
            ObjectId: str,
            datetime.datetime: lambda dt: dt.isoformat()
        }

    def dict(self, *args, **kwargs):
        # Customize the dict representation
        room_dict = super().dict(*args, **kwargs)
        if room_dict.get("_id"):
            room_dict["_id"] = str(room_dict["_id"])
        return room_dict

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    await db.rooms.create_index([("code", ASCENDING)], unique=True)
    await db.rooms.create_index([("link", ASCENDING)], unique=True)
    await db.rooms.create_index([("expires_at", ASCENDING)])
    
    cleanup_task = asyncio.create_task(cleanup_expired_rooms())
    
    yield
    
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    client.close()

app = FastAPI(lifespan=lifespan)
security = HTTPBearer()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB connection
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Helper functions
def generate_room_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_short_link() -> str:
    return str(uuid.uuid4())[:8]

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
        self.active_connections[room_code].append(websocket)

    def disconnect(self, websocket: WebSocket, room_code: str):
        if room_code in self.active_connections:
            self.active_connections[room_code].remove(websocket)
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def broadcast(self, message: dict, room_code: str):
        if room_code in self.active_connections:
            for connection in self.active_connections[room_code]:
                await connection.send_json(message)

manager = ConnectionManager()

# Cleanup task
async def cleanup_expired_rooms():
    while True:
        try:
            await db.rooms.delete_many({
                "expires_at": {"$lt": datetime.datetime.utcnow()}
            })
            await asyncio.sleep(86400)  # Run daily
        except Exception as e:
            print(f"Error in cleanup task: {e}")
            await asyncio.sleep(300)  # Wait 5 minutes before retrying

# Routes
@app.get("/")
async def root():
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.utcnow().isoformat()
    }

@app.post("/api/rooms/create")
async def create_room():
    code = generate_room_code()
    link = generate_short_link()
    
    while await db.rooms.find_one({"code": code}):
        code = generate_room_code()
    while await db.rooms.find_one({"link": link}):
        link = generate_short_link()
    
    room = {
        "code": code,
        "link": link,
        "created_at": datetime.datetime.utcnow(),
        "expires_at": datetime.datetime.utcnow() + datetime.timedelta(days=7),
        "messages": []
    }
    
    result = await db.rooms.insert_one(room)
    room["_id"] = result.inserted_id
    return {"code": code, "link": link}

@app.get("/api/rooms/{room_code}")
async def get_room(room_code: str):
    room_dict = await db.rooms.find_one({"code": room_code})
    if not room_dict:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Convert ObjectId to string
    if room_dict.get("_id"):
        room_dict["_id"] = str(room_dict["_id"])
        
    return room_dict

@app.post("/api/rooms/{room_code}/extend")
async def extend_room(room_code: str):
    result = await db.rooms.update_one(
        {"code": room_code},
        {"$set": {"expires_at": datetime.datetime.utcnow() + datetime.timedelta(days=7)}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room extended successfully"}

@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await manager.connect(websocket, room_code)
    try:
        while True:
            data = await websocket.receive_json()
            message = {
                "content": data["content"],
                "sender": data["sender"],
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
            
            await db.rooms.update_one(
                {"code": room_code},
                {"$push": {"messages": message}}
            )
            
            await manager.broadcast(message, room_code)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
