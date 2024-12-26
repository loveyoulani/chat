from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Optional, List
from contextlib import asynccontextmanager
import secrets
import string
import datetime
import uuid
from pymongo import ASCENDING
import asyncio
import jwt, os
from fastapi.security import HTTPBearer

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create indexes and start cleanup task
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Create indexes
    await db.rooms.create_index([("code", ASCENDING)], unique=True)
    await db.rooms.create_index([("link", ASCENDING)], unique=True)
    await db.rooms.create_index([("expires_at", ASCENDING)])
    
    # Start cleanup task
    cleanup_task = asyncio.create_task(cleanup_expired_rooms())
    
    yield  # Server is running
    
    # Cleanup: Cancel task and close MongoDB connection
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    client.close()

app = FastAPI(lifespan=lifespan)
security = HTTPBearer()

# CORS configuration for development - adjust in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with your frontend domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
MONGO_URL = os.getenv("DB_URL")  # Replace with your MongoDB URL
JWT_SECRET = os.getenv("JWT")   # Replace with a secure secret key
DB_NAME = os.getenv("NAME")

# MongoDB connection
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# Models
class ChatRoom(BaseModel):
    code: str
    link: str
    created_at: datetime.datetime
    expires_at: datetime.datetime
    messages: List[dict] = []

class Message(BaseModel):
    content: str
    sender: str
    timestamp: datetime.datetime

# Helper functions
def generate_room_code(length: int = 6) -> str:
    """Generate a random room code"""
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_short_link() -> str:
    """Generate a unique short link"""
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
    """Delete expired rooms"""
    while True:
        await db.rooms.delete_many({
            "expires_at": {"$lt": datetime.datetime.utcnow()}
        })
        await asyncio.sleep(86400)  # Run daily

# Routes remain the same
@app.post("/api/rooms/create")
async def create_room():
    """Create a new chat room"""
    code = generate_room_code()
    link = generate_short_link()
    
    # Ensure unique code and link
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
    
    await db.rooms.insert_one(room)
    return {"code": code, "link": link}

@app.get("/api/rooms/{room_code}")
async def get_room(room_code: str):
    """Get room details and messages"""
    room = await db.rooms.find_one({"code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    return room

@app.post("/api/rooms/{room_code}/extend")
async def extend_room(room_code: str):
    """Extend room expiration by 7 days"""
    result = await db.rooms.update_one(
        {"code": room_code},
        {"$set": {"expires_at": datetime.datetime.utcnow() + datetime.timedelta(days=7)}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Room not found")
    return {"message": "Room extended successfully"}

@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    """WebSocket endpoint for real-time chat"""
    await manager.connect(websocket, room_code)
    try:
        while True:
            data = await websocket.receive_json()
            message = {
                "content": data["content"],
                "sender": data["sender"],
                "timestamp": datetime.datetime.utcnow().isoformat()
            }
            
            # Store message in database
            await db.rooms.update_one(
                {"code": room_code},
                {"$push": {"messages": message}}
            )
            
            # Broadcast message to all connected clients
            await manager.broadcast(message, room_code)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)
