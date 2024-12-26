from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import secrets
import string
import asyncio
import os
import uvicorn
import aiohttp
import base64
from cryptography.fernet import Fernet
import json

# Configuration
MONGO_URL = os.getenv("DB_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("NAME", "sayit")
PORT = int(os.getenv("PORT", 10000))
APP_URL = os.getenv("APP_URL", "http://localhost:10000")
IMGBB_API_KEY = os.getenv("IMGBB_KEY")
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", Fernet.generate_key())  # Generate a key if not provided

# Initialize encryption
fernet = Fernet(ENCRYPTION_KEY)

app = FastAPI(title="Sayit Backend")

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

# Pydantic models
class Reaction(BaseModel):
    emoji: str
    count: int = 1
    users: List[str] = []

class Reply(BaseModel):
    original_message_id: str
    content: str
    sender: str
    timestamp: datetime

class Message(BaseModel):
    id: str = ""
    type: str
    content: str
    sender: str
    timestamp: datetime
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    reactions: Dict[str, Reaction] = {}
    replies: List[Reply] = []
    is_encrypted: bool = True

# WebSocket manager (existing code remains the same)
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_counts: Dict[str, int] = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
            self.user_counts[room_code] = 0
        self.active_connections[room_code].append(websocket)
        self.user_counts[room_code] += 1
        await self.broadcast_user_count(room_code)

    def disconnect(self, websocket: WebSocket, room_code: str):
        if room_code in self.active_connections:
            try:
                self.active_connections[room_code].remove(websocket)
                self.user_counts[room_code] -= 1
                if self.user_counts[room_code] <= 0:
                    del self.active_connections[room_code]
                    del self.user_counts[room_code]
                else:
                    asyncio.create_task(self.broadcast_user_count(room_code))
            except ValueError:
                pass

    async def broadcast_user_count(self, room_code: str):
        if room_code in self.active_connections:
            count = self.user_counts[room_code]
            await self.broadcast(
                {"type": "user_count", "count": count},
                room_code
            )

    async def broadcast(self, message: dict, room_code: str):
        if room_code in self.active_connections:
            disconnected = []
            for connection in self.active_connections[room_code]:
                try:
                    await connection.send_json(message)
                except WebSocketDisconnect:
                    disconnected.append(connection)
                except Exception:
                    disconnected.append(connection)
            
            for connection in disconnected:
                self.disconnect(connection, room_code)

manager = ConnectionManager()

# Utility functions
def generate_room_code(length: int = 6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_message_id() -> str:
    return ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))

async def upload_to_imgbb(file_content: bytes, filename: str) -> dict:
    url = f"https://api.imgbb.com/1/upload"
    params = {
        "key": IMGBB_API_KEY,
        "expiration": 600  # 10 minutes expiration
    }
    
    base64_image = base64.b64encode(file_content).decode('utf-8')
    data = aiohttp.FormData()
    data.add_field("image", base64_image)
    
    async with aiohttp.ClientSession() as session:
        async with session.post(url, params=params, data=data) as response:
            if response.status != 200:
                raise HTTPException(status_code=500, detail="Failed to upload media")
            result = await response.json()
            return result["data"]

def encrypt_message(content: str) -> str:
    return fernet.encrypt(content.encode()).decode()

def decrypt_message(content: str) -> str:
    return fernet.decrypt(content.encode()).decode()

# Background tasks
async def ping_self():
    async with aiohttp.ClientSession() as session:
        while True:
            try:
                async with session.get(f"{APP_URL}/") as response:
                    if response.status == 200:
                        print(f"Self-ping successful at {datetime.utcnow()}")
                    else:
                        print(f"Self-ping failed with status {response.status}")
            except Exception as e:
                print(f"Self-ping error: {e}")
            await asyncio.sleep(600)

async def cleanup_expired_rooms():
    while True:
        try:
            result = await db.rooms.delete_many({
                "expires_at": {"$lt": datetime.utcnow()}
            })
            print(f"Cleaned up {result.deleted_count} expired rooms")
            await asyncio.sleep(3600)
        except Exception as e:
            print(f"Error in cleanup task: {e}")
            await asyncio.sleep(300)

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    try:
        await db.rooms.drop_indexes()
    except Exception:
        pass
    
    await db.rooms.create_index([("code", 1)], unique=True)
    await db.rooms.create_index([("expires_at", 1)])
    
    app.state.cleanup_task = asyncio.create_task(cleanup_expired_rooms())
    app.state.ping_task = asyncio.create_task(ping_self())

@app.on_event("shutdown")
async def shutdown_event():
    if hasattr(app.state, 'cleanup_task'):
        app.state.cleanup_task.cancel()
    if hasattr(app.state, 'ping_task'):
        app.state.ping_task.cancel()

# API endpoints
@app.get("/")
async def root():
    return {
        "status": "healthy",
        "app": "Sayit",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/api/rooms/create")
async def create_room():
    max_attempts = 5
    for attempt in range(max_attempts):
        try:
            code = generate_room_code()
            room = {
                "code": code,
                "created_at": datetime.utcnow(),
                "expires_at": datetime.utcnow() + timedelta(days=1),
                "messages": []
            }
            
            await db.rooms.insert_one(room)
            return {"code": code}
        except Exception as e:
            if attempt == max_attempts - 1:
                raise HTTPException(status_code=500, detail="Failed to create room")
            continue

@app.get("/api/rooms/{room_code}")
async def get_room(room_code: str):
    room = await db.rooms.find_one({"code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Decrypt messages
    for message in room["messages"]:
        if message.get("is_encrypted", True):
            message["content"] = decrypt_message(message["content"])
            for reply in message.get("replies", []):
                reply["content"] = decrypt_message(reply["content"])
    
    room["_id"] = str(room["_id"])
    return room

@app.post("/api/rooms/{room_code}/upload")
async def upload_media(
    room_code: str,
    file: UploadFile = File(...),
    sender: str = Form(...)
):
    # Verify room exists
    room = await db.rooms.find_one({"code": room_code})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Check file size (32MB limit)
    file_size = 0
    file_content = bytearray()
    while chunk := await file.read(8192):
        file_size += len(chunk)
        file_content.extend(chunk)
        if file_size > 32 * 1024 * 1024:  # 32MB
            raise HTTPException(status_code=400, detail="File too large")
    
    # Upload to ImgBB
    try:
        upload_result = await upload_to_imgbb(bytes(file_content), file.filename)
        return {
            "url": upload_result["url"],
            "delete_url": upload_result.get("delete_url"),
            "type": file.content_type
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/api/rooms/{room_code}/messages/{message_id}/react")
async def react_to_message(
    room_code: str,
    message_id: str,
    emoji: str,
    user_id: str
):
    result = await db.rooms.update_one(
        {
            "code": room_code,
            "messages.id": message_id
        },
        {
            "$set": {
                "messages.$.reactions.emoji": {
                    "emoji": emoji,
                    "users": [user_id]
                }
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    
    await manager.broadcast(
        {
            "type": "reaction",
            "message_id": message_id,
            "emoji": emoji,
            "user_id": user_id
        },
        room_code
    )
    
    return {"status": "success"}

@app.post("/api/rooms/{room_code}/messages/{message_id}/reply")
async def reply_to_message(
    room_code: str,
    message_id: str,
    content: str,
    sender: str
):
    reply = Reply(
        original_message_id=message_id,
        content=encrypt_message(content),
        sender=sender,
        timestamp=datetime.utcnow()
    )
    
    result = await db.rooms.update_one(
        {
            "code": room_code,
            "messages.id": message_id
        },
        {
            "$push": {
                "messages.$.replies": reply.dict()
            }
        }
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Broadcast the reply
    reply_dict = reply.dict()
    reply_dict["content"] = decrypt_message(reply_dict["content"])
    await manager.broadcast(
        {
            "type": "reply",
            "message_id": message_id,
            "reply": reply_dict
        },
        room_code
    )
    
    return reply_dict

@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    await manager.connect(websocket, room_code)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "typing":
                await manager.broadcast(data, room_code)
            else:
                message = {
                    "id": generate_message_id(),
                    "type": "message",
                    "content": encrypt_message(data["content"]),
                    "sender": data["sender"],
                    "timestamp": datetime.utcnow().isoformat(),
                    "media_url": data.get("media_url"),
                    "media_type": data.get("media_type"),
                    "reactions": {},
                    "replies": [],
                    "is_encrypted": True
                }
                
                await db.rooms.update_one(
                    {"code": room_code},
                    {"$push": {"messages": message}}
                )
                
                # Decrypt before broadcasting
                broadcast_message = message.copy()
                broadcast_message["content"] = data["content"]
                await manager.broadcast(broadcast_message, room_code)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket, room_code)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=True)
